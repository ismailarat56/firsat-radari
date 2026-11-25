import type { DB } from '../../db/database';
import { readJson } from '../../db/database';
import { AppError, assertFound } from '../../errors';
import type {
  DiffDetail,
  Opportunity,
  SnapshotView,
} from '../../../../../packages/shared/src/contracts';
import { diffLines } from '../../../../../packages/shared/src/diff';
export function listItems(
  db: DB,
  filters: { q?: string; category?: string; status?: string; sourceId?: string } = {},
): Opportunity[] {
  const rows = db
    .prepare(
      // Stopping source collection does not archive its opportunities or decisions.
      'SELECT data FROM items' + (filters.sourceId ? ' WHERE source_id=?' : ''),
    )
    .all(...(filters.sourceId ? [filters.sourceId] : [])) as { data: string }[];
  const q = filters.q?.toLocaleLowerCase('tr-TR');
  return rows
    .map((r) => JSON.parse(r.data) as Opportunity)
    .filter(
      (item) =>
        (!q ||
          `${item.title} ${item.content} ${item.sourceName}`
            .toLocaleLowerCase('tr-TR')
            .includes(q)) &&
        (!filters.category || item.category === filters.category) &&
        (!filters.status || item.status === filters.status),
    )
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
}
export function getItem(db: DB, id: string) {
  return assertFound(readJson<Opportunity>(db, 'items', id), 'Duyuru');
}
export function itemDiff(db: DB, id: string): DiffDetail {
  const item = getItem(db, id);
  const row = db
    .prepare(
      'SELECT before_id,after_id FROM diffs WHERE item_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1',
    )
    .get(id) as { before_id: string | null; after_id: string } | undefined;
  if (!row) throw new AppError('EVIDENCE_MISSING', 'Bu duyurunun görüntü kanıtı bulunamadı.', 404);
  const getView = (versionId: string): SnapshotView => {
    const version = assertFound(
      db
        .prepare(
          'SELECT v.id,v.content,v.created_at,s.id AS snapshot_id,s.normalization_version FROM item_versions v LEFT JOIN snapshots s ON s.id=v.snapshot_id WHERE v.id=?',
        )
        .get(versionId) as
        | {
            id: string;
            content: string;
            created_at: string;
            snapshot_id: string | null;
            normalization_version: number | null;
          }
        | undefined,
      'Kanıt',
    );
    return {
      id: version.snapshot_id || version.id,
      content: version.content,
      observedAt: version.created_at,
      normalizationVersion: version.normalization_version || 1,
    };
  };
  const before = row.before_id ? getView(row.before_id) : null;
  const after = getView(row.after_id);
  return { item, before, after, changes: diffLines(before?.content || '', after.content) };
}
