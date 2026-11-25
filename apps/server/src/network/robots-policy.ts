import robotsParser from 'robots-parser';
import { randomUUID } from 'node:crypto';
import type { DB } from '../db/database';
import { setting, setSetting } from '../db/database';
import { AppError } from '../errors';
import { safeFetch, type Fetcher, type TransportResponse, type FetchOptions } from './safe-fetch';
type Budget = { next_at: string; lease_until: string | null; owner: string | null };
type RobotsCache = { body: string; fetchedAt: string };
export function createPoliteFetcher(
  db: DB,
  now: () => Date,
  transportOptions: Pick<FetchOptions, 'resolve' | 'transport'> = {},
): Fetcher {
  const owner = randomUUID();
  const pendingRobots = new Map<string, Promise<void>>();
  async function acquire(url: URL) {
    for (;;) {
      const result = db.transaction(() => {
        const at = now();
        const row = db.prepare('SELECT * FROM network_budgets WHERE host=?').get(url.hostname) as
          Budget | undefined;
        const until = Math.max(
          row?.next_at ? Date.parse(row.next_at) : 0,
          row?.lease_until ? Date.parse(row.lease_until) : 0,
        );
        if (until > at.getTime()) return until - at.getTime();
        const delay = Math.max(10_000, setting<number>(db, `crawlDelay:${url.hostname}`, 10_000));
        db.prepare(
          'INSERT INTO network_budgets VALUES (?,?,?,?) ON CONFLICT(host) DO UPDATE SET next_at=excluded.next_at,lease_until=excluded.lease_until,owner=excluded.owner',
        ).run(
          url.hostname,
          new Date(at.getTime() + delay).toISOString(),
          new Date(at.getTime() + 35_000).toISOString(),
          owner,
        );
        return 0;
      })();
      if (!result) return;
      await new Promise<void>((resolve) => setTimeout(resolve, Math.min(1000, result)));
    }
  }
  function release(url: URL, response?: TransportResponse) {
    const delay = Math.max(10_000, setting<number>(db, `crawlDelay:${url.hostname}`, 10_000));
    db.prepare(
      'UPDATE network_budgets SET next_at=MAX(next_at,?),lease_until=NULL,owner=NULL WHERE host=? AND owner=?',
    ).run(new Date(now().getTime() + delay).toISOString(), url.hostname, owner);
    if (response) {
      const header = response.headers['retry-after'];
      if (header) {
        const delay = /^\d+$/.test(header)
          ? Number(header) * 1000
          : Date.parse(header) - now().getTime();
        if (delay > 0)
          db.prepare('UPDATE network_budgets SET next_at=MAX(next_at,?) WHERE host=?').run(
            new Date(now().getTime() + delay).toISOString(),
            url.hostname,
          );
      }
    }
  }
  async function fetchRaw(request: Parameters<Fetcher>[0], robotsRequest = false) {
    let last: URL | undefined;
    try {
      return await safeFetch(request, {
        ...transportOptions,
        beforeRequest: async (url) => {
          if (!robotsRequest) await enforceRobots(url);
          await acquire(url);
          last = url;
        },
        afterResponse: (url, result) => {
          release(url, result);
          last = undefined;
        },
      });
    } finally {
      if (last) release(last);
    }
  }
  async function updateRobots(url: URL) {
    const key = `robots:${url.origin}`;
    const existing = setting<RobotsCache | null>(db, key, null);
    if (existing && now().getTime() - Date.parse(existing.fetchedAt) <= 24 * 3600_000) return;
    let cache: RobotsCache;
    try {
      const result = await fetchRaw({ url: new URL('/robots.txt', url).href }, true);
      cache = { body: result.body || '', fetchedAt: now().toISOString() };
    } catch (error) {
      if ([404, 410].includes((error as { httpStatus?: number }).httpStatus || 0))
        cache = { body: '', fetchedAt: now().toISOString() };
      else
        throw new AppError(
          'ROBOTS_UNAVAILABLE',
          'robots.txt doğrulanamadı. Kaynak güvenli biçimde bekletiliyor.',
        );
    }
    setSetting(db, key, cache);
    const parser = robotsParser(new URL('/robots.txt', url).href, cache.body);
    const delay = Math.max(10_000, (parser.getCrawlDelay('FirsatRadari') || 10) * 1000);
    setSetting(db, `crawlDelay:${url.hostname}`, delay);
    db.prepare('UPDATE network_budgets SET next_at=MAX(next_at,?) WHERE host=?').run(
      new Date(now().getTime() + delay).toISOString(),
      url.hostname,
    );
  }
  async function enforceRobots(url: URL) {
    let pending = pendingRobots.get(url.origin);
    if (!pending) {
      pending = updateRobots(url);
      pendingRobots.set(url.origin, pending);
    }
    try {
      await pending;
    } finally {
      if (pendingRobots.get(url.origin) === pending) pendingRobots.delete(url.origin);
    }
    const cache = setting<RobotsCache | null>(db, `robots:${url.origin}`, null);
    if (!cache) throw new AppError('ROBOTS_UNAVAILABLE', 'robots.txt doğrulanamadı.');
    const robots = robotsParser(new URL('/robots.txt', url).href, cache.body);
    if (robots.isAllowed(url.href, 'FirsatRadari') === false)
      throw new AppError(
        'ACCESS_RESTRICTED',
        'Kaynak robots.txt kuralları bu bölgenin izlenmesine izin vermiyor.',
      );
  }
  return (request) => fetchRaw(request);
}
