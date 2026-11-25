import { createApp } from '../../apps/server/src/app';
import express from 'express';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import type { Fetcher } from '../../apps/server/src/network/safe-fetch';
if (process.env.FR_E2E !== '1')
  throw new Error('Bu sunucu yalnız FR_E2E=1 test ortamında çalışır.');
const directory = mkdtempSync(join(tmpdir(), 'fr-browser-'));
let version = 1;
const fetcher: Fetcher = async (request) => ({
  status: 200,
  url: request.url,
  contentType: 'application/rss+xml',
  etag: `"v${version}"`,
  lastModified: null,
  body: `<rss><channel><title>Kontrollü test kaynağı</title><item><guid>stable-id</guid><title>Araştırma Bursu — ${new URL(request.url).hostname}</title><link>https://example.org/burs</link><description>Öğrenciler için araştırma bursu. Son başvuru ${version === 1 ? '24' : '30'} Kasım 2026. ${version === 1 ? 'İlk başvuru koşulları.' : 'Başvuru süresi uzatıldı.'}</description></item></channel></rss>`,
});
const app = createApp({
  dataDir: directory,
  demo: false,
  pairingCode: '65432100',
  fetcher,
  startScheduler: true,
  allowedOrigins: ['http://127.0.0.1:4329'],
});
app.post('/__fixture/change', (_req, res) => {
  version++;
  res.json({ version });
});
app.use(express.static(resolve('dist/web')));
const server = app.listen(4329, '127.0.0.1', (error?: Error) => {
  if (error) {
    console.error(`E2E sunucusu başlatılamadı: ${error.message}`);
    app.locals.context.close();
    rmSync(directory, { recursive: true, force: true });
    process.exit(1);
  }
  console.log('E2E fixture: http://127.0.0.1:4329');
});
const demoDirectory = mkdtempSync(join(tmpdir(), 'fr-browser-demo-'));
const demoApp = createApp({
  dataDir: demoDirectory,
  demo: true,
  startScheduler: false,
  allowedOrigins: ['http://127.0.0.1:4330'],
});
demoApp.use(express.static(resolve('dist/web')));
const demoServer = demoApp.listen(4330, '127.0.0.1');
const close = () => {
  server.close();
  demoServer.close();
  demoApp.locals.context.close();
  rmSync(demoDirectory, { recursive: true, force: true });
  app.locals.context.close();
  rmSync(directory, { recursive: true, force: true });
  process.exit(0);
};
process.on('SIGTERM', close);
process.on('SIGINT', close);
