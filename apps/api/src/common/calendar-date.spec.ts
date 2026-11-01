import {
  daysBetweenCalendarDates,
  madagascarToday,
  parseCalendarDate,
} from './calendar-date';

describe('calendar dates', () => {
  it('rejects invalid calendar dates instead of normalizing them', () => {
    expect(parseCalendarDate('2026-02-29')).toBeNull();
    expect(parseCalendarDate('2026-11-01T00:00:00Z')).toBeNull();
    expect(parseCalendarDate('2024-02-29')?.toISOString()).toBe(
      '2024-02-29T00:00:00.000Z',
    );
  });

  it('counts calendar days across month boundaries', () => {
    expect(daysBetweenCalendarDates('2026-10-31', '2026-11-01')).toBe(1);
  });

  it('uses the Madagascar business calendar date', () => {
    expect(madagascarToday(new Date('2026-10-31T22:30:00.000Z'))).toBe('2026-11-01');
  });
});
