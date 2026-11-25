import { describe, expect, it } from 'vitest';
import type { Opportunity } from '../../packages/shared/src/contracts';
import { dateParts, deadlineDate, daysUntil, formatDate } from '../../apps/web/src/lib/format';

describe('display dates in the selected timezone', () => {
  it('moves an instant to the selected calendar day', () => {
    expect(
      formatDate('2026-10-15T01:00:00Z', { day: 'numeric', month: 'long' }, 'America/Los_Angeles'),
    ).toBe('14 Ekim');
    expect(dateParts('2026-10-15T01:00:00Z', 'America/Los_Angeles').day).toBe('14');
  });
  it('keeps date-only deadlines independent of timezone', () => {
    expect(formatDate('2026-10-15', { day: 'numeric', month: 'long' }, 'Pacific/Honolulu')).toBe(
      '15 Ekim',
    );
    expect(dateParts('2026-10-15', 'Pacific/Honolulu').day).toBe('15');
  });
  it('places exact deadlines on the selected calendar day', () => {
    const item = { confirmedDeadline: { instantUtc: '2026-10-15T01:00:00Z' } } as Opportunity;
    expect(deadlineDate(item, 'America/Los_Angeles')).toBe('2026-10-14');
    expect(deadlineDate(item, 'Europe/Istanbul')).toBe('2026-10-15');
  });
  it('calculates days left using the selected timezone rather than system timezone', () => {
    const now = new Date('2026-10-15T01:00:00Z');
    expect(daysUntil('2026-10-15', 'America/Los_Angeles', now)).toBe(1);
    expect(daysUntil('2026-10-15', 'Europe/Istanbul', now)).toBe(0);
  });
});
