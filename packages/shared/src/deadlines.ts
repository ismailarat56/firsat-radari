import { createHash } from 'node:crypto';
import type { DeadlineCandidate } from './contracts';
const months: Record<string, string> = {
  ocak: '01',
  şubat: '02',
  mart: '03',
  nisan: '04',
  mayıs: '05',
  haziran: '06',
  temmuz: '07',
  ağustos: '08',
  eylül: '09',
  ekim: '10',
  kasım: '11',
  aralık: '12',
};
export function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T12:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
export function extractDeadlineCandidates(
  text: string,
  ctx: { sourceUrl: string; observedAt: string },
): DeadlineCandidate[] {
  const matches = [
    ...text.matchAll(
      /\b(\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}[./]\d{4}|\d{1,2}\s+(?:Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)(?:\s+\d{4})?|bu\s+(?:pazartesi|salı|çarşamba|perşembe|cuma|cumartesi|pazar))\b(?:\s+(?:saat\s+)?\d{1,2}:\d{2}(?:\s*(?:Z|UTC|GMT|[+-]\d{2}:\d{2}))?)?/giu,
    ),
  ];
  return matches.slice(0, 20).map((match) => {
    const quote = text
      .slice(
        Math.max(0, (match.index || 0) - 35),
        Math.min(text.length, (match.index || 0) + match[0].length + 50),
      )
      .trim();
    const raw = match[0];
    let dateOnly: string | null = null;
    let resolution: DeadlineCandidate['resolution'] = 'complete';
    let instantUtc: string | null = null;
    if (/^bu\s/i.test(raw)) resolution = 'ambiguous';
    else if (/^\d{4}-/.test(raw)) dateOnly = raw.slice(0, 10);
    else if (/^\d{1,2}[./]/.test(raw)) {
      const [day, month, year] = raw.split(/[./\s]/);
      dateOnly = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    } else {
      const parts = raw.split(/\s+/);
      const month = months[parts[1].toLocaleLowerCase('tr-TR')];
      if (/^\d{4}$/.test(parts[2] || ''))
        dateOnly = `${parts[2]}-${month}-${parts[0].padStart(2, '0')}`;
      else resolution = 'missing_year';
    }
    if (dateOnly && !isValidDateOnly(dateOnly)) {
      dateOnly = null;
      resolution = 'ambiguous';
    }
    const time = raw.match(/(\d{1,2}):(\d{2})/);
    if (time && dateOnly) {
      const zone = raw.match(/(?:\s|\d)(Z|UTC|GMT|[+-]\d{2}:\d{2})$/)?.[1];
      if (!zone) resolution = 'missing_timezone';
      else {
        const candidate = new Date(
          `${dateOnly}T${time[1].padStart(2, '0')}:${time[2]}:00${['Z', 'UTC', 'GMT'].includes(zone) ? 'Z' : zone}`,
        );
        if (!Number.isNaN(candidate.getTime())) {
          instantUtc = candidate.toISOString();
          dateOnly = null;
        } else resolution = 'ambiguous';
      }
    }
    const id = createHash('sha256')
      .update(ctx.sourceUrl + '\n' + raw + '\n' + String(match.index))
      .digest('hex')
      .slice(0, 32);
    return {
      id,
      quote,
      dateOnly,
      instantUtc,
      resolution,
      sourceUrl: ctx.sourceUrl,
      observedAt: ctx.observedAt,
    };
  });
}
export function calendarDay(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  return ['year', 'month', 'day']
    .map((type) => parts.find((p) => p.type === type)?.value)
    .join('-');
}
export function isDeadlinePassed(
  deadline: { dateOnly: string | null; instantUtc: string | null; timezone: string },
  now: Date,
): boolean {
  if (deadline.instantUtc) return now.getTime() > new Date(deadline.instantUtc).getTime();
  return Boolean(deadline.dateOnly && calendarDay(now, deadline.timezone) > deadline.dateOnly);
}
