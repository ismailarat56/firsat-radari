import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../../apps/server/src/db/database';
import { createPoliteFetcher } from '../../apps/server/src/network/robots-policy';
import type { Transport, TransportResponse } from '../../apps/server/src/network/safe-fetch';
afterEach(() => vi.useRealTimers());
const resolve = async () => [{ address: '93.184.216.34', family: 4 }];
describe('robots and host request policy', () => {
  it('checks redirected destination robots before connecting to restricted content', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T12:00:00Z'));
    const directory = mkdtempSync(join(tmpdir(), 'fr-robots-'));
    const db = openDatabase(directory);
    try {
      const seen: string[] = [];
      const transport: Transport = async (request): Promise<TransportResponse> => {
        seen.push(request.url.href);
        if (request.url.pathname === '/robots.txt')
          return {
            status: 200,
            headers: { 'content-type': 'text/plain' },
            body: Buffer.from(
              request.url.hostname === 'target.example.org'
                ? 'User-agent: *\nDisallow: /private'
                : 'User-agent: *\nAllow: /',
            ),
          };
        return {
          status: 302,
          headers: { location: 'https://target.example.org/private' },
          body: Buffer.alloc(0),
        };
      };
      const fetch = createPoliteFetcher(db, () => new Date(), { resolve, transport });
      const pending = expect(fetch({ url: 'https://example.org/feed' })).rejects.toMatchObject({
        code: 'ACCESS_RESTRICTED',
      });
      await vi.advanceTimersByTimeAsync(12_000);
      await pending;
      expect(seen).toEqual([
        'https://example.org/robots.txt',
        'https://example.org/feed',
        'https://target.example.org/robots.txt',
      ]);
    } finally {
      db.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it('honors a forty-second crawl delay without exhausting network timeout while queued', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T12:00:00Z'));
    const directory = mkdtempSync(join(tmpdir(), 'fr-delay-'));
    const db = openDatabase(directory);
    try {
      let timeout = 0;
      const starts: number[] = [];
      const transport: Transport = async (request): Promise<TransportResponse> => {
        starts.push(Date.now());
        if (request.url.pathname === '/robots.txt')
          return {
            status: 200,
            headers: { 'content-type': 'text/plain' },
            body: Buffer.from('User-agent: *\nAllow: /\nCrawl-delay: 40'),
          };
        timeout = request.timeoutMs;
        return {
          status: 200,
          headers: { 'content-type': 'text/xml' },
          body: Buffer.from('<rss><channel><title>Public</title></channel></rss>'),
        };
      };
      const fetch = createPoliteFetcher(db, () => new Date(), { resolve, transport });
      const pending = fetch({ url: 'https://example.org/feed' });
      await vi.advanceTimersByTimeAsync(41_000);
      expect((await pending).status).toBe(200);
      expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(40_000);
      expect(timeout).toBeGreaterThan(29_000);
    } finally {
      db.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
