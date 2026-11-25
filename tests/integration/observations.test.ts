import { describe, expect, it } from 'vitest';
import { setup, feed, sourceInput } from './helper';
import type { Fetcher } from '../../apps/server/src/network/safe-fetch';
describe('source preview errors', () => {
  const html =
    '<!doctype html><html><head><meta charset="utf-8"><title>Duyurular</title></head><body><main class="announcements"><article><h2>Yeni staj programı</h2><a href="/staj">Başvuru</a></article></main></body></html>';
  const fetcher: Fetcher = async ({ url }) => ({
    status: 200,
    body: html,
    url,
    contentType: 'text/html; charset=utf-8',
    etag: null,
    lastModified: null,
  });

  it('explains a web page added as RSS and lets the saved source recover with an HTML selector', async () => {
    const t = await setup({ fetcher });
    try {
      const added = await t.post('/api/sources', sourceInput);
      expect(added.status).toBe(201);
      const source = added.body;
      const failed = await t.post(`/api/sources/${source.id}/preview`);
      expect(failed.status).toBe(422);
      expect(failed.body.error.code).toBe('XML_INVALID');
      expect(failed.body.error.message).toContain('Statik web sayfası');
      expect((await t.get('/api/sources')).body.sources).toEqual([
        expect.objectContaining({ id: source.id, kind: 'rss', baselineRequired: true }),
      ]);
      expect((await t.get('/api/items')).body.items).toHaveLength(0);
      expect(t.app.locals.context.db.prepare('SELECT id FROM previews').all()).toHaveLength(0);

      const corrected = await t.patch(`/api/sources/${source.id}`, {
        kind: 'html',
        selector: '.announcements',
      });
      expect(corrected.status).toBe(200);
      const preview = await t.post(`/api/sources/${source.id}/preview`);
      expect(preview.status).toBe(200);
      expect(preview.body.itemCount).toBe(1);
      expect(preview.body.items[0]).toMatchObject({
        title: 'Yeni staj programı',
        url: 'https://example.org/staj',
      });
    } finally {
      t.close();
    }
  });

  it('returns the content error when the selected HTML region does not exist', async () => {
    const t = await setup({ fetcher });
    try {
      const source = (
        await t.post('/api/sources', { ...sourceInput, kind: 'html', selector: '.missing' })
      ).body;
      const preview = await t.post(`/api/sources/${source.id}/preview`);
      expect(preview.status).toBe(422);
      expect(preview.body.error).toMatchObject({
        code: 'SELECTOR_EMPTY',
        message: expect.stringContaining('Seçilen bölge bulunamadı'),
      });
    } finally {
      t.close();
    }
  });
});
describe('baseline and immutable observations', () => {
  it('separates preview from confirmation, creates no initial alerts and updates the same item', async () => {
    let body = feed('Son başvuru 24 Ekim 2026');
    const fetcher: Fetcher = async () => ({
      status: 200,
      body,
      url: sourceInput.url,
      contentType: 'application/rss+xml',
      etag: 'x',
      lastModified: null,
    });
    const t = await setup({ fetcher });
    try {
      const source = (await t.post('/api/sources', sourceInput)).body;
      const preview = await t.post(`/api/sources/${source.id}/preview`);
      expect(preview.status).toBe(200);
      expect((await t.get('/api/items')).body.items).toHaveLength(0);
      const baseline = await t.post(`/api/sources/${source.id}/baseline`, {
        previewId: preview.body.previewId,
      });
      expect(baseline.body.baselineRequired).toBe(false);
      expect((await t.get('/api/notifications')).body.notifications).toHaveLength(0);
      const before = (await t.get('/api/items')).body.items[0];
      body = feed('Son başvuru 30 Ekim 2026');
      await t.app.locals.context.observations.check(source.id);
      const after = (await t.get('/api/items')).body.items;
      expect(after).toHaveLength(1);
      expect(after[0].id).toBe(before.id);
      expect(after[0].status).toBe('unread');
      const diff = (await t.get(`/api/items/${before.id}/diff`)).body;
      expect(diff.before.content).toContain('24 Ekim');
      expect(diff.after.content).toContain('30 Ekim');
      expect((await t.get('/api/notifications')).body.notifications).toHaveLength(1);
      await t.app.locals.context.observations.check(source.id);
      expect((await t.get('/api/notifications')).body.notifications).toHaveLength(1);
    } finally {
      t.close();
    }
  });
  it('preserves the last valid image after 304, CAPTCHA and network errors', async () => {
    let mode = 'ok';
    const fetcher: Fetcher = async () => {
      if (mode === 'error') throw new Error('offline');
      return {
        status: mode === '304' ? 304 : 200,
        body:
          mode === '304'
            ? null
            : mode === 'captcha'
              ? '<html>captcha verify you are human</html>'
              : feed('Başvuru 24 Ekim 2026'),
        url: sourceInput.url,
        contentType: 'application/rss+xml',
        etag: 'x',
        lastModified: null,
      };
    };
    const t = await setup({ fetcher });
    try {
      const source = (await t.post('/api/sources', sourceInput)).body;
      const preview = (await t.post(`/api/sources/${source.id}/preview`)).body;
      await t.post(`/api/sources/${source.id}/baseline`, { previewId: preview.previewId });
      const original = (await t.get('/api/items')).body.items[0];
      for (const next of ['304', 'captcha', 'error']) {
        mode = next;
        await t.app.locals.context.observations.check(source.id);
      }
      expect((await t.get('/api/items')).body.items[0].content).toBe(original.content);
      expect((await t.get('/api/notifications')).body.notifications).toHaveLength(0);
      const obs = (await t.get(`/api/sources/${source.id}/observations`)).body.observations;
      expect(obs.map((o: any) => o.status)).toContain('unchanged');
      expect(obs.map((o: any) => o.status)).toContain('restricted');
      expect(obs.map((o: any) => o.status)).toContain('unreachable');
    } finally {
      t.close();
    }
  });
});
describe('configuration race safety', () => {
  it('does not commit a response fetched for a previous configuration', async () => {
    let release!: () => void;
    let pending = false;
    const fetcher: Fetcher = async () => {
      if (pending) await new Promise<void>((r) => (release = r));
      return {
        status: 200,
        body: feed('Son başvuru 24 Ekim 2026'),
        url: sourceInput.url,
        contentType: 'text/xml',
        etag: null,
        lastModified: null,
      };
    };
    const t = await setup({ fetcher });
    try {
      const source = (await t.post('/api/sources', sourceInput)).body;
      const p = (await t.post(`/api/sources/${source.id}/preview`)).body;
      await t.post(`/api/sources/${source.id}/baseline`, { previewId: p.previewId });
      pending = true;
      const scan = t.app.locals.context.observations.check(source.id);
      await new Promise((r) => setTimeout(r, 0));
      await t.patch(`/api/sources/${source.id}`, { url: 'https://example.org/new-feed' });
      release();
      await scan;
      const stored = (await t.get('/api/sources')).body.sources[0];
      expect(stored.configVersion).toBe(2);
      expect(stored.baselineRequired).toBe(true);
      expect(stored.url).toBe('https://example.org/new-feed');
      expect(t.app.locals.context.db.prepare('SELECT id FROM snapshots').all()).toHaveLength(1);
    } finally {
      t.close();
    }
  });
});
describe('source lifecycle', () => {
  it('keeps saved opportunities, confirmed dates and reminders after stopping source tracking', async () => {
    const t = await setup({
      now: () => new Date('2026-10-22T12:00:00Z'),
      fetcher: async ({ url }) => ({
        status: 200,
        body: feed('Son başvuru 24 Ekim 2026'),
        url,
        contentType: 'text/xml',
        etag: null,
        lastModified: null,
      }),
    });
    try {
      const source = (await t.post('/api/sources', sourceInput)).body;
      const preview = (await t.post(`/api/sources/${source.id}/preview`)).body;
      await t.post(`/api/sources/${source.id}/baseline`, { previewId: preview.previewId });
      const item = (await t.get('/api/items')).body.items[0];
      await t.post(`/api/items/${item.id}/decisions`, { action: 'save' });
      await t.post(`/api/items/${item.id}/deadline-confirmations`, {
        candidateId: item.deadlineCandidates[0].id,
        dateOnly: '2026-10-24',
        timezone: 'Europe/Istanbul',
        userSuppliedFields: [],
        expectedVersion: 0,
      });
      const removed = await t.agent
        .delete(`/api/sources/${source.id}`)
        .set('Host', '127.0.0.1:4318')
        .set('Origin', 'http://127.0.0.1:4318')
        .set('X-CSRF-Token', t.csrf);
      expect(removed.status).toBe(204);
      expect((await t.get('/api/sources')).body.sources).toHaveLength(0);
      expect((await t.get('/api/items')).body.items[0]).toMatchObject({
        id: item.id,
        status: 'saved',
        confirmedDeadline: { dateOnly: '2026-10-24' },
      });
      expect((await t.get('/api/summary')).body).toMatchObject({
        sourceCount: 0,
        savedCount: 1,
        confirmedDeadlineCount: 1,
      });
      expect((await t.get('/api/notifications')).body.notifications).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ title: 'Onaylı son tarih yaklaşıyor', itemId: item.id }),
        ]),
      );
      expect((await t.get(`/api/items/${item.id}/diff`)).status).toBe(200);
    } finally {
      t.close();
    }
  });
  it('cancels queued work and refuses archived source collection while retaining decision evidence', async () => {
    const fetcher: Fetcher = async () => ({
      status: 200,
      body: feed('Son başvuru 24 Ekim 2026'),
      url: sourceInput.url,
      contentType: 'text/xml',
      etag: null,
      lastModified: null,
    });
    const t = await setup({ fetcher });
    try {
      const source = (await t.post('/api/sources', sourceInput)).body;
      const p = (await t.post(`/api/sources/${source.id}/preview`)).body;
      await t.post(`/api/sources/${source.id}/baseline`, { previewId: p.previewId });
      const item = (await t.get('/api/items')).body.items[0];
      await t.post(`/api/items/${item.id}/decisions`, { action: 'save' });
      const job = (
        await t.post(`/api/sources/${source.id}/check`).set('Idempotency-Key', 'archive-job')
      ).body;
      const deleted = await t.agent
        .delete(`/api/sources/${source.id}`)
        .set('Host', '127.0.0.1:4318')
        .set('Origin', 'http://127.0.0.1:4318')
        .set('X-CSRF-Token', t.csrf);
      expect(deleted.status).toBe(204);
      expect((await t.get(`/api/jobs/${job.id}`)).body.status).toBe('failed');
      expect((await t.post(`/api/sources/${source.id}/preview`)).status).toBe(404);
      expect((await t.get(`/api/items/${item.id}/diff`)).status).toBe(200);
    } finally {
      t.close();
    }
  });
});
describe('unchanged baseline retention', () => {
  it('refreshes old identical evidence without a false change or lost baseline after ninety days', async () => {
    let clock = Date.UTC(2026, 9, 15, 12);
    const fetcher: Fetcher = async () => ({
      status: 200,
      body: feed('Son başvuru 24 Ekim 2026'),
      url: sourceInput.url,
      contentType: 'text/xml',
      etag: null,
      lastModified: null,
    });
    const t = await setup({ fetcher, now: () => new Date(clock) });
    try {
      const source = (await t.post('/api/sources', sourceInput)).body;
      const p = (await t.post(`/api/sources/${source.id}/preview`)).body;
      await t.post(`/api/sources/${source.id}/baseline`, { previewId: p.previewId });
      clock += 91 * 86400_000;
      await t.app.locals.context.observations.check(source.id);
      expect(t.app.locals.context.db.prepare('SELECT id FROM snapshots').all()).toHaveLength(1);
      await t.app.locals.context.observations.check(source.id);
      await t.get('/api/session');
      await t.agent
        .post('/api/pair')
        .set('Host', '127.0.0.1:4318')
        .set('Origin', 'http://127.0.0.1:4318')
        .send({ code: t.app.locals.context.pairingCode });
      expect((await t.get('/api/sources')).body.sources[0].baselineRequired).toBe(false);
      expect((await t.get('/api/notifications')).body.notifications).toHaveLength(0);
      const item = (await t.get('/api/items')).body.items[0];
      expect((await t.get(`/api/items/${item.id}/diff`)).status).toBe(200);
    } finally {
      t.close();
    }
  });
});
