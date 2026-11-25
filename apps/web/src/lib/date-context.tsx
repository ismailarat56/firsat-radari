import { createContext, useContext, useMemo } from 'react';
import type { Opportunity } from '@shared/contracts';
import * as format from './format';

export const DateTimezone = createContext(format.defaultTimezone);

export function useDateFormat() {
  const timezone = useContext(DateTimezone);
  return useMemo(
    () => ({
      timezone,
      calendarDay: (value: string | Date) => format.calendarDay(value, timezone),
      formatDate: (value: string, options?: Intl.DateTimeFormatOptions) =>
        format.formatDate(value, options, timezone),
      formatTime: (value: string | null) => format.formatTime(value, timezone),
      dateParts: (value: string) => format.dateParts(value, timezone),
      deadlineDate: (item: Opportunity) => format.deadlineDate(item, timezone),
      daysUntil: (value: string) => format.daysUntil(value, timezone),
    }),
    [timezone],
  );
}
