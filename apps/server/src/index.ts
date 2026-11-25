import { listenLocal } from './listen';
import { createApp } from './app';
import { resolve } from 'node:path';
import express from 'express';
const port = Number(process.env.FR_PORT || 4318);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('FR_PORT 1024–65535 arası olmalıdır.');
const app = createApp({
  startScheduler: true,
  onPairingCode: (code) => console.log(`Yeni eşleştirme kodu: ${code} (10 dakika, tek kullanım)`),
  allowedOrigins: [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    'http://127.0.0.1:5173',
    'http://localhost:5173',
  ],
});
if (process.env.NODE_ENV === 'production') {
  const directory = resolve(process.cwd(), 'dist/web');
  app.use(express.static(directory, { index: 'index.html', maxAge: '1h' }));
  app.get('/{*path}', (_req, res) => res.sendFile(resolve(directory, 'index.html')));
}
const server = listenLocal(app, port);
function shutdown() {
  server.close(() => {
    app.locals.context.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGHUP', () => app.locals.context.rotatePairingCode());
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
