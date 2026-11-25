import { describe, expect, it } from 'vitest';
import { setup, request } from './helper';
describe('explicit, persistent demo', () => {
  it('seeds useful evidence only in demo and allows labeled same-origin entry', async () => {
    const t = await setup({ demo: true, now: () => new Date('2026-10-15T12:00:00Z') });
    try {
      const session = await request(t.app).get('/api/session').set('Host', '127.0.0.1:4318');
      expect(session.body).toEqual({ authenticated: false, demo: true });
      const agent = request.agent(t.app);
      expect(
        (
          await agent
            .post('/api/demo/session')
            .set('Host', '127.0.0.1:4318')
            .set('Origin', 'http://127.0.0.1:4318')
        ).status,
      ).toBe(403);
      expect(
        (
          await agent
            .post('/api/demo/session')
            .set('Host', '127.0.0.1:4318')
            .set('Origin', 'http://127.0.0.1:4318')
            .set('X-FR-Client', 'web')
        ).body.demo,
      ).toBe(true);
      const sources = (await t.get('/api/sources')).body.sources;
      expect(sources).toHaveLength(8);
      const items = (await t.get('/api/items')).body.items;
      expect(items).toHaveLength(12);
      expect(items.filter((i: any) => i.status === 'unread')).toHaveLength(6);
      expect(items.filter((i: any) => i.changeType === 'new')).toHaveLength(2);
      expect(items.filter((i: any) => i.confirmedDeadline)).toHaveLength(3);
      expect((await t.get(`/api/items/${items[0].id}/diff`)).body.before.content).toBeTruthy();
      expect((await t.get('/api/settings')).body.demo).toBe(true);
      await t.app.locals.context.scheduler.tick();
      expect(t.app.locals.context.db.prepare('SELECT id FROM jobs').all()).toHaveLength(0);
      const active = sources.find((s: any) => s.status === 'active');
      const queued = await t
        .post(`/api/sources/${active.id}/check`)
        .set('Idempotency-Key', 'demo-manual-one');
      expect(queued.status).toBe(202);
      await t.app.locals.context.scheduler.tick();
      expect((await t.get(`/api/jobs/${queued.body.id}`)).body.status).toBe('completed');
      expect((await t.get('/api/items')).body.items).toHaveLength(12);
    } finally {
      t.close();
    }
  });
});
