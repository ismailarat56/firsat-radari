import Database from 'better-sqlite3';
import { AppError } from '../errors';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { sql } from 'drizzle-orm';
import { chmodSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { initialMigration } from './migration';
import * as schema from './schema';
export type DB = Database.Database;
export function dataDirectory(
  override?: string,
  demo = false,
  env: NodeJS.ProcessEnv = process.env,
) {
  return resolve(
    override ||
      env.FR_DATA_DIR ||
      (demo
        ? join(process.cwd(), '.local', 'demo')
        : join(env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'firsat-radari')),
  );
}
export function openDatabase(directory: string): DB {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const path = join(directory, 'radar.sqlite');
  const db = new Database(path);
  chmodSync(path, 0o600);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)',
  );
  const orm = drizzle(db, { schema });
  if (!db.prepare('SELECT version FROM schema_migrations WHERE version=1').get())
    db.transaction(() => {
      for (const statement of initialMigration
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean))
        orm.run(sql.raw(statement));
      db.prepare('INSERT INTO schema_migrations VALUES (1,?)').run(new Date().toISOString());
    })();
  return db;
}
export function readJson<T>(
  db: DB,
  table: 'sources' | 'items' | 'observations' | 'notifications',
  id: string,
): T | undefined {
  const row = db.prepare(`SELECT data FROM ${table} WHERE id=?`).get(id) as
    { data: string } | undefined;
  return row ? (JSON.parse(row.data) as T) : undefined;
}
export function putJson(
  db: DB,
  table: 'sources' | 'items' | 'observations' | 'notifications',
  id: string,
  data: unknown,
) {
  db.prepare(`UPDATE ${table} SET data=? WHERE id=?`).run(JSON.stringify(data), id);
}
export function setting<T>(db: DB, key: string, fallback: T): T {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key) as
    { value: string } | undefined;
  return row ? (JSON.parse(row.value) as T) : fallback;
}
export function setSetting(db: DB, key: string, value: unknown) {
  db.prepare(
    'INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
  ).run(key, JSON.stringify(value));
}

export function ensureDataMode(db: DB, demo: boolean) {
  const requested = demo ? 'demo' : 'normal';
  const persisted = setting<string | null>(db, 'dataMode', null);
  const legacyMode = setting(db, 'demoSeeded', false)
    ? 'demo'
    : db.prepare('SELECT 1 FROM sources LIMIT 1').get() ||
        db.prepare('SELECT 1 FROM sessions LIMIT 1').get()
      ? 'normal'
      : null;
  const actual = persisted || legacyMode;
  if (actual && actual !== requested)
    throw new AppError(
      'DATA_MODE_MISMATCH',
      'Veri modu uyuşmuyor. Demo ve gerçek çalışma alanı için ayrı veri dizinleri kullanın.',
      409,
    );
  if (!persisted) setSetting(db, 'dataMode', requested);
}
