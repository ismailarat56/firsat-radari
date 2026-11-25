import type { Express } from 'express';
export function listenLocal(
  app: Express,
  port: number,
  report = {
    log: console.log,
    error: console.error,
    onFailure: () => {
      process.exitCode = 1;
    },
  },
) {
  return app.listen(port, '127.0.0.1', (error?: Error) => {
    if (error) {
      report.error(
        `Fırsat Radarı başlatılamadı (${(error as NodeJS.ErrnoException).code || 'LISTEN_ERROR'}). Yerel portu ve çalışma ortamı izinlerini kontrol edin.`,
      );
      app.locals.context.close();
      report.onFailure();
      return;
    }
    report.log(`\nFırsat Radarı: http://127.0.0.1:${port}`);
    if (app.locals.context.demo) report.log('DEMO · Örnek veriler; canlı kurum gözlemi değildir.');
    else report.log(`Eşleştirme kodu: ${app.locals.context.pairingCode} (10 dakika, tek kullanım)`);
    report.log(`Veri dizini: ${app.locals.context.dataDir}\n`);
  });
}
