import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import type { DB } from '../db/database';
import { setSetting, setting } from '../db/database';
import { AppError } from '../errors';
import type { Scheduler } from '../jobs/scheduler';
export type BackupView = { id: string; createdAt: string; fileName: string; sizeBytes: number };
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function backupService(
  db: DB,
  dataDirectory: string,
  now: () => Date,
  scheduler: Scheduler,
  invalidate: () => void = () => {},
) {
  const directory = join(dataDirectory, 'backups');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  let restoring = false;
  function file(id: unknown) {
    if (typeof id !== 'string' || !idPattern.test(id))
      throw new AppError('BACKUP_ID_INVALID', 'Geçerli bir yedek seçin.');
    const path = join(directory, `${id}.sqlite`);
    try {
      const stat = lstatSync(path);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.size > 512 * 1024 * 1024 ||
        realpathSync(path) !== resolve(path)
      )
        throw new Error();
    } catch {
      throw new AppError(
        'BACKUP_INVALID',
        'Yedek bulunamadı, güvenli değil veya 512 MiB sınırını aşıyor.',
      );
    }
    return path;
  }
  function list(): BackupView[] {
    return readdirSync(directory)
      .filter((name) => name.endsWith('.json') && idPattern.test(name.slice(0, -5)))
      .flatMap((name) => {
        try {
          const meta = JSON.parse(readFileSync(join(directory, name), 'utf8')) as BackupView;
          const path = file(meta.id);
          return [{ ...meta, sizeBytes: statSync(path).size }];
        } catch {
          return [];
        }
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async function create(): Promise<BackupView> {
    const id = randomUUID();
    const createdAt = now().toISOString();
    const temporary = join(directory, `${id}.partial`);
    try {
      await db.backup(temporary);
      chmodSync(temporary, 0o600);
      const target = join(directory, `${id}.sqlite`);
      renameSync(temporary, target);
      const view = {
        id,
        createdAt,
        fileName: `firsat-radari-${createdAt.slice(0, 10)}-${id.slice(0, 8)}.sqlite`,
        sizeBytes: statSync(target).size,
      };
      writeFileSync(join(directory, `${id}.json`), JSON.stringify(view), { mode: 0o600 });
      setSetting(db, 'lastBackupAt', createdAt);
      return view;
    } catch (error) {
      rmSync(temporary, { force: true });
      throw new AppError(
        (error as { code?: string }).code === 'ENOSPC' ? 'DISK_FULL' : 'BACKUP_FAILED',
        'Tutarlı yedek oluşturulamadı; mevcut veriler korunuyor.',
        507,
      );
    }
  }
  function stage(id: string) {
    const original = file(id);
    const temporary = mkdtempSync(join(dataDirectory, 'restore-stage-'));
    const staged = join(temporary, 'restore.sqlite');
    let check: DB | undefined;
    try {
      copyFileSync(original, staged);
      chmodSync(staged, 0o600);
      check = new Database(staged, { readonly: true, fileMustExist: true });
      const integrity = check.pragma('integrity_check') as { integrity_check: string }[];
      if (
        integrity.length !== 1 ||
        integrity[0].integrity_check !== 'ok' ||
        (check.pragma('foreign_key_check') as unknown[]).length
      )
        throw new Error('integrity');
      const schema = (connection: DB) =>
        JSON.stringify(
          connection
            .prepare(
              "SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
            )
            .all(),
        );
      if (schema(check) !== schema(db)) throw new Error('schema');
      if (
        setting<string | null>(check, 'dataMode', null) !==
        setting<string | null>(db, 'dataMode', null)
      )
        throw new Error('data mode mismatch');
      const versions = JSON.stringify(
        check.prepare('SELECT version FROM schema_migrations ORDER BY version').all(),
      );
      if (
        versions !==
        JSON.stringify(db.prepare('SELECT version FROM schema_migrations ORDER BY version').all())
      )
        throw new Error('version');
      const sourceCount = (
        check.prepare('SELECT COUNT(*) AS n FROM sources WHERE archived=0').get() as { n: number }
      ).n;
      const itemCount = (check.prepare('SELECT COUNT(*) AS n FROM items').get() as { n: number }).n;
      if (sourceCount > 50) throw new Error('source limit');
      const metadata = list().find((b) => b.id === id);
      const result = {
        backupId: id,
        sourceCount,
        itemCount,
        createdAt: metadata?.createdAt || statSync(original).mtime.toISOString(),
      };
      check.close();
      return { temporary, staged, result };
    } catch {
      if (check?.open) check.close();
      rmSync(temporary, { recursive: true, force: true });
      throw new AppError(
        'RESTORE_INVALID',
        'Yedek bütünlüğü veya şema sürümü doğrulanamadı. Mevcut veriler korunuyor.',
      );
    }
  }
  function preview(id: string) {
    const staged = stage(id);
    try {
      return staged.result;
    } finally {
      rmSync(staged.temporary, { recursive: true, force: true });
    }
  }
  async function restore(id: string, confirmation: unknown) {
    if (confirmation !== 'GERİ YÜKLE')
      throw new AppError('RESTORE_CONFIRMATION', 'Geri yüklemek için “GERİ YÜKLE” yazın.');
    if (restoring) throw new AppError('RESTORE_BUSY', 'Başka bir geri yükleme sürüyor.', 409);
    const staged = stage(id);
    restoring = true;
    invalidate();
    let attached = false;
    let resumeScheduler = false;
    try {
      resumeScheduler = await scheduler.pause();
      const safetyBackup = await create();
      db.prepare('ATTACH DATABASE ? AS restored').run(staged.staged);
      attached = true;
      const tables = (
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='schema_migrations' ORDER BY name",
          )
          .all() as { name: string }[]
      ).map((r) => r.name);
      db.pragma('foreign_keys = OFF');
      try {
        db.transaction(() => {
          for (const table of tables) db.exec(`DELETE FROM main."${table}"`);
          for (const table of tables)
            db.exec(`INSERT INTO main."${table}" SELECT * FROM restored."${table}"`);
          db.exec('DELETE FROM sessions');
          setSetting(db, 'lastBackupAt', safetyBackup.createdAt);
          setSetting(
            db,
            'observationGap',
            'Veriler yedekten geri yüklendi. Yedekten sonraki gözlemler bilinmiyor.',
          );
          if ((db.pragma('foreign_key_check') as unknown[]).length) throw new Error('foreign key');
        })();
      } finally {
        db.pragma('foreign_keys = ON');
      }
      return { restored: true, preRestoreBackupId: safetyBackup.id, sessionsInvalidated: true };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        'RESTORE_FAILED',
        'Geri yükleme tamamlanamadı. Mevcut veriler ve otomatik yedek korunuyor.',
        507,
      );
    } finally {
      if (attached) db.exec('DETACH DATABASE restored');
      rmSync(staged.temporary, { recursive: true, force: true });
      restoring = false;
      if (resumeScheduler) scheduler.start();
    }
  }
  return {
    create,
    list,
    file,
    preview,
    restore,
    get restoring() {
      return restoring;
    },
  };
}
