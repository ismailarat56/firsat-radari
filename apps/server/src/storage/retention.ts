import type { DB } from '../db/database';
import { AppError } from '../errors';
export const EVIDENCE_QUOTA_BYTES = 100 * 1024 * 1024;
export function evidenceUsedBytes(db: DB): number {
  return (
    db
      .prepare(
        'SELECT COALESCE(SUM(length(CAST(document AS BLOB))),0) AS size FROM snapshots WHERE id IN (SELECT snapshot_id FROM evidence)',
      )
      .get() as { size: number }
  ).size;
}
export function protectItemEvidence(db: DB, itemId: string, now: Date) {
  const ids = db
    .prepare(
      'SELECT DISTINCT v.snapshot_id AS id FROM item_versions v WHERE v.id IN (SELECT before_id FROM diffs WHERE item_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1) OR v.id IN (SELECT after_id FROM diffs WHERE item_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1)',
    )
    .all(itemId, itemId) as { id: string | null }[];
  const extra = ids
    .filter((r) => r.id && !db.prepare('SELECT 1 FROM evidence WHERE snapshot_id=?').get(r.id))
    .reduce(
      (total, r) =>
        total +
        ((
          db
            .prepare('SELECT length(CAST(document AS BLOB)) AS size FROM snapshots WHERE id=?')
            .get(r.id) as { size: number } | undefined
        )?.size || 0),
      0,
    );
  if (evidenceUsedBytes(db) + extra > EVIDENCE_QUOTA_BYTES)
    throw new AppError(
      'EVIDENCE_QUOTA',
      'Karar kanıtı için 100 MiB kota doldu. Mevcut kanıt korunuyor; yeni karar kaydedilemedi.',
      507,
    );
  for (const { id } of ids)
    if (id)
      db.prepare('INSERT OR IGNORE INTO evidence VALUES (?,?,?)').run(
        id,
        itemId,
        now.toISOString(),
      );
}
export function applyRetention(db: DB, now: Date): number {
  return db.transaction(() => {
    const cutoff = new Date(now.getTime() - 90 * 86400_000).toISOString();
    const sources = db.prepare('SELECT id FROM sources').all() as { id: string }[];
    let removed = 0;
    for (const source of sources) {
      const rows = db
        .prepare(
          'SELECT id,observed_at FROM snapshots WHERE source_id=? AND id NOT IN (SELECT snapshot_id FROM evidence) ORDER BY observed_at DESC,rowid DESC',
        )
        .all(source.id) as { id: string; observed_at: string }[];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (i < 30 && row.observed_at >= cutoff) continue;
        db.prepare(
          'DELETE FROM diffs WHERE after_id IN (SELECT id FROM item_versions WHERE snapshot_id=?)',
        ).run(row.id);
        db.prepare(
          'UPDATE diffs SET before_id=NULL WHERE before_id IN (SELECT id FROM item_versions WHERE snapshot_id=?)',
        ).run(row.id);
        db.prepare('DELETE FROM item_versions WHERE snapshot_id=?').run(row.id);
        db.prepare('DELETE FROM snapshots WHERE id=?').run(row.id);
        removed++;
      }
    }
    db.prepare('DELETE FROM previews WHERE expires_at<?').run(now.toISOString());
    db.prepare('DELETE FROM sessions WHERE expires_at<?').run(now.toISOString());
    return removed;
  })();
}
