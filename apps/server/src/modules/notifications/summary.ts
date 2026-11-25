import type { DB } from '../../db/database';
import { setting } from '../../db/database';
import { listItems } from '../items/service';
import { listSources } from '../sources/service';
import { addNotification } from './service';
import { calendarDay, isDeadlinePassed } from '../../../../../packages/shared/src/deadlines';
import type { Summary } from '../../../../../packages/shared/src/contracts';
export function dailyReminders(db: DB, now: Date, timezone: string) {
  const day = calendarDay(now, timezone);
  const items = listItems(db);
  for (const item of items) {
    const deadline = item.confirmedDeadline;
    if (!deadline || ['archived', 'irrelevant'].includes(item.status) || deadline.reviewRequired)
      continue;
    const target =
      deadline.dateOnly ||
      (deadline.instantUtc ? calendarDay(new Date(deadline.instantUtc), deadline.timezone) : null);
    if (!target) continue;
    const days = (Date.parse(target) - Date.parse(calendarDay(now, deadline.timezone))) / 86400_000;
    if (days >= 0 && days <= 3 && !isDeadlinePassed(deadline, now))
      addNotification(
        db,
        `reminder:${item.id}:${deadline.version}:${day}`,
        item.id,
        'Onaylı son tarih yaklaşıyor',
        `${item.title} · ${target}. Yalnız tarihli son gün tamamı kapsayıcıdır.`,
        now,
      );
  }
}
export function getSummary(db: DB, now: Date, timezone: string): Summary {
  const sources = listSources(db),
    items = listItems(db);
  const day = calendarDay(now, timezone);
  const observations = db
    .prepare(
      "SELECT started_at,data FROM observations WHERE json_extract(data,'$.status') IN ('success','unchanged')",
    )
    .all() as { started_at: string; data: string }[];
  const today = observations.filter((o) => calendarDay(new Date(o.started_at), timezone) === day);
  const activity = Array.from({ length: 7 }, (_, i) => {
    const date = calendarDay(new Date(now.getTime() - (6 - i) * 86400_000), timezone);
    return {
      date,
      count: observations
        .filter((o) => calendarDay(new Date(o.started_at), timezone) === date)
        .reduce((sum, o) => sum + (JSON.parse(o.data).changeCount || 0), 0),
    };
  });
  const successes = sources.map((s) => s.lastSuccessAt).filter(Boolean) as string[];
  const upcoming = sources
    .filter((s) => s.enabled && !s.baselineRequired)
    .map((s) => s.nextCheckAt)
    .filter(Boolean) as string[];
  return {
    sourceCount: sources.length,
    activeSources: sources.filter((s) => s.enabled && s.status === 'active').length,
    unreadCount: items.filter((i) => i.status === 'unread').length,
    savedCount: items.filter((i) => i.status === 'saved').length,
    confirmedDeadlineCount: items.filter(
      (i) => i.confirmedDeadline && !['archived', 'irrelevant'].includes(i.status),
    ).length,
    observedToday: today.length,
    changesToday: today.reduce((sum, o) => sum + (JSON.parse(o.data).changeCount || 0), 0),
    activity,
    lastScanAt: successes.sort().at(-1) || null,
    nextScanAt: upcoming.sort()[0] || null,
    observationGap: setting(db, 'observationGap', null),
  };
}
