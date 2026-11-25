import { randomUUID } from 'node:crypto';
import type { DB } from '../db/database';
import { putJson, setSetting, setting, readJson } from '../db/database';
import { getSource, listSources } from '../modules/sources/service';
import { AppError, assertFound } from '../errors';
import type { JobView, Source } from '../../../../packages/shared/src/contracts';
type JobRow = {
  id: string;
  source_id: string;
  status: JobView['status'];
  next_attempt_at: string;
  delay_reason: string | null;
  attempts: number;
  lease_until: string | null;
  lease_owner: string | null;
};
export class Scheduler {
  private timer?: ReturnType<typeof setInterval>;
  private active = new Set<Promise<void>>();
  private ticking = false;
  private paused = false;
  readonly owner = randomUUID();
  constructor(
    readonly db: DB,
    readonly now: () => Date,
    readonly check: (sourceId: string, jobId: string) => Promise<unknown>,
    readonly demo = false,
  ) {}
  get(id: string): JobView {
    const row = assertFound(
      this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id) as JobRow | undefined,
      'İş',
    );
    return {
      id: row.id,
      sourceId: row.source_id,
      status: row.status,
      nextAttemptAt: row.next_attempt_at,
      delayReason: row.delay_reason,
    };
  }
  enqueue(sourceId: string, key?: string): JobView {
    return this.db.transaction(() => {
      const source = getSource(this.db, sourceId);
      if (source.baselineRequired)
        throw new AppError('BASELINE_REQUIRED', 'Önce başlangıç görüntüsünü onaylayın.');
      if (!source.enabled)
        throw new AppError('SOURCE_PAUSED', 'Kontrol için kaynağı önce etkinleştirin.');
      if (key && key.length > 200)
        throw new AppError('IDEMPOTENCY_INVALID', 'İşlem anahtarı çok uzun.');
      const existing =
        (key
          ? this.db
              .prepare('SELECT id FROM jobs WHERE source_id=? AND idempotency_key=?')
              .get(sourceId, key)
          : undefined) ||
        this.db
          .prepare("SELECT id FROM jobs WHERE source_id=? AND status IN ('queued','running')")
          .get(sourceId);
      if (existing) return this.get((existing as { id: string }).id);
      const timestamp = this.now().toISOString();
      const host = new URL(source.url).hostname;
      const budget = this.db
        .prepare('SELECT next_allowed_at,lease_until FROM host_budgets WHERE host=?')
        .get(host) as { next_allowed_at: string; lease_until: string | null } | undefined;
      const nextAttemptAt =
        budget && budget.next_allowed_at > timestamp ? budget.next_allowed_at : timestamp;
      const id = randomUUID();
      this.db
        .prepare(
          "INSERT INTO jobs(id,source_id,idempotency_key,status,next_attempt_at,delay_reason,created_at) VALUES (?,?,?,'queued',?,?,?)",
        )
        .run(
          id,
          sourceId,
          key || null,
          nextAttemptAt,
          nextAttemptAt > timestamp
            ? 'Aynı kaynak sunucusu için en az 10 saniye bekleniyor.'
            : null,
          timestamp,
        );
      putJson(this.db, 'sources', sourceId, { ...source, nextCheckAt: nextAttemptAt });
      return this.get(id);
    })();
  }
  private recover() {
    const timestamp = this.now().toISOString();
    this.db.transaction(() => {
      this.db
        .prepare(
          "UPDATE jobs SET status='queued',lease_until=NULL,lease_owner=NULL,delay_reason='Kesilen tarama güvenli biçimde yeniden sıraya alındı.' WHERE status='running' AND lease_until<?",
        )
        .run(timestamp);
      this.db
        .prepare('UPDATE host_budgets SET lease_until=NULL,lease_owner=NULL WHERE lease_until<?')
        .run(timestamp);
    })();
  }
  async tick() {
    if (this.paused || this.ticking) return;
    this.ticking = true;
    try {
      this.recover();
      const timestamp = this.now().toISOString();
      if (!this.demo)
        for (const source of listSources(this.db))
          if (
            source.enabled &&
            !source.baselineRequired &&
            source.nextCheckAt &&
            source.nextCheckAt <= timestamp
          )
            this.enqueue(source.id);
      const rows = this.db
        .prepare(
          "SELECT * FROM jobs WHERE status='queued' AND next_attempt_at<=? ORDER BY next_attempt_at,created_at,rowid",
        )
        .all(timestamp) as JobRow[];
      const launched: Promise<void>[] = [];
      for (const row of rows) {
        if (this.active.size >= 3) break;
        const source = getSource(this.db, row.source_id);
        if (!source.enabled || source.baselineRequired) {
          this.db
            .prepare(
              "UPDATE jobs SET status='failed',delay_reason='Kaynak duraklatıldı veya başlangıç onayı gerekiyor.' WHERE id=?",
            )
            .run(row.id);
          continue;
        }
        const host = new URL(source.url).hostname;
        const acquired = this.db.transaction(() => {
          const budget = this.db.prepare('SELECT * FROM host_budgets WHERE host=?').get(host) as
            { next_allowed_at: string; lease_until: string | null } | undefined;
          let until = budget?.next_allowed_at || timestamp;
          const running = this.db
            .prepare(
              "SELECT id FROM jobs WHERE id!=? AND status='running' AND source_id IN (SELECT id FROM sources WHERE json_extract(data,'$.url') LIKE ?)",
            )
            .get(row.id, `${new URL(source.url).origin}%`);
          if ((budget?.lease_until && budget.lease_until > timestamp) || running) {
            until = budget?.lease_until || new Date(this.now().getTime() + 10_000).toISOString();
            this.db
              .prepare(
                "UPDATE jobs SET next_attempt_at=?,delay_reason='Aynı sunucudaki taramanın bitmesi bekleniyor.' WHERE id=?",
              )
              .run(until, row.id);
            return false;
          }
          if (until > timestamp) {
            this.db
              .prepare(
                "UPDATE jobs SET next_attempt_at=?,delay_reason='Sunucu istek bütçesi: en az 10 saniye ara.' WHERE id=?",
              )
              .run(until, row.id);
            return false;
          }
          const lease = new Date(this.now().getTime() + 120_000).toISOString();
          const next = new Date(this.now().getTime() + 10_000).toISOString();
          this.db
            .prepare(
              'INSERT INTO host_budgets VALUES (?,?,?,?) ON CONFLICT(host) DO UPDATE SET next_allowed_at=excluded.next_allowed_at,lease_until=excluded.lease_until,lease_owner=excluded.lease_owner',
            )
            .run(host, next, lease, this.owner);
          this.db
            .prepare(
              "UPDATE jobs SET status='running',attempts=attempts+1,lease_until=?,lease_owner=?,delay_reason=NULL WHERE id=?",
            )
            .run(lease, this.owner, row.id);
          return true;
        })();
        if (acquired) {
          const work = this.run(row, host);
          this.active.add(work);
          void work.then(
            () => this.active.delete(work),
            () => this.active.delete(work),
          );
          launched.push(work);
        }
      }
      await Promise.all(launched);
      setSetting(this.db, 'lastSchedulerTick', this.now().toISOString());
    } finally {
      this.ticking = false;
    }
  }
  private async run(job: JobRow, host: string) {
    const heartbeat = setInterval(() => {
      if (!this.db.open) return;
      const until = new Date(this.now().getTime() + 120_000).toISOString();
      this.db
        .prepare("UPDATE jobs SET lease_until=? WHERE id=? AND lease_owner=? AND status='running'")
        .run(until, job.id, this.owner);
      this.db
        .prepare('UPDATE host_budgets SET lease_until=? WHERE host=? AND lease_owner=?')
        .run(until, host, this.owner);
    }, 30_000);
    heartbeat.unref();
    try {
      await this.check(job.source_id, job.id);
      const source = getSource(this.db, job.source_id);
      putJson(this.db, 'sources', source.id, {
        ...source,
        nextCheckAt: new Date(this.now().getTime() + source.intervalMinutes * 60_000).toISOString(),
      });
      this.db
        .prepare(
          "UPDATE jobs SET status='completed',lease_until=NULL,lease_owner=NULL,delay_reason=NULL WHERE id=? AND lease_owner=?",
        )
        .run(job.id, this.owner);
    } catch (error) {
      const retry = (error as { retryAfterMs?: number }).retryAfterMs || 0;
      const attempt = job.attempts + 1;
      const delay = Math.max(
        retry,
        Math.min(6 * 3600_000, 30_000 * 2 ** (attempt - 1)) * (1 + Math.random() * 0.2),
      );
      const nextAttemptAt = new Date(this.now().getTime() + delay).toISOString();
      this.db
        .prepare(
          'UPDATE jobs SET status=?,next_attempt_at=?,delay_reason=?,lease_until=NULL,lease_owner=NULL WHERE id=? AND lease_owner=?',
        )
        .run(
          attempt >= 5 ? 'failed' : 'queued',
          nextAttemptAt,
          retry
            ? 'Kaynak Retry-After ile daha uzun bekleme istiyor.'
            : 'Geçici hata; artan bekleme süresinden sonra yeniden denenecek.',
          job.id,
          this.owner,
        );
      const source = readJson<Source>(this.db, 'sources', job.source_id);
      if (
        source?.enabled &&
        this.db.prepare('SELECT 1 FROM sources WHERE id=? AND archived=0').get(source.id)
      )
        putJson(this.db, 'sources', source.id, { ...source, nextCheckAt: nextAttemptAt });
      this.db
        .prepare('UPDATE host_budgets SET next_allowed_at=MAX(next_allowed_at,?) WHERE host=?')
        .run(nextAttemptAt, host);
    } finally {
      clearInterval(heartbeat);
      const next = new Date(this.now().getTime() + 10_000).toISOString();
      this.db
        .prepare(
          'UPDATE host_budgets SET next_allowed_at=MAX(next_allowed_at,?),lease_until=NULL,lease_owner=NULL WHERE host=? AND lease_owner=?',
        )
        .run(next, host, this.owner);
      for (const pending of this.db
        .prepare(
          "SELECT id,source_id FROM jobs WHERE status='queued' AND delay_reason='Aynı sunucudaki taramanın bitmesi bekleniyor.'",
        )
        .all() as { id: string; source_id: string }[]) {
        if (new URL(getSource(this.db, pending.source_id).url).hostname === host)
          this.db.prepare('UPDATE jobs SET next_attempt_at=? WHERE id=?').run(next, pending.id);
      }
    }
  }
  start() {
    if (this.timer) return;
    this.paused = false;
    const last = setting<string | null>(this.db, 'lastSchedulerTick', null);
    if (last && this.now().getTime() - Date.parse(last) > 30 * 60_000)
      setSetting(
        this.db,
        'observationGap',
        `${last} ile ${this.now().toISOString()} arasında uygulama kapalıydı veya gözlem yapılamadı. Bu aralıktaki değişiklikler bilinmiyor.`,
      );
    this.timer = setInterval(() => {
      void this.tick().catch(() => {});
    }, 1000);
    this.timer.unref();
    void this.tick().catch(() => {});
  }
  async pause() {
    const wasRunning = Boolean(this.timer);
    this.paused = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    await Promise.all([...this.active]);
    return wasRunning;
  }
  stop() {
    this.paused = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
