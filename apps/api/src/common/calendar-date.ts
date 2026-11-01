const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseCalendarDate(value: string): Date | null {
  if (!CALENDAR_DATE_PATTERN.test(value)) {
    return null;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

export function calendarDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function madagascarToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Indian/Antananarivo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

  return `${values.year}-${values.month}-${values.day}`;
}

export function daysBetweenCalendarDates(fromDate: string, toDate: string): number {
  const from = parseCalendarDate(fromDate);
  const to = parseCalendarDate(toDate);
  if (!from || !to) {
    throw new Error('Expected valid ISO calendar dates.');
  }

  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}
