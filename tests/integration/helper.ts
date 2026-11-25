import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, type AppOptions } from '../../apps/server/src/app';
import supertest from 'supertest';
import { request as inject } from './http';
export const request =
  process.env.FR_REAL_HTTP === '1' ? supertest : (inject as unknown as typeof supertest);
export async function setup(options: AppOptions = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'fr-api-'));
  const app = createApp({ dataDir: directory, pairingCode: '12345678', ...options });
  const agent = request.agent(app);
  const result = await agent
    .post('/api/pair')
    .set('Host', '127.0.0.1:4318')
    .set('Origin', 'http://127.0.0.1:4318')
    .send({ code: '12345678' });
  const csrf = result.body.csrfToken;
  return {
    app,
    directory,
    agent,
    csrf,
    post: (path: string, body?: unknown) =>
      agent
        .post(path)
        .set('Host', '127.0.0.1:4318')
        .set('Origin', 'http://127.0.0.1:4318')
        .set('X-CSRF-Token', csrf)
        .send(body as object | undefined),
    get: (path: string) => agent.get(path).set('Host', '127.0.0.1:4318'),
    patch: (path: string, body: unknown) =>
      agent
        .patch(path)
        .set('Host', '127.0.0.1:4318')
        .set('Origin', 'http://127.0.0.1:4318')
        .set('X-CSRF-Token', csrf)
        .send(body as object | undefined),
    close: () => {
      app.locals.context.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
export const feed = (content: string, id = 'stable-1') =>
  `<rss><channel><title>Örnek</title><item><guid>${id}</guid><title>Araştırma Bursu</title><link>https://example.org/burs</link><description>${content}</description></item></channel></rss>`;
export const sourceInput = {
  name: 'Örnek kurum',
  url: 'https://example.org/feed',
  category: 'burs',
  keywords: ['araştırma'],
  intervalMinutes: 30,
};
