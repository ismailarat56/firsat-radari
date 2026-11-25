import { randomUUID } from 'node:crypto';
import { completeOnboarding } from '../../storage/settings';
import type { DB } from '../../db/database';
import { putJson, readJson } from '../../db/database';
import { AppError, assertFound } from '../../errors';
import { getSource } from '../sources/service';
import { addNotification } from '../notifications/service';
import {
  canonicalize,
  ContentError,
  NORMALIZATION_VERSION,
  type CanonicalDocument,
} from '../../../../../packages/shared/src/canonicalize';
import { compareSnapshots } from '../../../../../packages/shared/src/diff';
import { extractDeadlineCandidates } from '../../../../../packages/shared/src/deadlines';
import type {
  Source,
  Opportunity,
  Observation,
  Preview,
} from '../../../../../packages/shared/src/contracts';
import { applyRetention } from '../../storage/retention';
import type { Fetcher, FetchResult } from '../../network/safe-fetch';
export type SnapshotRow = {
  id: string;
  document: string;
  etag: string | null;
  last_modified: string | null;
  normalization_version: number;
  config_version: number;
  observed_at: string;
};
export function latestSnapshot(db: DB, sourceId: string) {
  return db
    .prepare(
      'SELECT * FROM snapshots WHERE source_id=? ORDER BY observed_at DESC,rowid DESC LIMIT 1',
    )
    .get(sourceId) as SnapshotRow | undefined;
}
export function observationService(db: DB, fetcher: Fetcher, now: () => Date) {
  let generation = 0;
  const assertGeneration = (expected: number) => {
    if (expected !== generation)
      throw new AppError(
        'STATE_CHANGED',
        'Veriler geri yüklendi; eski ağ yanıtı kullanılmadı. Yeni önizleme veya kontrol başlatın.',
        409,
      );
  };
  function persist(
    source: Source,
    doc: CanonicalDocument,
    meta: FetchResult,
    baseline: boolean,
    at: Date,
    observationId?: string,
    jobId?: string,
  ) {
    return db.transaction(() => {
      const timestamp = at.toISOString();
      const liveSource = getSource(db, source.id);
      if (liveSource.configVersion !== source.configVersion)
        throw new AppError(
          'BASELINE_REQUIRED',
          'Kaynak ayarı tarama sırasında değişti; yeni başlangıç görüntüsü gerekli.',
        );
      const previous = latestSnapshot(db, source.id);
      if (
        !baseline &&
        (!previous ||
          source.baselineRequired ||
          previous.config_version !== source.configVersion ||
          previous.normalization_version !== NORMALIZATION_VERSION)
      )
        throw new AppError(
          'BASELINE_REQUIRED',
          'Bu yapılandırma için yeni başlangıç görüntüsünü onaylayın.',
        );
      source = liveSource;
      const changes = baseline ? [] : compareSnapshots(JSON.parse(previous!.document), doc);
      const snapshotId = randomUUID();
      db.prepare('INSERT INTO snapshots VALUES (?,?,?,?,?,?,?,?,?)').run(
        snapshotId,
        source.id,
        source.configVersion,
        doc.normalizationVersion,
        timestamp,
        doc.hash,
        JSON.stringify(doc),
        meta.etag,
        meta.lastModified,
      );
      const actualSnapshot = snapshotId;
      const changedIds = new Map(changes.map((c) => [c.identity, c]));
      const apply = (
        identity: string,
        changeType: 'new' | 'updated' | 'removed',
        entry: CanonicalDocument['items'][number],
      ) => {
        const row = db
          .prepare('SELECT id,data FROM items WHERE source_id=? AND identity=?')
          .get(source.id, identity) as { id: string; data: string } | undefined;
        const old = row ? (JSON.parse(row.data) as Opportunity) : undefined;
        const change = changedIds.get(identity);
        const changed = baseline || !old || Boolean(change);
        if (old && !changed) changeType = old.changeType;
        const itemId = old?.id || randomUUID();
        const content =
          changeType === 'removed'
            ? `Kaynakta artık görünmüyor. Başvurunun kapandığı varsayılmaz.\n${entry.content}`
            : entry.content;
        const matchedKeywords = source.keywords.filter((word) =>
          (entry.title + ' ' + content)
            .toLocaleLowerCase('tr-TR')
            .includes(word.toLocaleLowerCase('tr-TR')),
        );
        const candidates = extractDeadlineCandidates(content, {
          sourceUrl: entry.url,
          observedAt: timestamp,
        }).map((c) => ({ ...c, id: `${itemId}:${c.id}` }));
        let confirmed = old?.confirmedDeadline ?? null;
        if (
          confirmed &&
          old &&
          JSON.stringify(
            old.deadlineCandidates.map((c) => [c.dateOnly, c.instantUtc, c.resolution]),
          ) !== JSON.stringify(candidates.map((c) => [c.dateOnly, c.instantUtc, c.resolution]))
        )
          confirmed = { ...confirmed, reviewRequired: true };
        const item: Opportunity = {
          id: itemId,
          sourceId: source.id,
          sourceName: source.name,
          sourceUrl: source.url,
          category: source.category,
          title: entry.title,
          url: entry.url,
          summary: content.slice(0, 240),
          content,
          changeType,
          changeSummary:
            !changed && old
              ? old.changeSummary
              : baseline
                ? 'Başlangıç görüntüsü'
                : changeType === 'new'
                  ? 'Kaynakta yeni duyuru'
                  : changeType === 'removed'
                    ? 'Kaynakta artık görünmüyor'
                    : 'Duyuru içeriği güncellendi',
          observedAt: timestamp,
          publishedAt: entry.publishedAt,
          status:
            old?.status === 'reviewed' && !baseline && changed
              ? 'unread'
              : (old?.status ?? (baseline ? 'reviewed' : 'unread')),
          priority: matchedKeywords.length ? 'high' : source.keywords.length ? 'low' : 'normal',
          matchedKeywords,
          deadlineCandidates: candidates,
          confirmedDeadline: confirmed,
          decisionReason: old?.decisionReason ?? null,
        };
        if (old) putJson(db, 'items', itemId, item);
        else
          db.prepare('INSERT INTO items VALUES (?,?,?,?)').run(
            itemId,
            source.id,
            identity,
            JSON.stringify(item),
          );
        const priorDiff = db
          .prepare(
            'SELECT before_id FROM diffs WHERE item_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1',
          )
          .get(itemId) as { before_id: string | null } | undefined;
        const oldVersion = db
          .prepare(
            'SELECT id FROM item_versions WHERE item_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1',
          )
          .get(itemId) as { id: string } | undefined;
        const versionId = randomUUID();
        db.prepare('INSERT INTO item_versions VALUES (?,?,?,?,?,?)').run(
          versionId,
          itemId,
          actualSnapshot,
          content,
          entry.hash,
          timestamp,
        );
        db.prepare('INSERT INTO diffs VALUES (?,?,?,?,?)').run(
          randomUUID(),
          itemId,
          baseline ? null : !changed ? (priorDiff?.before_id ?? null) : (oldVersion?.id ?? null),
          versionId,
          timestamp,
        );
        for (const candidate of candidates)
          db.prepare(
            'INSERT INTO deadline_candidates VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
          ).run(candidate.id, itemId, JSON.stringify(candidate));
        if (confirmed)
          db.prepare(
            'INSERT INTO confirmed_deadlines VALUES (?,?,?) ON CONFLICT(item_id) DO UPDATE SET data=excluded.data,version=excluded.version',
          ).run(itemId, confirmed.version, JSON.stringify(confirmed));
        if (
          !baseline &&
          changed &&
          (!source.keywords.length || matchedKeywords.length || old?.status === 'saved')
        )
          addNotification(
            db,
            `change:${itemId}:${actualSnapshot}`,
            itemId,
            item.title,
            item.changeSummary,
            at,
          );
        if (changed && confirmed?.reviewRequired)
          addNotification(
            db,
            `deadline-review:${itemId}:${actualSnapshot}`,
            itemId,
            'Son tarihi yeniden inceleyin',
            `“${item.title}” kaynağındaki tarih kanıtı değişti; onayınız korunuyor.`,
            at,
          );
        if (!baseline && changed)
          db.prepare('INSERT INTO events VALUES (?,?,?,?)').run(
            randomUUID(),
            'change_detected',
            itemId,
            timestamp,
          );
      };
      for (const entry of doc.items)
        apply(
          entry.identity,
          changedIds.get(entry.identity)?.type === 'updated' ? 'updated' : 'new',
          entry,
        );
      for (const change of changes)
        if (change.type === 'removed' && change.before)
          apply(change.identity, 'removed', change.before);
      const updated: Source = {
        ...source,
        baselineRequired: false,
        status: source.enabled ? 'active' : 'paused',
        lastCheckedAt: timestamp,
        lastSuccessAt: timestamp,
        nextCheckAt: source.enabled
          ? new Date(at.getTime() + source.intervalMinutes * 60_000).toISOString()
          : null,
        lastError: null,
        itemCount: doc.items.length,
      };
      putJson(db, 'sources', source.id, updated);
      if (observationId) {
        const observation = assertFound(readJson<Observation>(db, 'observations', observationId));
        putJson(db, 'observations', observationId, {
          ...observation,
          finishedAt: timestamp,
          status: changes.length || baseline ? 'success' : 'unchanged',
          message: baseline
            ? 'Başlangıç görüntüsü onaylandı.'
            : changes.length
              ? `${changes.length} anlamlı değişiklik.`
              : 'Anlamlı değişiklik yok.',
          changeCount: changes.length,
        });
      }
      if (jobId)
        db.prepare(
          "UPDATE jobs SET status='completed',lease_until=NULL,lease_owner=NULL,delay_reason=NULL WHERE id=?",
        ).run(jobId);
      applyRetention(db, at);
      return updated;
    })();
  }
  async function preview(sourceId: string): Promise<Preview> {
    const epoch = generation;
    const source = getSource(db, sourceId);
    const meta = await fetcher({ url: source.url });
    assertGeneration(epoch);
    if (getSource(db, sourceId).configVersion !== source.configVersion)
      throw new AppError(
        'PREVIEW_EXPIRED',
        'Kaynak ayarı önizleme sırasında değişti. Yeni önizleme alın.',
      );
    if (meta.status === 304 || meta.body === null)
      throw new AppError('PREVIEW_BODY_REQUIRED', 'Önizleme için tam bir yanıt gerekli.');
    const document = canonicalize({
      body: meta.body,
      url: meta.url,
      kind: source.kind,
      selector: source.selector,
    });
    const at = now();
    const previewId = randomUUID();
    db.prepare('INSERT INTO previews VALUES (?,?,?,?,?,?)').run(
      previewId,
      sourceId,
      source.configVersion,
      new Date(at.getTime() + 15 * 60_000).toISOString(),
      JSON.stringify(document),
      JSON.stringify(meta),
    );
    return {
      previewId,
      sourceId,
      title: document.title,
      fetchedAt: at.toISOString(),
      itemCount: document.items.length,
      items: document.items.map(({ title, content, url }) => ({
        title,
        content: content.slice(0, 4000),
        url,
      })),
    };
  }
  function baseline(sourceId: string, previewId: string) {
    const source = getSource(db, sourceId);
    const preview = assertFound(
      db.prepare('SELECT * FROM previews WHERE id=? AND source_id=?').get(previewId, sourceId) as
        | { config_version: number; expires_at: string; document: string; metadata: string }
        | undefined,
      'Önizleme',
    );
    if (
      preview.config_version !== source.configVersion ||
      preview.expires_at <= now().toISOString()
    )
      throw new AppError(
        'PREVIEW_EXPIRED',
        'Önizleme süresi doldu veya kaynak ayarı değişti. Yeni önizleme alın.',
      );
    return db.transaction(() => {
      const observationId = randomUUID();
      const at = now();
      const observation: Observation = {
        id: observationId,
        sourceId,
        startedAt: at.toISOString(),
        finishedAt: null,
        status: 'running',
        message: null,
        changeCount: 0,
      };
      db.prepare('INSERT INTO observations VALUES (?,?,?,?)').run(
        observationId,
        sourceId,
        observation.startedAt,
        JSON.stringify(observation),
      );
      const result = persist(
        source,
        JSON.parse(preview.document),
        JSON.parse(preview.metadata),
        true,
        at,
        observationId,
      );
      db.prepare('DELETE FROM previews WHERE id=?').run(previewId);
      db.prepare('INSERT INTO events VALUES (?,?,?,?)').run(
        randomUUID(),
        'baseline_validated',
        sourceId,
        at.toISOString(),
      );
      completeOnboarding(db);
      return result;
    })();
  }
  async function check(sourceId: string, jobId?: string) {
    const epoch = generation;
    const source = getSource(db, sourceId);
    if (source.baselineRequired)
      throw new AppError('BASELINE_REQUIRED', 'Önce başlangıç görüntüsünü onaylayın.');
    const observationId = randomUUID();
    const startedAt = now().toISOString();
    const observation: Observation = {
      id: observationId,
      sourceId,
      startedAt,
      finishedAt: null,
      status: 'running',
      message: null,
      changeCount: 0,
    };
    db.prepare('INSERT INTO observations VALUES (?,?,?,?)').run(
      observationId,
      sourceId,
      startedAt,
      JSON.stringify(observation),
    );
    try {
      const previous = latestSnapshot(db, sourceId);
      const meta = await fetcher({
        url: source.url,
        etag: previous?.etag,
        lastModified: previous?.last_modified,
      });
      assertGeneration(epoch);
      if (meta.status === 304) {
        if (!previous)
          throw new AppError('NO_PREVIOUS_BODY', '304 yanıtı için önceki görüntü yok.');
        return persist(
          source,
          JSON.parse(previous.document),
          meta,
          false,
          now(),
          observationId,
          jobId,
        );
      }
      const doc = canonicalize({
        body: meta.body!,
        url: meta.url,
        kind: source.kind,
        selector: source.selector,
      });
      return persist(source, doc, meta, false, now(), observationId, jobId);
    } catch (error) {
      assertGeneration(epoch);
      const code = (error as { code?: string }).code;
      const status: Observation['status'] =
        code === 'ACCESS_RESTRICTED'
          ? 'restricted'
          : error instanceof ContentError
            ? 'invalid'
            : 'unreachable';
      const message =
        error instanceof AppError || error instanceof ContentError
          ? error.message
          : 'Kaynağa erişilemedi; son geçerli görüntü korundu.';
      db.transaction(() => {
        putJson(db, 'observations', observationId, {
          ...observation,
          finishedAt: now().toISOString(),
          status,
          message,
          changeCount: 0,
        });
        const current = readJson<Source>(db, 'sources', source.id);
        if (current && db.prepare('SELECT 1 FROM sources WHERE id=? AND archived=0').get(source.id))
          putJson(db, 'sources', source.id, {
            ...current,
            lastCheckedAt: now().toISOString(),
            status: !current.enabled
              ? 'paused'
              : code === 'BASELINE_REQUIRED'
                ? 'new'
                : status === 'restricted'
                  ? 'blocked'
                  : 'error',
            baselineRequired: code === 'BASELINE_REQUIRED' ? true : current.baselineRequired,
            lastError: message,
          });
      })();
      if (jobId) throw error;
      return readJson<Source>(db, 'sources', sourceId);
    }
  }
  function list(sourceId: string): Observation[] {
    getSource(db, sourceId);
    return (
      db
        .prepare(
          'SELECT data FROM observations WHERE source_id=? ORDER BY started_at DESC,rowid DESC LIMIT 100',
        )
        .all(sourceId) as { data: string }[]
    ).map((r) => JSON.parse(r.data));
  }
  return {
    preview,
    baseline,
    check,
    list,
    persist,
    invalidate() {
      generation++;
    },
  };
}
