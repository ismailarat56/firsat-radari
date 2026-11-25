import { afterEach, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import { request as inject } from './http';
const request =
  process.env.FR_REAL_HTTP === '1' ? supertest : (inject as unknown as typeof supertest);
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../apps/server/src/app';

const roots: string[] = [];
const apps: ReturnType<typeof createApp>[] = [];
function setup(options = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'fr-sources-'));
  roots.push(dataDir);
  const app = createApp({
    dataDir,
    pairingCode: '12345678',
    allowedOrigins: ['http://127.0.0.1:4318'],
    ...options,
  });
  apps.push(app);
  return { app, dataDir };
}
function api(app: ReturnType<typeof createApp>) {
  return request.agent(app);
}
async function pair(agent: ReturnType<typeof api>) {
  return agent
    .post('/api/pair')
    .set('Host', '127.0.0.1:4318')
    .set('Origin', 'http://127.0.0.1:4318')
    .send({ code: '12345678' });
}
const input = {
  name: 'Örnek üniversite',
  url: 'https://example.org/feed',
  category: 'burs',
  intervalMinutes: 30,
};
afterEach(() => {
  for (const app of apps.splice(0)) app.locals.context.close();
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});
describe('pairing and persistent sources', () => {
  it('requires pairing for protected reads and writes', async () => {
    const { app } = setup();
    expect(
      (await request(app).post('/api/sources').set('Host', '127.0.0.1:4318').send(input)).status,
    ).toBe(401);
    expect((await request(app).get('/api/sources').set('Host', '127.0.0.1:4318')).status).toBe(401);
  });
  it('uses one-use pairing, HttpOnly cookies, CSRF and logout revocation', async () => {
    const { app } = setup();
    const agent = api(app);
    const result = await pair(agent);
    expect(result.status).toBe(200);
    expect(result.body.csrfToken).toBeTruthy();
    expect(result.headers['set-cookie'][0]).toContain('HttpOnly');
    expect((await pair(api(app))).status).toBe(401);
    expect(
      (
        await agent
          .post('/api/sources')
          .set('Host', '127.0.0.1:4318')
          .set('Origin', 'http://127.0.0.1:4318')
          .send(input)
      ).status,
    ).toBe(403);
    expect(
      (
        await agent
          .post('/api/logout')
          .set('Host', '127.0.0.1:4318')
          .set('Origin', 'http://127.0.0.1:4318')
          .set('X-CSRF-Token', result.body.csrfToken)
      ).status,
    ).toBe(204);
    expect((await agent.get('/api/sources').set('Host', '127.0.0.1:4318')).status).toBe(401);
  });
  it('rejects hostile host and origin and has no normal-mode demo bypass', async () => {
    const { app } = setup();
    expect(
      (await request(app).post('/api/pair').set('Host', 'evil.test').send({ code: '12345678' }))
        .status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/pair')
          .set('Host', '127.0.0.1:4318')
          .set('Origin', 'https://evil.test')
          .send({ code: '12345678' })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/demo/session')
          .set('Host', '127.0.0.1:4318')
          .set('Origin', 'http://127.0.0.1:4318')
          .set('X-FR-Client', 'web')
      ).status,
    ).toBe(404);
  });
  it('enforces minimum interval and the fifty-source limit', async () => {
    const { app } = setup();
    const agent = api(app);
    const p = await pair(agent);
    const add = (body: object) =>
      agent
        .post('/api/sources')
        .set('Host', '127.0.0.1:4318')
        .set('Origin', 'http://127.0.0.1:4318')
        .set('X-CSRF-Token', p.body.csrfToken)
        .send(body);
    expect((await add({ ...input, intervalMinutes: 29 })).status).toBe(422);
    for (let i = 0; i < 50; i++)
      expect((await add({ ...input, url: `https://example.org/feed/${i}` })).status).toBe(201);
    expect((await add({ ...input, url: 'https://example.org/extra' })).status).toBe(422);
  });
  it('persists sources over reopen and requires a fresh baseline after selector edits', async () => {
    const { app, dataDir } = setup();
    const agent = api(app);
    const p = await pair(agent);
    const added = await agent
      .post('/api/sources')
      .set('Host', '127.0.0.1:4318')
      .set('Origin', 'http://127.0.0.1:4318')
      .set('X-CSRF-Token', p.body.csrfToken)
      .send(input);
    expect(added.status).toBe(201);
    expect(added.body.baselineRequired).toBe(true);
    app.locals.context.close();
    const reopened = createApp({
      dataDir,
      pairingCode: '12345678',
      allowedOrigins: ['http://127.0.0.1:4318'],
    });
    apps.push(reopened);
    const agent2 = api(reopened);
    const p2 = await pair(agent2);
    const list = await agent2.get('/api/sources').set('Host', '127.0.0.1:4318');
    expect(list.body.sources).toHaveLength(1);
    const edit = await agent2
      .patch(`/api/sources/${added.body.id}`)
      .set('Host', '127.0.0.1:4318')
      .set('Origin', 'http://127.0.0.1:4318')
      .set('X-CSRF-Token', p2.body.csrfToken)
      .send({ kind: 'html', selector: '.announcements' });
    expect(edit.body.configVersion).toBe(2);
    expect(edit.body.baselineRequired).toBe(true);
  });
  it('expires pairing codes and limits failed guesses', async () => {
    let now = Date.UTC(2026, 9, 15);
    const { app } = setup({ now: () => new Date(now) });
    now += 11 * 60_000;
    expect((await pair(api(app))).status).toBe(401);
    for (let attempt = 0; attempt < 4; attempt++) {
      expect((await pair(api(app))).status).toBe(401);
    }
    expect((await pair(api(app))).status).toBe(429);
    now += 60_001;
    expect((await pair(api(app))).status).toBe(401);
  });
});
describe('pairing lifecycle', () => {
  it('issues a fresh terminal code after logout without exposing it in the response', async () => {
    const { app } = setup();
    const agent = api(app);
    const p = await pair(agent);
    const loggedOut = await agent
      .post('/api/logout')
      .set('Host', '127.0.0.1:4318')
      .set('Origin', 'http://127.0.0.1:4318')
      .set('X-CSRF-Token', p.body.csrfToken);
    expect(loggedOut.status).toBe(204);
    const nextCode = app.locals.context.pairingCode;
    expect(nextCode).not.toBe('12345678');
    const next = await agent
      .post('/api/pair')
      .set('Host', '127.0.0.1:4318')
      .set('Origin', 'http://127.0.0.1:4318')
      .send({ code: nextCode });
    expect(next.body.authenticated).toBe(true);
  });
});
describe('resume scheduling', () => {
  it('gives a resumed baseline source a new concrete scan time', async () => {
    const { app } = setup();
    const agent = api(app);
    const session = await pair(agent);
    const create = await agent
      .post('/api/sources')
      .set('Host', '127.0.0.1:4318')
      .set('Origin', 'http://127.0.0.1:4318')
      .set('X-CSRF-Token', session.body.csrfToken)
      .send(input);
    const source = create.body;
    app.locals.context.db.prepare('UPDATE sources SET data=? WHERE id=?').run(
      JSON.stringify({
        ...source,
        baselineRequired: false,
        enabled: false,
        status: 'paused',
        nextCheckAt: null,
      }),
      source.id,
    );
    const resumed = await agent
      .patch(`/api/sources/${source.id}`)
      .set('Host', '127.0.0.1:4318')
      .set('Origin', 'http://127.0.0.1:4318')
      .set('X-CSRF-Token', session.body.csrfToken)
      .send({ enabled: true });
    expect(resumed.body.nextCheckAt).toMatch(/^\d{4}-/);
    expect(resumed.body.status).toBe('active');
  });
});
