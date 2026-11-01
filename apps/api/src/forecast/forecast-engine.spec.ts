import { buildCashForecast } from './forecast-engine';

describe('buildCashForecast', () => {
  const asOfDate = '2026-01-31';

  it('creates exactly thirteen calendar weeks, including month-end boundaries', () => {
    const result = buildCashForecast({
      asOfDate,
      openingBalanceAr: 1_000n,
      payments: [],
      invoices: [],
      expenses: [],
    });

    expect(result.weeks).toHaveLength(13);
    expect(result.weeks[0]).toMatchObject({
      startDate: '2026-02-01',
      endDate: '2026-02-07',
    });
    expect(result.weeks[12]).toMatchObject({
      startDate: '2026-04-26',
      endDate: '2026-05-02',
    });
    expect(
      result.weeks.every((week) => week.expectedClosingBalanceAr === '1000'),
    ).toBe(true);
  });

  it('returns a valid zero-flow projection when there is no financial activity', () => {
    const result = buildCashForecast({
      asOfDate,
      openingBalanceAr: 0n,
      payments: [],
      invoices: [],
      expenses: [],
    });

    expect(result.openReceivablesAr).toBe('0');
    expect(result.disputedReceivablesAr).toBe('0');
    expect(result.weeks[12].expectedClosingBalanceAr).toBe('0');
    expect(result.weeks[12].prudentClosingBalanceAr).toBe('0');
  });

  it('counts a confirmed partial payment once and reduces its forecast receivable', () => {
    const result = buildCashForecast({
      asOfDate,
      openingBalanceAr: 100n,
      payments: [{ receivedAt: '2026-02-03', amountAr: 30n }],
      invoices: [
        {
          dueDate: '2026-02-05',
          balanceAr: 100n,
          allocatedAfterAsOfAr: 30n,
          disputed: false,
          promise: null,
        },
      ],
      expenses: [],
    });

    expect(result.weeks[0]).toMatchObject({
      actualReceiptsAr: '30',
      expectedReceivablesAr: '70',
      promisedReceivablesAr: '0',
      expectedClosingBalanceAr: '200',
      prudentClosingBalanceAr: '200',
    });
  });

  it('separates a promise from the invoice residual without treating it as cash', () => {
    const result = buildCashForecast({
      asOfDate,
      openingBalanceAr: 100n,
      payments: [],
      invoices: [
        {
          dueDate: '2026-02-05',
          balanceAr: 1_000n,
          allocatedAfterAsOfAr: 0n,
          disputed: false,
          promise: { promisedDate: '2026-02-12', amountAr: 400n },
        },
      ],
      expenses: [],
    });

    expect(result.weeks[0]).toMatchObject({
      expectedReceivablesAr: '600',
      promisedReceivablesAr: '0',
      expectedClosingBalanceAr: '700',
    });
    expect(result.weeks[1]).toMatchObject({
      actualReceiptsAr: '0',
      expectedReceivablesAr: '0',
      promisedReceivablesAr: '400',
      expectedClosingBalanceAr: '1100',
    });
  });

  it('excludes overdue unpromised receivables from the prudent scenario', () => {
    const result = buildCashForecast({
      asOfDate,
      openingBalanceAr: 10n,
      payments: [],
      invoices: [
        {
          dueDate: '2026-01-30',
          balanceAr: 200n,
          allocatedAfterAsOfAr: 0n,
          disputed: false,
          promise: null,
        },
      ],
      expenses: [],
    });

    expect(result.weeks[0]).toMatchObject({
      expectedReceivablesAr: '200',
      expectedClosingBalanceAr: '210',
      prudentClosingBalanceAr: '10',
    });
  });

  it('excludes disputed invoice balances from projected receipts', () => {
    const result = buildCashForecast({
      asOfDate,
      openingBalanceAr: 10n,
      payments: [],
      invoices: [
        {
          dueDate: '2026-02-05',
          balanceAr: 200n,
          allocatedAfterAsOfAr: 0n,
          disputed: true,
          promise: { promisedDate: '2026-02-06', amountAr: 200n },
        },
      ],
      expenses: [],
    });

    expect(result.disputedReceivablesAr).toBe('200');
    expect(result.weeks[0].expectedReceivablesAr).toBe('0');
    expect(result.weeks[0].promisedReceivablesAr).toBe('0');
    expect(result.weeks[0].prudentClosingBalanceAr).toBe('10');
  });

  it('does not count activity already included on the opening balance date', () => {
    const result = buildCashForecast({
      asOfDate,
      openingBalanceAr: 500n,
      payments: [{ receivedAt: asOfDate, amountAr: 100n }],
      invoices: [
        {
          dueDate: '2026-02-05',
          balanceAr: 300n,
          allocatedAfterAsOfAr: 300n,
          disputed: false,
          promise: null,
        },
      ],
      expenses: [{ plannedDate: asOfDate, amountAr: 50n }],
    });

    expect(result.weeks[0].actualReceiptsAr).toBe('0');
    expect(result.weeks[0].expectedExpensesAr).toBe('0');
    expect(result.weeks[0].expectedReceivablesAr).toBe('0');
    expect(result.weeks[0].expectedClosingBalanceAr).toBe('500');
  });

  it('keeps projected values as integer strings and subtracts planned expenses', () => {
    const result = buildCashForecast({
      asOfDate,
      openingBalanceAr: 1_000_000_000_000_001n,
      payments: [],
      invoices: [],
      expenses: [{ plannedDate: '2026-02-01', amountAr: 1n }],
    });

    expect(result.weeks[0].expectedExpensesAr).toBe('1');
    expect(result.weeks[0].expectedClosingBalanceAr).toBe('1000000000000000');
  });
});
