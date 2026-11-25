import { performance } from 'node:perf_hooks';
import { cpus, platform, release, tmpdir, totalmem } from 'node:os';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setImmediate as yieldEventLoop } from 'node:timers/promises';
import type { createApp as CreateApp } from '../../apps/server/src/app';
import type { Fetcher } from '../../apps/server/src/network/safe-fetch';
import { request } from '../integration/http';

const moduleUrl = pathToFileURL(join(process.cwd(), 'dist/server/app.js')).href;
const { createApp } = (await import(moduleUrl)) as { createApp: typeof CreateApp };
const directory = mkdtempSync(join(tmpdir(), 'fr-bench-'));
let revision = 1;
const fetcher: Fetcher = async ({ url }) => ({
  status: 200,
  body: `<rss><channel><title>Benchmark fixture</title>${Array.from({ length: 20 }, (_, i) => `<item><guid>item-${i}</guid><title>Araştırma bursu ${i}</title><link>https://example.org/announcement/${i}</link><description>Araştırma ve eğitim için destek. Son başvuru ${revision === 1 ? 20 : 25} Kasım 2026. Başvuru belgelerini inceleyin.</description></item>`).join('')}</channel></rss>`,
  url,
  contentType: 'application/rss+xml',
  etag: null,
  lastModified: null,
});
const app = createApp({
  dataDir: directory,
  pairingCode: '87654321',
  fetcher,
  startScheduler: false,
});
const actor = request(app);
const origin = 'http://127.0.0.1:4318';
const pair = await actor.post('/api/pair').set('Origin', origin).send({ code: '87654321' });
const csrf = pair.body.csrfToken as string;
const post = (path: string, body?: unknown) =>
  actor.post(path).set('Origin', origin).set('X-CSRF-Token', csrf).send(body);
const counts = { sources: 50, itemsPerSource: 20 };
let failures = 0;
try {
  for (let i = 0; i < counts.sources; i++) {
    const created = await post('/api/sources', {
      name: `Benchmark kaynağı ${i + 1}`,
      url: `https://source${i}.example.org/feed`,
      category: i % 2 ? 'burs' : 'akademik',
      kind: 'rss',
      keywords: ['araştırma'],
      intervalMinutes: 360,
    });
    if (created.status !== 201) throw new Error(`Source setup failed: ${created.text}`);
    const preview = await post(`/api/sources/${created.body.id}/preview`);
    const baseline = await post(`/api/sources/${created.body.id}/baseline`, {
      previewId: preview.body.previewId,
    });
    if (baseline.status !== 200) throw new Error(`Baseline setup failed: ${baseline.text}`);
    await yieldEventLoop();
  }
  revision = 2;
  const sources = (await actor.get('/api/sources')).body.sources;
  for (const source of sources) await app.locals.context.observations.check(source.id);
  const items = (await actor.get('/api/items')).body.items;
  const warmups = 20,
    samples = 200;
  const cpuStart = process.cpuUsage();
  async function measure(path: string) {
    for (let i = 0; i < warmups; i++) {
      const result = await actor.get(path);
      if (result.status !== 200) throw new Error(`Warmup failed: ${result.status}`);
      await yieldEventLoop();
    }
    const results: number[] = [];
    for (let i = 0; i < samples; i++) {
      const started = performance.now();
      const result = await actor.get(path);
      results.push(performance.now() - started);
      if (result.status !== 200) failures++;
      // The injected transport finishes synchronously. Allow stream destruction/nextTick
      // cleanup between requests, as real socket requests would. This yield is not timed.
      await yieldEventLoop();
    }
    results.sort((a, b) => a - b);
    return {
      p50Ms: Number(results[Math.floor(samples * 0.5)].toFixed(3)),
      p95Ms: Number(results[Math.floor(samples * 0.95)].toFixed(3)),
      maxMs: Number(results.at(-1)!.toFixed(3)),
    };
  }
  const filteredList = await measure('/api/items?q=ara%C5%9Ft%C4%B1rma&category=burs');
  const diff = await measure(`/api/items/${items[0].id}/diff`);
  const cpu = process.cpuUsage(cpuStart);
  const report = {
    measuredAt: new Date().toISOString(),
    method:
      'Production esbuild server bundle; real Express/SQLite; in-process HTTP injection because socket creation is blocked. Browser and network transport EXCLUDED.',
    environment: {
      node: process.version,
      os: `${platform()} ${release()}`,
      cpu: cpus()[0]?.model,
      logicalCpus: cpus().length,
      totalMemoryGiB: Number((totalmem() / 1024 ** 3).toFixed(2)),
    },
    dataset: {
      sources: sources.length,
      items: items.length,
      snapshots: (
        app.locals.context.db.prepare('SELECT COUNT(*) AS n FROM snapshots').get() as { n: number }
      ).n,
    },
    warmupsPerOperation: warmups,
    samplesPerOperation: samples,
    filteredList,
    diff,
    failures,
    process: {
      scope:
        'Only the benchmark Node process containing Express/SQLite; browser and external collectors excluded.',
      rssMiB: Number((process.memoryUsage().rss / 1024 ** 2).toFixed(2)),
      heapUsedMiB: Number((process.memoryUsage().heapUsed / 1024 ** 2).toFixed(2)),
      peakRssMiB: Number((process.resourceUsage().maxRSS / 1024).toFixed(2)),
      cpuUserMs: cpu.user / 1000,
      cpuSystemMs: cpu.system / 1000,
    },
    target:
      'p95 < 300 ms; these handler measurements do not certify socket/network/browser latency.',
  };
  mkdirSync('artifacts', { recursive: true });
  writeFileSync('artifacts/benchmark.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (failures) process.exitCode = 1;
} finally {
  app.locals.context.close();
  rmSync(directory, { recursive: true, force: true });
}
