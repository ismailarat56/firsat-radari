import { describe, expect, it } from 'vitest';
import {
  extractDeadlineCandidates,
  isDeadlinePassed,
  isValidDateOnly,
} from '../../packages/shared/src/deadlines';
const ctx = { sourceUrl: 'https://example.org/a', observedAt: '2026-10-15T10:00:00.000Z' };
describe('evidence-preserving dates', () => {
  it('never invents a year or resolve relative text', () => {
    const list = extractDeadlineCandidates('Son başvuru 24 Ekim. Kayıtlar bu cuma kapanır.', ctx);
    expect(list.map((d) => d.resolution)).toEqual(['missing_year', 'ambiguous']);
    expect(list.every((d) => !d.dateOnly && !d.instantUtc)).toBe(true);
  });
  it('keeps multiple dated candidates separate and does not invent a timezone', () => {
    const list = extractDeadlineCandidates(
      'Son başvuru 24 Ekim 2026 saat 17:00. Görüşme 30 Ekim 2026.',
      ctx,
    );
    expect(list).toHaveLength(2);
    expect(list[0].resolution).toBe('missing_timezone');
    expect(list[0].instantUtc).toBeNull();
    expect(list[1].dateOnly).toBe('2026-10-30');
  });
  it('includes the full calendar deadline day in the selected zone', () => {
    const deadline = { dateOnly: '2026-10-24', instantUtc: null, timezone: 'Europe/Istanbul' };
    expect(isDeadlinePassed(deadline, new Date('2026-10-24T20:59:59Z'))).toBe(false);
    expect(isDeadlinePassed(deadline, new Date('2026-10-24T21:00:00Z'))).toBe(true);
  });
  it('rejects impossible calendar dates', () => {
    expect(isValidDateOnly('2026-02-30')).toBe(false);
    expect(isValidDateOnly('2028-02-29')).toBe(true);
  });
});
