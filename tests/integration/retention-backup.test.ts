import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setup, feed, sourceInput } from './helper';
import { applyRetention } from '../../apps/server/src/storage/retention';
import type { Fetcher } from '../../apps/server/src/network/safe-fetch';
const fetcher: Fetcher = async () => ({
  status: 200,
  body: feed('Son başvuru 24 Ekim 2026'),
  url: sourceInput.url,
  contentType: 'text/xml',
  etag: null,
  lastModified: null,
});
describe('bounded evidence and verified restore', () => {
  it('removes the 31st unprotected snapshot and 91-day data but keeps decision evidence', async () => {
    const clock = Date.UTC(2026, 9, 15);
    const t = await setup({ fetcher, now: () => new Date(clock) });
    try {
      const s = (await t.post('/api/sources', sourceInput)).body;
      const p = (await t.post(`/api/sources/${s.id}/preview`)).body;
      await t.post(`/api/sources/${s.id}/baseline`, { previewId: p.previewId });
      const item = (await t.get('/api/items')).body.items[0];
      await t.post(`/api/items/${item.id}/decisions`, { action: 'save' });
      const db = t.app.locals.context.db;
      const template = db.prepare('SELECT * FROM snapshots LIMIT 1').get() as any;
      for (let i = 1; i <= 31; i++)
        db.prepare('INSERT INTO snapshots VALUES (?,?,?,?,?,?,?,?,?)').run(
          `snapshot-${i}`,
          s.id,
          1,
          1,
          new Date(clock - i * 1000).toISOString(),
          `hash-${i}`,
          template.document,
          null,
          null,
        );
      db.prepare('INSERT INTO snapshots VALUES (?,?,?,?,?,?,?,?,?)').run(
        'old',
        s.id,
        1,
        1,
        new Date(clock - 91 * 86400_000).toISOString(),
        'old',
        template.document,
        null,
        null,
      );
      expect(applyRetention(db, new Date(clock))).toBe(2);
      expect(db.prepare('SELECT id FROM snapshots').all()).toHaveLength(31);
      expect(db.prepare('SELECT id FROM snapshots WHERE id=?').get(template.id)).toBeTruthy();
      expect((await t.get(`/api/items/${item.id}/diff`)).status).toBe(200);
    } finally {
      t.close();
    }
  });
  it('creates a consistent backup, previews it and restores atomically with session invalidation', async () => {
    const t = await setup({ fetcher });
    try {
      const first = (await t.post('/api/sources', sourceInput)).body;
      const backup = await t.post('/api/backups');
      expect(backup.status).toBe(201);
      await t.post('/api/sources', { ...sourceInput, url: 'https://example.org/extra' });
      const preview = await t.post('/api/restore/preview', { backupId: backup.body.id });
      expect(preview.body.sourceCount).toBe(1);
      expect(
        (await t.post('/api/restore', { backupId: backup.body.id, confirmation: 'bad' })).status,
      ).toBe(422);
      expect((await t.get('/api/sources')).body.sources).toHaveLength(2);
      const restored = await t.post('/api/restore', {
        backupId: backup.body.id,
        confirmation: 'GERİ YÜKLE',
      });
      expect(restored.status).toBe(200);
      expect((await t.get('/api/sources')).status).toBe(401);
      expect(
        JSON.parse(
          t.app.locals.context.db.prepare('SELECT data FROM sources WHERE id=?').get(first.id).data,
        ).name,
      ).toBe('Örnek kurum');
      expect(t.app.locals.context.backups.list()).toHaveLength(2);
    } finally {
      t.close();
    }
  });
  it('rejects corrupt or traversing backups without changing current state', async () => {
    const t = await setup({ fetcher });
    try {
      await t.post('/api/sources', sourceInput);
      const backup = (await t.post('/api/backups')).body;
      writeFileSync(join(t.directory, 'backups', `${backup.id}.sqlite`), 'corrupted');
      expect((await t.post('/api/restore/preview', { backupId: backup.id })).status).toBe(422);
      expect((await t.post('/api/restore/preview', { backupId: '../../radar' })).status).toBe(422);
      expect((await t.get('/api/sources')).body.sources).toHaveLength(1);
    } finally {
      t.close();
    }
  });
});
describe('disk failure atomicity', () => {
  it('rolls back oversized writes on a full SQLite budget without changing existing evidence', async () => {
    const t = await setup({ fetcher });
    try {
      const source = (await t.post('/api/sources', sourceInput)).body;
      const p = (await t.post(`/api/sources/${source.id}/preview`)).body;
      const baseline = (
        await t.post(`/api/sources/${source.id}/baseline`, { previewId: p.previewId })
      ).body;
      const item = (await t.get('/api/items')).body.items[0];
      const db = t.app.locals.context.db;
      db.pragma(`max_page_count = ${db.pragma('page_count', { simple: true })}`);
      const { canonicalize } = await import('../../packages/shared/src/canonicalize');
      const huge = canonicalize({
        url: sourceInput.url,
        kind: 'rss',
        body: feed('Yeni içerik ' + 'x'.repeat(100_000)),
      });
      expect(() =>
        t.app.locals.context.observations.persist(
          baseline,
          huge,
          {
            status: 200,
            body: '',
            url: sourceInput.url,
            contentType: 'text/xml',
            etag: null,
            lastModified: null,
          },
          false,
          new Date(),
        ),
      ).toThrow();
      expect((await t.get(`/api/items/${item.id}/diff`)).body.after.content).toBe(item.content);
      expect((await t.get('/api/notifications')).body.notifications).toHaveLength(0);
    } finally {
      t.close();
    }
  });
});
describe('restore generation isolation', () => {
  it('rejects an in-flight preview fetched before restore instead of writing into restored state', async () => {
    let pending = false;
    let finish!: () => void;
    const adapter: Fetcher = async () => {
      if (pending) await new Promise<void>((r) => (finish = r));
      return {
        status: 200,
        body: feed(pending ? 'Stale post-restore content' : 'Başvuru 24 Ekim 2026'),
        url: sourceInput.url,
        contentType: 'text/xml',
        etag: null,
        lastModified: null,
      };
    };
    const t = await setup({ fetcher: adapter });
    try {
      const source = (await t.post('/api/sources', sourceInput)).body;
      const p = (await t.post(`/api/sources/${source.id}/preview`)).body;
      await t.post(`/api/sources/${source.id}/baseline`, { previewId: p.previewId });
      const backup = (await t.post('/api/backups')).body;
      pending = true;
      const late = t.app.locals.context.observations.preview(source.id);
      const handled = late.then(
        () => ({ ok: true }),
        () => ({ ok: false }),
      );
      await new Promise((r) => setTimeout(r, 0));
      await t.app.locals.context.backups.restore(backup.id, 'GERİ YÜKLE');
      finish();
      expect(await handled).toEqual({ ok: false });
      expect(t.app.locals.context.db.prepare('SELECT id FROM previews').all()).toHaveLength(0);
      expect(
        JSON.parse(t.app.locals.context.db.prepare('SELECT data FROM items').get().data).content,
      ).toContain('Başvuru 24 Ekim');
    } finally {
      t.close();
    }
  });
});
