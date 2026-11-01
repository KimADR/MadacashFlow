import { ConflictException } from '@nestjs/common';
import { InvoiceStatus, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUserContext } from '../common/auth-context';
import { PaymentService } from './payment.service';

const tenantId = 'c0a80101-0000-4000-8000-000000000002';
const paymentId = 'c0a80101-0000-4000-8000-000000000006';
const invoiceId = 'c0a80101-0000-4000-8000-000000000007';
const clientId = 'c0a80101-0000-4000-8000-000000000008';
const auth: AuthenticatedUserContext = {
  userId: 'c0a80101-0000-4000-8000-000000000001',
  email: 'finance@example.test',
  sessionId: 'c0a80101-0000-4000-8000-000000000004',
  tenantId,
  role: 'FINANCE',
  memberships: [],
};

function createHarness() {
  const transaction = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: paymentId }]),
    payment: { findFirst: jest.fn() },
    invoice: { findFirst: jest.fn() },
    paymentAllocation: {
      findUnique: jest.fn().mockResolvedValue(null),
      aggregate: jest.fn(),
      create: jest.fn().mockResolvedValue({
        id: 'c0a80101-0000-4000-8000-000000000009',
      }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: jest.fn((operation: (tx: typeof transaction) => unknown) =>
      operation(transaction),
    ),
  };
  return {
    service: new PaymentService(prisma as unknown as PrismaService),
    transaction,
  };
}

describe('PaymentService allocation invariants', () => {
  it('refuses allocations while a payment is pending', async () => {
    const { service, transaction } = createHarness();
    transaction.payment.findFirst.mockResolvedValue({
      id: paymentId,
      clientId,
      amountAr: 1_000n,
      status: PaymentStatus.PENDING,
    });

    await expect(
      service.allocate(auth, paymentId, { invoiceId, amountAr: '500' }),
    ).rejects.toMatchObject({ status: 409, response: { code: 'PAYMENT_NOT_CONFIRMED' } });
    expect(transaction.invoice.findFirst).not.toHaveBeenCalled();
    expect(transaction.paymentAllocation.create).not.toHaveBeenCalled();
  });

  it('refuses an allocation that exceeds the remaining invoice balance', async () => {
    const { service, transaction } = createHarness();
    transaction.payment.findFirst.mockResolvedValue({
      id: paymentId,
      clientId,
      amountAr: 1_000n,
      status: PaymentStatus.CONFIRMED,
    });
    transaction.invoice.findFirst.mockResolvedValue({
      id: invoiceId,
      clientId,
      amountAr: 1_000n,
      status: InvoiceStatus.ACTIVE,
    });
    transaction.paymentAllocation.aggregate
      .mockResolvedValueOnce({ _sum: { amountAr: 0n } })
      .mockResolvedValueOnce({ _sum: { amountAr: 800n } });

    await expect(
      service.allocate(auth, paymentId, { invoiceId, amountAr: '201' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.paymentAllocation.create).not.toHaveBeenCalled();
  });

  it('refuses an allocation that exceeds the unallocated payment balance', async () => {
    const { service, transaction } = createHarness();
    transaction.payment.findFirst.mockResolvedValue({
      id: paymentId,
      clientId,
      amountAr: 1_000n,
      status: PaymentStatus.CONFIRMED,
    });
    transaction.invoice.findFirst.mockResolvedValue({
      id: invoiceId,
      clientId,
      amountAr: 2_000n,
      status: InvoiceStatus.ACTIVE,
    });
    transaction.paymentAllocation.aggregate.mockResolvedValueOnce({
      _sum: { amountAr: 900n },
    });

    await expect(
      service.allocate(auth, paymentId, { invoiceId, amountAr: '101' }),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'PAYMENT_OVERALLOCATION' },
    });
    expect(transaction.paymentAllocation.create).not.toHaveBeenCalled();
  });

  it('records an allocation and an audit entry using decimal string amounts', async () => {
    const { service, transaction } = createHarness();
    transaction.payment.findFirst.mockResolvedValue({
      id: paymentId,
      clientId,
      amountAr: 1_000n,
      status: PaymentStatus.CONFIRMED,
    });
    transaction.invoice.findFirst.mockResolvedValue({
      id: invoiceId,
      clientId,
      amountAr: 2_000n,
      status: InvoiceStatus.ACTIVE,
    });
    transaction.paymentAllocation.aggregate
      .mockResolvedValueOnce({ _sum: { amountAr: 100n } })
      .mockResolvedValueOnce({ _sum: { amountAr: 500n } });

    await expect(
      service.allocate(auth, paymentId, { invoiceId, amountAr: '300' }),
    ).resolves.toEqual({
      id: 'c0a80101-0000-4000-8000-000000000009',
      paymentId,
      invoiceId,
      amountAr: '300',
    });
    expect(transaction.paymentAllocation.create).toHaveBeenCalledWith({
      data: { tenantId, paymentId, invoiceId, amountAr: 300n },
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'PAYMENT_ALLOCATED',
          details: expect.objectContaining({ amountAr: '300' }),
        }),
      }),
    );
  });

  it('treats a repeated identical allocation as idempotent', async () => {
    const { service, transaction } = createHarness();
    transaction.payment.findFirst.mockResolvedValue({
      id: paymentId,
      clientId,
      amountAr: 1_000n,
      status: PaymentStatus.CONFIRMED,
    });
    transaction.invoice.findFirst.mockResolvedValue({
      id: invoiceId,
      clientId,
      amountAr: 2_000n,
      status: InvoiceStatus.ACTIVE,
    });
    transaction.paymentAllocation.findUnique.mockResolvedValue({
      id: 'c0a80101-0000-4000-8000-000000000009',
      amountAr: 300n,
    });

    await expect(
      service.allocate(auth, paymentId, { invoiceId, amountAr: '300' }),
    ).resolves.toEqual({
      id: 'c0a80101-0000-4000-8000-000000000009',
      paymentId,
      invoiceId,
      amountAr: '300',
    });
    expect(transaction.paymentAllocation.aggregate).not.toHaveBeenCalled();
    expect(transaction.paymentAllocation.create).not.toHaveBeenCalled();
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
  });
});
