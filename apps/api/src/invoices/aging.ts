import {
  calendarDateString,
  daysBetweenCalendarDates,
} from '../common/calendar-date';

export type AgingBucket =
  | 'current'
  | 'days1To30'
  | 'days31To60'
  | 'days61To90'
  | 'over90';

export interface AgingSummary {
  totalOpenAr: string;
  invoiceCount: number;
  dueNext7DaysAr: string;
  dueNext7DaysCount: number;
  buckets: Record<AgingBucket, { amountAr: string; count: number }>;
}

export function getAgingBucket(dueDate: Date, today: string): AgingBucket {
  const daysLate = daysBetweenCalendarDates(
    calendarDateString(dueDate),
    today,
  );
  if (daysLate <= 0) return 'current';
  if (daysLate <= 30) return 'days1To30';
  if (daysLate <= 60) return 'days31To60';
  if (daysLate <= 90) return 'days61To90';
  return 'over90';
}

export function buildAgingSummary(
  groups: Array<{
    dueDate: Date;
    amountAr: bigint;
    count: number;
  }>,
  today: string,
): AgingSummary {
  const buckets: AgingSummary['buckets'] = {
    current: { amountAr: '0', count: 0 },
    days1To30: { amountAr: '0', count: 0 },
    days31To60: { amountAr: '0', count: 0 },
    days61To90: { amountAr: '0', count: 0 },
    over90: { amountAr: '0', count: 0 },
  };
  const todayTime = new Date(`${today}T00:00:00.000Z`).getTime();
  const next7DaysTime = todayTime + 7 * 86_400_000;
  let totalOpenAr = 0n;
  let invoiceCount = 0;
  let dueNext7DaysAr = 0n;
  let dueNext7DaysCount = 0;

  for (const group of groups) {
    const bucket = buckets[getAgingBucket(group.dueDate, today)];
    bucket.amountAr = (BigInt(bucket.amountAr) + group.amountAr).toString();
    bucket.count += group.count;
    totalOpenAr += group.amountAr;
    invoiceCount += group.count;

    const dueTime = group.dueDate.getTime();
    if (dueTime >= todayTime && dueTime <= next7DaysTime) {
      dueNext7DaysAr += group.amountAr;
      dueNext7DaysCount += group.count;
    }
  }

  return {
    totalOpenAr: totalOpenAr.toString(),
    invoiceCount,
    dueNext7DaysAr: dueNext7DaysAr.toString(),
    dueNext7DaysCount,
    buckets,
  };
}
