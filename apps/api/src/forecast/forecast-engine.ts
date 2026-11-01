import {
  calendarDateString,
  daysBetweenCalendarDates,
  parseCalendarDate,
} from '../common/calendar-date';

const DAYS_IN_WEEK = 7;
const FORECAST_WEEKS = 13;

export type ForecastPayment = {
  receivedAt: string;
  amountAr: bigint;
};

export type ForecastInvoice = {
  dueDate: string;
  balanceAr: bigint;
  allocatedAfterAsOfAr: bigint;
  disputed: boolean;
  promise: { promisedDate: string; amountAr: bigint } | null;
};

export type ForecastExpense = {
  plannedDate: string;
  amountAr: bigint;
};

export type ForecastWeek = {
  week: number;
  startDate: string;
  endDate: string;
  actualReceiptsAr: string;
  expectedReceivablesAr: string;
  promisedReceivablesAr: string;
  expectedExpensesAr: string;
  expectedClosingBalanceAr: string;
  prudentClosingBalanceAr: string;
};

export type ForecastResult = {
  asOfDate: string;
  openingBalanceAr: string;
  openReceivablesAr: string;
  disputedReceivablesAr: string;
  weeks: ForecastWeek[];
};

function addCalendarDays(date: string, days: number): string {
  const parsed = parseCalendarDate(date);
  if (!parsed) throw new Error('Expected a valid ISO calendar date.');
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return calendarDateString(parsed);
}

function requireNonnegative(value: bigint, field: string): void {
  if (value < 0n) throw new Error(`${field} must not be negative.`);
}

function requirePositive(value: bigint, field: string): void {
  if (value <= 0n) throw new Error(`${field} must be positive.`);
}

function getWeekIndex(date: string, asOfDate: string): number | null {
  const dayOffset = daysBetweenCalendarDates(asOfDate, date);
  if (dayOffset <= 0) return 0;
  const index = Math.floor((dayOffset - 1) / DAYS_IN_WEEK);
  return index < FORECAST_WEEKS ? index : null;
}

export function buildCashForecast(input: {
  asOfDate: string;
  openingBalanceAr: bigint;
  payments: ForecastPayment[];
  invoices: ForecastInvoice[];
  expenses: ForecastExpense[];
}): ForecastResult {
  if (!parseCalendarDate(input.asOfDate)) {
    throw new Error('Expected a valid ISO calendar date for the forecast.');
  }
  requireNonnegative(input.openingBalanceAr, 'openingBalanceAr');

  const weekStartDates = Array.from({ length: FORECAST_WEEKS }, (_, index) =>
    addCalendarDays(input.asOfDate, index * DAYS_IN_WEEK + 1),
  );
  const weekEndDates = Array.from({ length: FORECAST_WEEKS }, (_, index) =>
    addCalendarDays(input.asOfDate, (index + 1) * DAYS_IN_WEEK),
  );
  const actualReceipts = Array<bigint>(FORECAST_WEEKS).fill(0n);
  const expectedReceivables = Array<bigint>(FORECAST_WEEKS).fill(0n);
  const promisedReceivables = Array<bigint>(FORECAST_WEEKS).fill(0n);
  const prudentReceivables = Array<bigint>(FORECAST_WEEKS).fill(0n);
  const expectedExpenses = Array<bigint>(FORECAST_WEEKS).fill(0n);

  for (const payment of input.payments) {
    requirePositive(payment.amountAr, 'payment.amountAr');
    if (!parseCalendarDate(payment.receivedAt)) {
      throw new Error('Expected a valid ISO calendar date for a payment.');
    }
    if (payment.receivedAt <= input.asOfDate) continue;
    const index = getWeekIndex(payment.receivedAt, input.asOfDate);
    if (index !== null) actualReceipts[index] += payment.amountAr;
  }

  let openReceivablesAr = 0n;
  let disputedReceivablesAr = 0n;
  for (const invoice of input.invoices) {
    requireNonnegative(invoice.balanceAr, 'invoice.balanceAr');
    requireNonnegative(
      invoice.allocatedAfterAsOfAr,
      'invoice.allocatedAfterAsOfAr',
    );
    if (!parseCalendarDate(invoice.dueDate)) {
      throw new Error('Expected a valid ISO calendar date for an invoice.');
    }
    if (invoice.balanceAr === 0n) continue;

    openReceivablesAr += invoice.balanceAr;
    const remainingAr =
      invoice.balanceAr > invoice.allocatedAfterAsOfAr
        ? invoice.balanceAr - invoice.allocatedAfterAsOfAr
        : 0n;
    if (invoice.disputed) {
      disputedReceivablesAr += remainingAr;
      continue;
    }

    let promisedAr = 0n;
    let promiseIndex: number | null = null;
    if (invoice.promise) {
      requirePositive(invoice.promise.amountAr, 'invoice.promise.amountAr');
      if (!parseCalendarDate(invoice.promise.promisedDate)) {
        throw new Error('Expected a valid ISO calendar date for a promise.');
      }
      if (invoice.promise.promisedDate > input.asOfDate) {
        promiseIndex = getWeekIndex(
          invoice.promise.promisedDate,
          input.asOfDate,
        );
        promisedAr =
          invoice.promise.amountAr < remainingAr
            ? invoice.promise.amountAr
            : remainingAr;
        if (promiseIndex !== null) {
          promisedReceivables[promiseIndex] += promisedAr;
          prudentReceivables[promiseIndex] += promisedAr;
        }
      }
    }

    const unpaidAr = remainingAr - promisedAr;
    if (unpaidAr === 0n) continue;

    const dueIndex = getWeekIndex(invoice.dueDate, input.asOfDate);
    if (dueIndex === null) continue;

    expectedReceivables[dueIndex] += unpaidAr;
    if (invoice.dueDate > input.asOfDate) {
      prudentReceivables[dueIndex] += unpaidAr;
    }
  }

  for (const expense of input.expenses) {
    requirePositive(expense.amountAr, 'expense.amountAr');
    if (!parseCalendarDate(expense.plannedDate)) {
      throw new Error('Expected a valid ISO calendar date for an expense.');
    }
    if (expense.plannedDate <= input.asOfDate) continue;
    const index = getWeekIndex(expense.plannedDate, input.asOfDate);
    if (index !== null) expectedExpenses[index] += expense.amountAr;
  }

  let expectedBalance = input.openingBalanceAr;
  let prudentBalance = input.openingBalanceAr;
  const weeks = weekStartDates.map((startDate, index) => {
    expectedBalance +=
      actualReceipts[index] +
      expectedReceivables[index] +
      promisedReceivables[index] -
      expectedExpenses[index];
    prudentBalance +=
      actualReceipts[index] +
      prudentReceivables[index] -
      expectedExpenses[index];
    return {
      week: index + 1,
      startDate,
      endDate: weekEndDates[index],
      actualReceiptsAr: actualReceipts[index].toString(),
      expectedReceivablesAr: expectedReceivables[index].toString(),
      promisedReceivablesAr: promisedReceivables[index].toString(),
      expectedExpensesAr: expectedExpenses[index].toString(),
      expectedClosingBalanceAr: expectedBalance.toString(),
      prudentClosingBalanceAr: prudentBalance.toString(),
    };
  });

  return {
    asOfDate: input.asOfDate,
    openingBalanceAr: input.openingBalanceAr.toString(),
    openReceivablesAr: openReceivablesAr.toString(),
    disputedReceivablesAr: disputedReceivablesAr.toString(),
    weeks,
  };
}
