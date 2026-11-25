import express, { type ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { dataDirectory, openDatabase, ensureDataMode } from './db/database';
import { createAuth } from './auth/session';
import { AppError } from './errors';
import { ContentError } from '../../../packages/shared/src/canonicalize';
import { seedDemo, createDemoFetcher } from './db/demo';
import { backupService } from './storage/backup';
import { Scheduler } from './jobs/scheduler';
import { decide, confirmDeadline } from './modules/decisions/service';
import { getSettings, patchSettings } from './storage/settings';
import { getSummary, dailyReminders } from './modules/notifications/summary';
import { putJson, readJson } from './db/database';
import { createPoliteFetcher } from './network/robots-policy';
import { type Fetcher } from './network/safe-fetch';
import { observationService } from './modules/observations/service';
import { listItems, itemDiff } from './modules/items/service';
import { listNotifications } from './modules/notifications/service';
import { getSource, listSources, saveSource } from './modules/sources/service';
export type AppOptions = {
  dataDir?: string;
  demo?: boolean;
  pairingCode?: string;
  now?: () => Date;
  allowedOrigins?: string[];
  startScheduler?: boolean;
  fetcher?: Fetcher;
  onPairingCode?: (code: string) => void;
};
export function createApp(options: AppOptions = {}) {
  const now = options.now || (() => new Date());
  const demo = options.demo ?? process.env.FR_DEMO === '1';
  const dataDir = dataDirectory(options.dataDir, demo);
  const db = openDatabase(dataDir);
  try {
    ensureDataMode(db, demo);
  } catch (error) {
    db.close();
    throw error;
  }
  const app = express();
  app.disable('x-powered-by');
  const auth = createAuth(db, {
    demo,
    pairingCode: options.pairingCode,
    now,
    onPairingCode: options.onPairingCode,
    allowedOrigins: options.allowedOrigins || [
      'http://127.0.0.1:4318',
      'http://localhost:4318',
      'http://127.0.0.1:5173',
      'http://localhost:5173',
    ],
  });
  const liveFetcher = options.fetcher || createPoliteFetcher(db, now);
  const observations = observationService(
    db,
    demo && !options.fetcher ? createDemoFetcher(db, now, liveFetcher) : liveFetcher,
    now,
  );
  if (demo) seedDemo(db, observations, now);
  const scheduler = new Scheduler(db, now, observations.check, demo);
  const backups = backupService(db, dataDir, now, scheduler, observations.invalidate);
  app.locals.context = {
    backups,
    scheduler,
    observations,
    db,
    dataDir,
    now,
    demo,
    get pairingCode() {
      return auth.pairingCode;
    },
    rotatePairingCode: auth.rotateCode,
    close() {
      scheduler.stop();
      if (db.open) db.close();
    },
  };
  if (options.startScheduler) scheduler.start();
  app.use(
    auth.boundary,
    (_req, _res, next) =>
      backups.restoring
        ? next(new AppError('RESTORE_BUSY', 'Veriler geri yükleniyor. Lütfen bekleyin.', 503))
        : next(),
    express.json({ limit: '128kb' }),
  );
  app.get('/api/session', (req, res) => res.json(auth.info(req)));
  app.post('/api/pair', auth.pair);
  if (demo)
    app.post('/api/demo/session', (req, res) => {
      if (req.get('X-FR-Client') !== 'web')
        throw new AppError('DEMO_CLIENT_REQUIRED', 'Demo istemci doğrulaması gerekli.', 403);
      auth.login(req, res);
    });
  if (!demo)
    app.post('/api/demo/session', (_req, _res, next) =>
      next(new AppError('NOT_FOUND', 'Bu uç bulunamadı.', 404)),
    );
  app.use('/api', auth.protect);
  app.post('/api/logout', auth.logout);
  app.get('/api/sources', (_req, res) => res.json({ sources: listSources(db) }));
  app.post('/api/sources', (req, res) => res.status(201).json(saveSource(db, req.body, now())));
  app.patch('/api/sources/:id', (req, res) =>
    res.json(saveSource(db, req.body, now(), String(req.params.id))),
  );
  app.delete('/api/sources/:id', (req, res) => {
    const source = getSource(db, String(req.params.id));
    db.transaction(() => {
      putJson(db, 'sources', source.id, {
        ...source,
        enabled: false,
        status: 'paused',
        nextCheckAt: null,
      });
      db.prepare('UPDATE sources SET archived=1 WHERE id=?').run(source.id);
      db.prepare(
        "UPDATE jobs SET status='failed',delay_reason='Kaynak arşivlendi.',lease_until=NULL,lease_owner=NULL WHERE source_id=? AND status IN ('queued','running')",
      ).run(source.id);
    })();
    res.status(204).end();
  });
  app.post('/api/sources/:id/preview', async (req, res) =>
    res.json(await observations.preview(String(req.params.id))),
  );
  app.post('/api/sources/:id/baseline', (req, res) =>
    res.json(observations.baseline(String(req.params.id), String(req.body?.previewId || ''))),
  );
  app.get('/api/sources/:id/observations', (req, res) =>
    res.json({ observations: observations.list(String(req.params.id)) }),
  );
  app.post('/api/sources/:id/check', (req, res) => {
    const key = req.get('Idempotency-Key');
    if (!key)
      throw new AppError('IDEMPOTENCY_REQUIRED', 'Kontrol isteği için işlem anahtarı gerekli.');
    res.status(202).json(scheduler.enqueue(String(req.params.id), key));
  });
  app.get('/api/jobs/:id', (req, res) => res.json(scheduler.get(String(req.params.id))));
  app.post('/api/items/:id/decisions', (req, res) =>
    res.json(decide(db, String(req.params.id), req.body, now())),
  );
  app.post('/api/items/:id/deadline-confirmations', (req, res) =>
    res.json(confirmDeadline(db, String(req.params.id), req.body, now())),
  );
  app.get('/api/settings', (_req, res) => res.json(getSettings(db, dataDir, demo)));
  app.patch('/api/settings', (req, res) => {
    patchSettings(db, req.body);
    res.json(getSettings(db, dataDir, demo));
  });
  app.get('/api/summary', (_req, res) => {
    const settings = getSettings(db, dataDir, demo);
    dailyReminders(db, now(), settings.timezone);
    res.json(getSummary(db, now(), settings.timezone));
  });
  app.get('/api/items', (req, res) =>
    res.json({
      items: listItems(db, {
        q: typeof req.query.q === 'string' ? req.query.q : undefined,
        category: typeof req.query.category === 'string' ? req.query.category : undefined,
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        sourceId: typeof req.query.sourceId === 'string' ? req.query.sourceId : undefined,
      }),
    }),
  );
  app.get('/api/items/:id/diff', (req, res) => res.json(itemDiff(db, String(req.params.id))));
  app.get('/api/notifications', (_req, res) => res.json({ notifications: listNotifications(db) }));
  app.patch('/api/notifications/:id', (req, res) => {
    if (req.body?.read !== true)
      throw new AppError('VALIDATION_ERROR', 'Bildirim yalnız okundu olarak işaretlenebilir.');
    const notification = readJson<import('../../../packages/shared/src/contracts').Notification>(
      db,
      'notifications',
      String(req.params.id),
    );
    if (!notification) throw new AppError('NOT_FOUND', 'Bildirim bulunamadı.', 404);
    putJson(db, 'notifications', notification.id, { ...notification, read: true });
    res.json({ ...notification, read: true });
  });
  app.post('/api/notifications/read-all', (_req, res) => {
    db.transaction(() => {
      for (const notification of listNotifications(db))
        putJson(db, 'notifications', notification.id, { ...notification, read: true });
    })();
    res.status(204).end();
  });
  app.post('/api/backups', async (_req, res) => res.status(201).json(await backups.create()));
  app.get('/api/backups', (_req, res) => res.json({ backups: backups.list() }));
  app.get('/api/backups/:id/download', (req, res) => {
    const id = String(req.params.id);
    const path = backups.file(id);
    res.download(path, backups.list().find((b) => b.id === id)?.fileName || 'firsat-radari.sqlite');
  });
  app.post('/api/restore/preview', (req, res) =>
    res.json(backups.preview(String(req.body?.backupId || ''))),
  );
  app.post('/api/restore', async (req, res) => {
    const result = await backups.restore(String(req.body?.backupId || ''), req.body?.confirmation);
    if (!demo) auth.rotateCode();
    res.json(result);
  });
  app.use('/api', (_req, _res, next) => next(new AppError('NOT_FOUND', 'Bu uç bulunamadı.', 404)));
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof ContentError) error = new AppError(error.code, error.message);
    if (error instanceof ZodError)
      return void res.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Alanları kontrol edin.',
          details: error.issues,
        },
      });
    const known = error instanceof AppError;
    res.status(known ? error.status : 500).json({
      error: {
        code: known ? error.code : 'INTERNAL_ERROR',
        message: known ? error.message : 'İşlem tamamlanamadı. Verileriniz değiştirilmedi.',
        ...(known && error.details ? { details: error.details } : {}),
      },
    });
  };
  app.use(errorHandler);
  return app;
}
