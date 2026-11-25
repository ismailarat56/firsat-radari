import { describe, expect, it } from 'vitest';
import { setup, feed, sourceInput } from './helper';
import type { Fetcher } from '../../apps/server/src/network/safe-fetch';
describe('decisions and explicit date confirmation', () => {
  it('completes activation when a decision precedes the third baseline', async () => {
    const t = await setup({
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
      for (let index = 0; index < 3; index++) {
        const source = (
          await t.post('/api/sources', {
            ...sourceInput,
            name: `Kaynak ${index}`,
            url: `https://source${index}.example.org/feed`,
          })
        ).body;
        const preview = (await t.post(`/api/sources/${source.id}/preview`)).body;
        await t.post(`/api/sources/${source.id}/baseline`, { previewId: preview.previewId });
        if (index === 0) {
          const item = (await t.get('/api/items')).body.items[0];
          await t.post(`/api/items/${item.id}/decisions`, { action: 'review' });
        }
        expect((await t.get('/api/settings')).body.onboardingComplete).toBe(index === 2);
      }
    } finally {
      t.close();
    }
  });
  it('requires irrelevant reason, confirms optimistically and preserves old confirmation after source changes', async () => {
    let body = feed('Son başvuru 24 Ekim 2026');
    const fetcher: Fetcher = async () => ({
      status: 200,
      body,
      url: sourceInput.url,
      contentType: 'text/xml',
      etag: null,
      lastModified: null,
    });
    const t = await setup({ fetcher });
    try {
      const s = (await t.post('/api/sources', sourceInput)).body;
      const p = (await t.post(`/api/sources/${s.id}/preview`)).body;
      await t.post(`/api/sources/${s.id}/baseline`, { previewId: p.previewId });
      const item = (await t.get('/api/items')).body.items[0];
      expect(item.confirmedDeadline).toBeNull();
      expect(
        (await t.post(`/api/items/${item.id}/decisions`, { action: 'irrelevant' })).status,
      ).toBe(422);
      expect(
        (await t.post(`/api/items/${item.id}/decisions`, { action: 'save' })).body.status,
      ).toBe('saved');
      const confirmation = {
        candidateId: item.deadlineCandidates[0].id,
        dateOnly: '2026-10-24',
        timezone: 'Europe/Istanbul',
        userSuppliedFields: [],
        expectedVersion: 0,
      };
      const confirmed = await t.post(`/api/items/${item.id}/deadline-confirmations`, confirmation);
      expect(confirmed.status).toBe(200);
      expect(confirmed.body.confirmedDeadline.version).toBe(1);
      expect(
        (await t.post(`/api/items/${item.id}/deadline-confirmations`, confirmation)).status,
      ).toBe(409);
      expect(
        (
          await t.post(`/api/items/${item.id}/deadline-confirmations`, {
            ...confirmation,
            dateOnly: '2026-02-30',
            expectedVersion: 1,
          })
        ).status,
      ).toBe(422);
      body = feed('Son başvuru 30 Ekim 2026');
      await t.app.locals.context.observations.check(s.id);
      const after = (await t.get('/api/items')).body.items[0];
      expect(after.confirmedDeadline.dateOnly).toBe('2026-10-24');
      expect(after.confirmedDeadline.reviewRequired).toBe(true);
      expect((await t.get('/api/summary')).body.confirmedDeadlineCount).toBe(1);
    } finally {
      t.close();
    }
  });
  it('requires user-supplied fields when adding a missing year or changing source evidence', async () => {
    const fetcher: Fetcher = async () => ({
      status: 200,
      body: feed('Son başvuru 24 Ekim'),
      url: sourceInput.url,
      contentType: 'text/xml',
      etag: null,
      lastModified: null,
    });
    const t = await setup({ fetcher });
    try {
      const s = (await t.post('/api/sources', sourceInput)).body;
      const p = (await t.post(`/api/sources/${s.id}/preview`)).body;
      await t.post(`/api/sources/${s.id}/baseline`, { previewId: p.previewId });
      const item = (await t.get('/api/items')).body.items[0];
      const confirm = {
        candidateId: item.deadlineCandidates[0].id,
        dateOnly: '2026-10-24',
        timezone: 'Europe/Istanbul',
        expectedVersion: 0,
      };
      expect((await t.post(`/api/items/${item.id}/deadline-confirmations`, confirm)).status).toBe(
        422,
      );
      expect(
        (
          await t.post(`/api/items/${item.id}/deadline-confirmations`, {
            ...confirm,
            userSuppliedFields: ['year'],
          })
        ).status,
      ).toBe(200);
    } finally {
      t.close();
    }
  });
});
