import { categoryLabels, type Category, type Opportunity } from '@shared/contracts';
export { categoryLabels };
export const categoryShort: Record<Category, string> = {
  burs: 'Burs',
  akademik: 'Akademik',
  kariyer: 'Kariyer',
  etkinlik: 'Etkinlik',
};
export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toLocaleUpperCase('tr');
}
export function relativeTime(value: string | null) {
  if (!value) return 'Henüz kontrol edilmedi';
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60000));
  if (minutes < 1) return 'Az önce';
  if (minutes < 60) return `${minutes} dk önce`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} saat önce`;
  if (minutes < 2880) return 'Dün';
  return `${Math.floor(minutes / 1440)} gün önce`;
}
export const defaultTimezone = 'Europe/Istanbul';
export function calendarDay(value: string | Date, timezone = defaultTimezone) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const part = (name: string) => parts.find((p) => p.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function formatDate(
  value: string,
  options?: Intl.DateTimeFormatOptions,
  timezone = defaultTimezone,
) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  return new Intl.DateTimeFormat('tr-TR', {
    ...(options ?? { day: 'numeric', month: 'long', year: 'numeric' }),
    timeZone: dateOnly ? 'UTC' : timezone,
  }).format(new Date(dateOnly ? `${value}T12:00:00Z` : value));
}
export function formatTime(value: string | null, timezone = defaultTimezone) {
  if (!value) return 'Planlanıyor';
  return new Intl.DateTimeFormat('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(new Date(value));
}
export function dateParts(value: string, timezone = defaultTimezone) {
  return {
    day: calendarDay(value, timezone).slice(8),
    month: formatDate(value, { month: 'short' }, timezone).toLocaleUpperCase('tr'),
  };
}
export function deadlineDate(item: Opportunity, timezone = defaultTimezone) {
  return (
    item.confirmedDeadline?.dateOnly ??
    (item.confirmedDeadline?.instantUtc
      ? calendarDay(item.confirmedDeadline.instantUtc, timezone)
      : null)
  );
}
export function daysUntil(value: string, timezone = defaultTimezone, now = new Date()) {
  const [ty, tm, td] = calendarDay(now, timezone).split('-').map(Number);
  const [y, m, d] = calendarDay(value, timezone).split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000);
}
export function safeHref(value: string): string | undefined {
  try {
    const u = new URL(value);
    return ['http:', 'https:'].includes(u.protocol) ? u.href : undefined;
  } catch {
    return undefined;
  }
}
