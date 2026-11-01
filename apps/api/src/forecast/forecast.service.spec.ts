import { BadRequestException } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import type { AuthenticatedUserContext } from '../common/auth-context';
import { madagascarToday, parseCalendarDate } from '../common/calendar-date';
import { PrismaService } from '../prisma/prisma.service';
import { ForecastService } from './forecast.service';

const tenantId = 'c0a80101-0000-4000-8000-000000000002';
const invoiceId = 'c0a80101-0000-4000-8000-000000000003';
const expenseId = 'c0a80101-0000-4000-8000-000000000004';
const userId = 'c0a80101-0000-4000-8000-000000000001';
const auth: AuthenticatedUserContext = {
  userId,
  email: 'finance@example.test',
  sessionId: 'c0a80101-0000-4000-8000-000000000005',
  tenantId,
  role: MembershipRole.FINANCE,
  memberships: [],
};

function addDays(date: string, days: number): string {
  const parsed = parseCalendarDate(date)!;
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function harness() {
  const today = madagascarToday();
  const transaction = {
    cashOpeningBalance: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({
        id: 'c0a80101-0000-4000-8000-000000000006',
        asOfDate: parseCalendarDate(today),
        amountAr: 1_000n,
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    },
    forecastExpense: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: jest.fn((operation: (tx: typeof transaction) => unknown) =>
      operation(transaction),
    ),
    cashOpeningBalance: transaction.cashOpeningBalance,
    forecastExpense: transaction.forecastExpense,
    payment: { findMany: jest.fn().mockResolvedValue([]) },
    invoice: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return {
    today,
    service: new ForecastService(prisma as unknown as PrismaService),
    prisma,
    transaction,
  };
}

describe('ForecastService', () => {
  it('does not silently invent an opening balance when none is set', async () => {
    const { service, prisma, today } = harness();

    await expect(service.forecast(auth)).resolves.toMatchObject({
      configured: false,
      openingBalance: null,
      forecast: null,
    });
    expect(prisma.cashOpeningBalance.findUnique).toHaveBeenCalledWith({
      where: {
        tenantId_asOfDate: {
          tenantId,
          asOfDate: parseCalendarDate(today),
        },
      },
    });
    expect(prisma.invoice.findMany).not.toHaveBeenCalled();
  });

  it('calculates future confirmed receipts and allocations within the session tenant', async () => {
    const { service, prisma, today } = harness();
    const receiptDate = addDays(today, 3);
    prisma.cashOpeningBalance.findUnique.mockResolvedValue({
      id: 'c0a80101-0000-4000-8000-000000000006',
      tenantId,
      asOfDate: parseCalendarDate(today),
      amountAr: 1_000n,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    prisma.payment.findMany.mockResolvedValue([
      {
        receivedAt: parseCalendarDate(receiptDate),
        amountAr: 200n,
        allocations: [{ invoiceId, amountAr: 200n }],
      },
    ]);
    prisma.invoice.findMany.mockResolvedValue([
      {
        id: invoiceId,
        dueDate: parseCalendarDate(addDays(today, 5)),
        amountAr: 1_000n,
        allocations: [{ amountAr: 100n }],
        collectionCase: { disputedAt: null, events: [] },
      },
    ]);

    const result = await service.forecast(auth);

    expect(result).toMatchObject({
      configured: true,
      openingBalance: { asOfDate: today, amountAr: '1000' },
      forecast: { openReceivablesAr: '900' },
    });
    if (!result.configured) throw new Error('Expected a configured forecast.');
    expect(result.forecast.weeks[0]).toMatchObject({
      actualReceiptsAr: '200',
      expectedReceivablesAr: '700',
      expectedClosingBalanceAr: '1900',
    });
    expect(prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId }),
      }),
    );
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId }),
      }),
    );
  });

  it('audits a daily opening balance and rejects a date other than today', async () => {
    const { service, transaction, today } = harness();

    await expect(
      service.setOpeningBalance(auth, { asOfDate: today, amountAr: '1000000' }),
    ).resolves.toMatchObject({ asOfDate: today, amountAr: '1000' });
    expect(transaction.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'CASH_OPENING_BALANCE_SET',
          tenantId,
          userId,
        }),
      }),
    );
    await expect(
      service.setOpeningBalance(auth, {
        asOfDate: addDays(today, -1),
        amountAr: '1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects whitespace-only expenses and dates that are not in the future', async () => {
    const { service, today } = harness();
    await expect(
      service.createExpense(auth, {
        description: '   ',
        plannedDate: addDays(today, 1),
        amountAr: '10',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createExpense(auth, {
        description: 'Loyer',
        plannedDate: today,
        amountAr: '10',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createExpense(auth, {
        description: 'Loyer',
        plannedDate: addDays(today, 92),
        amountAr: '10',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('scopes expense cancellation to the tenant and records an audit event', async () => {
    const { service, prisma, transaction } = harness();

    await expect(service.cancelExpense(auth, expenseId)).resolves.toMatchObject(
      {
        id: expenseId,
        status: 'CANCELLED',
      },
    );
    expect(prisma.forecastExpense.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: expenseId,
          tenantId,
          status: 'PLANNED',
        }),
      }),
    );
    expect(transaction.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'FORECAST_EXPENSE_CANCELLED',
          tenantId,
        }),
      }),
    );
  });
});
