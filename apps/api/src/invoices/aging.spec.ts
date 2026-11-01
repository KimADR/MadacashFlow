import { buildAgingSummary, getAgingBucket } from './aging';

describe('invoice aging', () => {
  const today = '2026-11-01';

  it('keeps invoices due today in the current bucket', () => {
    expect(getAgingBucket(new Date('2026-11-01T00:00:00.000Z'), today)).toBe('current');
  });

  it.each([
    ['2026-10-31', 'days1To30'],
    ['2026-10-02', 'days1To30'],
    ['2026-10-01', 'days31To60'],
    ['2026-09-02', 'days31To60'],
    ['2026-09-01', 'days61To90'],
    ['2026-08-03', 'days61To90'],
    ['2026-08-02', 'over90'],
  ] as const)('assigns due date %s to %s', (dueDate, expectedBucket) => {
    expect(getAgingBucket(new Date(`${dueDate}T00:00:00.000Z`), today)).toBe(expectedBucket);
  });

  it('aggregates balances as decimal strings without Number conversion', () => {
    const summary = buildAgingSummary(
      [
        { dueDate: new Date('2026-11-01T00:00:00.000Z'), amountAr: 9_000_000_000_000_001n, count: 1 },
        { dueDate: new Date('2026-10-31T00:00:00.000Z'), amountAr: 3_000_000n, count: 2 },
      ],
      today,
    );

    expect(summary.totalOpenAr).toBe('9000000003000001');
    expect(summary.buckets.current.amountAr).toBe('9000000000000001');
    expect(summary.buckets.days1To30.count).toBe(2);
    expect(summary.dueNext7DaysAr).toBe('9000000000000001');
    expect(summary.dueNext7DaysCount).toBe(1);
  });
});
