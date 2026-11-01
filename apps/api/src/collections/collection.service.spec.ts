import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  CollectionChannel,
  CollectionEventType,
  InvoiceStatus,
  MembershipRole,
} from '@prisma/client';
import type { AuthenticatedUserContext } from '../common/auth-context';
import { PrismaService } from '../prisma/prisma.service';
import { CollectionService } from './collection.service';

const tenantId = 'c0a80101-0000-4000-8000-000000000002';
const invoiceId = 'c0a80101-0000-4000-8000-000000000003';
const caseId = 'c0a80101-0000-4000-8000-000000000004';
const userId = 'c0a80101-0000-4000-8000-000000000001';
const tomorrow = (() => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Indian/Antananarivo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return new Date(
    Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) + 1),
  )
    .toISOString()
    .slice(0, 10);
})();
const auth: AuthenticatedUserContext = {
  userId,
  email: 'finance@example.test',
  sessionId: 'c0a80101-0000-4000-8000-000000000005',
  tenantId,
  role: MembershipRole.FINANCE,
  memberships: [],
};

function harness() {
  const transaction = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: invoiceId }]),
    invoice: {
      findFirst: jest.fn().mockResolvedValue({
        id: invoiceId,
        number: 'FA-001',
        amountAr: 3_000_000n,
        status: InvoiceStatus.ACTIVE,
        allocations: [{ amountAr: 1_000_000n }],
      }),
    },
    collectionCase: {
      upsert: jest.fn().mockResolvedValue({
        id: caseId,
        disputedAt: null,
        disputeReason: null,
      }),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    collectionEvent: {
      create: jest.fn().mockResolvedValue({
        id: 'c0a80101-0000-4000-8000-000000000006',
        tenantId,
        collectionCaseId: caseId,
        userId,
        type: CollectionEventType.PROMISE_RECORDED,
        channel: null,
        note: null,
        promisedDate: new Date(`${tomorrow}T00:00:00.000Z`),
        amountAr: 1_000_000n,
        createdAt: new Date('2026-11-01T10:00:00.000Z'),
        user: { email: auth.email },
      }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $queryRaw: jest.fn(),
    $transaction: jest.fn((operation: (tx: typeof transaction) => unknown) =>
      operation(transaction),
    ),
    invoice: { findFirst: jest.fn() },
    collectionCase: { findUnique: jest.fn() },
  };
  return {
    service: new CollectionService(prisma as unknown as PrismaService),
    prisma,
    transaction,
  };
}

describe('CollectionService', () => {
  it('lists outstanding balances as decimal strings and scopes query to session tenant', async () => {
    const { service, prisma } = harness();
    prisma.$queryRaw.mockResolvedValue([
      {
        id: invoiceId,
        number: 'FA-001',
        dueDate: new Date('2026-11-15T00:00:00.000Z'),
        amountAr: 3_000_000n,
        remainingAr: 2_000_000n,
        clientId: 'c0a80101-0000-4000-8000-000000000007',
        clientReference: 'CLIENT-001',
        clientName: 'Client fictif',
        collectionCaseId: caseId,
        disputedAt: null,
        disputeReason: null,
        promisedDate: new Date('2026-11-15T00:00:00.000Z'),
        promisedAmountAr: 1_000_000n,
        latestEventType: CollectionEventType.PROMISE_RECORDED,
        totalCount: 1n,
      },
    ]);

    const result = await service.list(auth, { page: 1, limit: 25 });

    expect(result.items[0]).toMatchObject({
      amountAr: '3000000',
      remainingAr: '2000000',
      promise: { amountAr: '1000000', promisedDate: '2026-11-15' },
    });
    expect(result.pagination.total).toBe(1);
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });

  it('records promises as collection events without changing invoice allocations', async () => {
    const { service, transaction } = harness();

    const result = await service.recordPromise(auth, invoiceId, {
      promisedDate: tomorrow,
      amountAr: '1000000',
      note: 'Paiement prévu après validation.',
    });

    expect(result).toMatchObject({
      amountAr: '1000000',
      promisedDate: tomorrow,
      remainingAr: '2000000',
    });
    expect(transaction.collectionEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: CollectionEventType.PROMISE_RECORDED,
          amountAr: 1_000_000n,
          promisedDate: new Date(`${tomorrow}T00:00:00.000Z`),
        }),
      }),
    );
    expect(transaction.auditLog.create).toHaveBeenCalled();
  });

  it('blocks manual reminders while a dispute is open', async () => {
    const { service, transaction } = harness();
    transaction.collectionCase.upsert.mockResolvedValueOnce({
      id: caseId,
      disputedAt: new Date(),
      disputeReason: 'Montant contesté',
    });

    await expect(
      service.recordReminder(auth, invoiceId, {
        channel: CollectionChannel.PHONE,
        note: 'Appel à faire',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.collectionEvent.create).not.toHaveBeenCalled();
  });

  it('rejects promises above the current invoice balance', async () => {
    const { service, transaction } = harness();

    await expect(
      service.recordPromise(auth, invoiceId, {
        promisedDate: tomorrow,
        amountAr: '2000001',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.collectionEvent.create).not.toHaveBeenCalled();
  });

  it('rejects invalid promise dates', async () => {
    const { service } = harness();
    await expect(
      service.recordPromise(auth, invoiceId, {
        promisedDate: '2026-02-30',
        amountAr: '100',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects dispute reasons containing only whitespace', async () => {
    const { service, prisma } = harness();
    await expect(
      service.openDispute(auth, invoiceId, { reason: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not expose invoice ids from another tenant', async () => {
    const { service, transaction } = harness();
    transaction.$queryRaw.mockResolvedValueOnce([]);

    await expect(
      service.recordReminder(auth, invoiceId, {
        channel: CollectionChannel.EMAIL,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(transaction.invoice.findFirst).not.toHaveBeenCalled();
  });

  it('records reminders with channel and actor for auditability', async () => {
    const { service, transaction } = harness();
    transaction.collectionEvent.create.mockResolvedValueOnce({
      id: 'c0a80101-0000-4000-8000-000000000008',
      tenantId,
      collectionCaseId: caseId,
      userId,
      type: CollectionEventType.REMINDER_RECORDED,
      channel: CollectionChannel.EMAIL,
      note: 'Courriel envoyé manuellement.',
      promisedDate: null,
      amountAr: null,
      createdAt: new Date('2026-11-01T10:00:00.000Z'),
      user: { email: auth.email },
    });

    const result = await service.recordReminder(auth, invoiceId, {
      channel: CollectionChannel.EMAIL,
      note: 'Courriel envoyé manuellement.',
    });

    expect(result).toMatchObject({
      type: CollectionEventType.REMINDER_RECORDED,
      channel: CollectionChannel.EMAIL,
      user: { email: auth.email },
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'COLLECTION_REMINDER_RECORDED',
          details: expect.objectContaining({
            invoiceId,
            channel: CollectionChannel.EMAIL,
          }),
        }),
      }),
    );
  });
});
