import { randomUUID } from 'node:crypto';
import type { DB } from '../../db/database';
import { readJson, putJson } from '../../db/database';
import { AppError, assertFound } from '../../errors';
import { sourceInputSchema, type Source } from '../../../../../packages/shared/src/contracts';
import { validateUrl } from '../../network/url-policy';
export function listSources(db: DB): Source[] {
  return (
    db.prepare('SELECT data FROM sources WHERE archived=0 ORDER BY created_at,id').all() as {
      data: string;
    }[]
  ).map((r) => JSON.parse(r.data));
}
export function getSource(db: DB, id: string) {
  if (!db.prepare('SELECT 1 FROM sources WHERE id=? AND archived=0').get(id))
    throw new AppError('NOT_FOUND', 'Kaynak bulunamadı veya arşivlendi.', 404);
  return assertFound(readJson<Source>(db, 'sources', id), 'Kaynak');
}
export function saveSource(db: DB, body: unknown, now: Date, id?: string): Source {
  const old = id ? getSource(db, id) : undefined;
  const input = sourceInputSchema.parse(old ? { ...old, ...(body as object) } : body);
  validateUrl(input.url);
  const enabled =
    typeof (body as { enabled?: unknown })?.enabled === 'boolean'
      ? (body as { enabled: boolean }).enabled
      : (old?.enabled ?? true);
  const configChanged =
    old && (old.url !== input.url || old.kind !== input.kind || old.selector !== input.selector);
  const source: Source = {
    ...input,
    id: old?.id || randomUUID(),
    configVersion: old ? old.configVersion + (configChanged ? 1 : 0) : 1,
    enabled,
    baselineRequired: !old || !!configChanged || old.baselineRequired,
    status: !enabled
      ? 'paused'
      : configChanged
        ? 'new'
        : old?.status === 'paused'
          ? old.baselineRequired
            ? 'new'
            : 'active'
          : (old?.status ?? 'new'),
    lastCheckedAt: old?.lastCheckedAt ?? null,
    lastSuccessAt: old?.lastSuccessAt ?? null,
    nextCheckAt: enabled
      ? (old?.nextCheckAt ?? (old && !old.baselineRequired ? now.toISOString() : null))
      : null,
    lastError: old?.lastError ?? null,
    itemCount: old?.itemCount ?? 0,
  };
  db.transaction(() => {
    if (!old) {
      if (listSources(db).length >= 50)
        throw new AppError('SOURCE_LIMIT', 'En fazla 50 kaynak ekleyebilirsiniz.');
      db.prepare('INSERT INTO sources(id,data,created_at) VALUES (?,?,?)').run(
        source.id,
        JSON.stringify(source),
        now.toISOString(),
      );
    } else putJson(db, 'sources', source.id, source);
    if (!old || configChanged)
      db.prepare('INSERT INTO source_configs VALUES (?,?,?,?)').run(
        source.id,
        source.configVersion,
        JSON.stringify(input),
        now.toISOString(),
      );
    if (!source.enabled)
      db.prepare(
        "UPDATE jobs SET status='failed',delay_reason='Kaynak duraklatıldı.',lease_until=NULL,lease_owner=NULL WHERE source_id=? AND status IN ('queued','running')",
      ).run(source.id);
    db.prepare('INSERT INTO events VALUES (?,?,?,?)').run(
      randomUUID(),
      old ? 'source_updated' : 'source_added',
      source.id,
      now.toISOString(),
    );
  })();
  return source;
}
