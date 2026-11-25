import { describe, expect, it } from 'vitest';
import { setup, sourceInput, feed } from './helper';
import { Scheduler } from '../../apps/server/src/jobs/scheduler';
import type { Fetcher } from '../../apps/server/src/network/safe-fetch';
const fetcher: Fetcher = async () => ({
  status: 200,
  body: feed('Son başvuru 24 Ekim 2026'),
  url: sourceInput.url,
  contentType: 'text/xml',
  etag: null,
  lastModified: null,
});
async function ready(t: Awaited<ReturnType<typeof setup>>, suffix: string) {
  const s = (await t.post('/api/sources', { ...sourceInput, url: `https://example.org/${suffix}` }))
    .body;
  const p = (await t.post(`/api/sources/${s.id}/preview`)).body;
  await t.post(`/api/sources/${s.id}/baseline`, { previewId: p.previewId });
  return s;
}
describe('persistent, polite scan queue', () => {
  it('deduplicates manual requests and spaces same-host sources by at least ten seconds', async () => {
    let clock = Date.UTC(2026, 9, 15, 12);
    const t = await setup({ fetcher, now: () => new Date(clock) });
    try {
      const a = await ready(t, 'one');
      const b = await ready(t, 'two');
      const starts: number[] = [];
      let active = 0,
        max = 0;
      let finish!: () => void;
      const scheduler = new Scheduler(
        t.app.locals.context.db,
        () => new Date(clock),
        async () => {
          active++;
          max = Math.max(max, active);
          starts.push(clock);
          await new Promise<void>((resolve) => (finish = resolve));
          active--;
        },
      );
      const one = scheduler.enqueue(a.id, 'request-one');
      expect(scheduler.enqueue(a.id, 'request-one').id).toBe(one.id);
      expect(scheduler.enqueue(a.id, 'request-two').id).toBe(one.id);
      const two = scheduler.enqueue(b.id, 'request-three');
      const tick = scheduler.tick();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(starts).toHaveLength(1);
      expect(max).toBe(1);
      finish();
      await tick;
      clock += 9000;
      await scheduler.tick();
      expect(starts).toHaveLength(1);
      clock += 1000;
      const next = scheduler.tick();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(starts).toHaveLength(2);
      finish();
      await next;
      expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(10000);
      expect(scheduler.get(two.id).status).toBe('completed');
    } finally {
      t.close();
    }
  });
  it('recovers expired leases without creating a second active job', async () => {
    const clock = Date.UTC(2026, 9, 15, 12);
    const t = await setup({ fetcher, now: () => new Date(clock) });
    try {
      const s = await ready(t, 'recover');
      let count = 0;
      const scheduler = new Scheduler(
        t.app.locals.context.db,
        () => new Date(clock),
        async () => {
          count++;
        },
      );
      const job = scheduler.enqueue(s.id, 'recovery');
      t.app.locals.context.db
        .prepare("UPDATE jobs SET status='running',lease_until=?,lease_owner='crashed' WHERE id=?")
        .run(new Date(clock - 1000).toISOString(), job.id);
      await scheduler.tick();
      expect(count).toBe(1);
      expect(scheduler.get(job.id).status).toBe('completed');
      await scheduler.tick();
      expect(count).toBe(1);
    } finally {
      t.close();
    }
  });
  it('persists Retry-After even when it exceeds exponential backoff', async () => {
    const clock = Date.UTC(2026, 9, 15, 12);
    const t = await setup({ fetcher, now: () => new Date(clock) });
    try {
      const s = await ready(t, 'retry');
      const scheduler = new Scheduler(
        t.app.locals.context.db,
        () => new Date(clock),
        async () => {
          throw Object.assign(new Error('retry'), { retryAfterMs: 120000, code: 'RETRY_AFTER' });
        },
      );
      const job = scheduler.enqueue(s.id, 'retry');
      await scheduler.tick();
      expect(new Date(scheduler.get(job.id).nextAttemptAt).getTime()).toBeGreaterThanOrEqual(
        clock + 120000,
      );
      expect(scheduler.get(job.id).delayReason).toContain('Kaynak');
    } finally {
      t.close();
    }
  });
});
