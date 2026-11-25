import { z } from 'zod';
import type { DB } from '../db/database';
import { setting, setSetting } from '../db/database';
import type { Settings } from '../../../../packages/shared/src/contracts';
import { AppError } from '../errors';
import { evidenceUsedBytes } from './retention';
export const settingsPatch = z
  .object({
    timezone: z.string().min(1).max(80).optional(),
    defaultIntervalMinutes: z.number().int().min(30).max(10080).optional(),
    onboardingComplete: z.boolean().optional(),
  })
  .strict();
export function getSettings(db: DB, dataDirectory: string, demo: boolean): Settings {
  return {
    timezone: setting(db, 'timezone', 'Europe/Istanbul'),
    defaultIntervalMinutes: setting(db, 'defaultIntervalMinutes', 360),
    retentionDays: 90,
    maxSnapshots: 30,
    evidenceQuotaMb: 100,
    evidenceUsedBytes: evidenceUsedBytes(db),
    dataDirectory,
    demo,
    lastBackupAt: setting(db, 'lastBackupAt', null),
    onboardingComplete: setting(db, 'onboardingComplete', false),
  };
}
export function patchSettings(db: DB, body: unknown) {
  const patch = settingsPatch.parse(body);
  if (patch.timezone)
    try {
      new Intl.DateTimeFormat('tr', { timeZone: patch.timezone }).format();
    } catch {
      throw new AppError('TIMEZONE_INVALID', 'Geçerli bir IANA saat dilimi girin.');
    }
  db.transaction(() => {
    for (const [key, value] of Object.entries(patch)) setSetting(db, key, value);
  })();
}

export function completeOnboarding(db: DB) {
  if (setting(db, 'onboardingComplete', false)) return;
  const sources = db
    .prepare(
      "SELECT COUNT(*) AS count FROM sources WHERE archived=0 AND json_extract(data, '$.baselineRequired')=0",
    )
    .get() as { count: number };
  if (
    sources.count >= 3 &&
    db.prepare("SELECT 1 FROM decisions WHERE action != 'restore' LIMIT 1").get()
  ) {
    setSetting(db, 'onboardingComplete', true);
  }
}
