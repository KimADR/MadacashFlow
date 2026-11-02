import { ConflictException, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, MembershipRole, PaymentMethod, PaymentStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUserContext } from '../src/common/auth-context';
import { PrismaService } from '../src/prisma/prisma.service';
import { PaymentService } from '../src/payments/payment.service';

describe('PostgreSQL payment allocation invariants', () => {
  const prisma = new PrismaService();
  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  const userId = randomUUID();
  const invoiceId = randomUUID();
  const paymentAIds = [randomUUID(), randomUUID()];
  const paymentBId = randomUUID();
  const tenantASlug = `integration-a-${tenantAId}`;
  const tenantBSlug = `integration-b-${tenantBId}`;
  const service = new PaymentService(prisma);

  const auth: AuthenticatedUserContext = {
    userId,
    email: 'integration@example.test',
    sessionId: randomUUID(),
    tenantId: tenantAId,
    role: MembershipRole.FINANCE,
    memberships: [],
  };

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes('/madacash_test')) {
      throw new Error('PostgreSQL integration tests require the isolated madacash_test database.');
    }

    await prisma.$connect();
    await prisma.tenant.createMany({
      data: [
        { id: tenantAId, name: 'Integration A', slug: tenantASlug },
        { id: tenantBId, name: 'Integration B', slug: tenantBSlug },
      ],
    });
    await prisma.user.create({
      data: {
        id: userId,
        email: 'integration@example.test',
        passwordHash: 'not-used-by-integration-test',
      },
    });
    const clientA = await prisma.client.create({
      data: {
        tenantId: tenantAId,
        reference: 'CLIENT-A',
        name: 'Client A',
      },
    });
    const clientB = await prisma.client.create({
      data: {
        tenantId: tenantBId,
        reference: 'CLIENT-B',
        name: 'Client B',
      },
    });
    await prisma.invoice.create({
      data: {
        id: invoiceId,
        tenantId: tenantAId,
        clientId: clientA.id,
        number: 'INTEGRATION-001',
        issueDate: new Date('2026-10-01T00:00:00.000Z'),
        dueDate: new Date('2026-11-01T00:00:00.000Z'),
        amountAr: 1_000n,
      },
    });
    const receivedAt = new Date();
    await prisma.payment.createMany({
      data: [
        ...paymentAIds.map((id) => ({
          id,
          tenantId: tenantAId,
          clientId: clientA.id,
          amountAr: 700n,
          receivedAt,
          method: PaymentMethod.CASH,
          status: PaymentStatus.CONFIRMED,
          confirmedAt: new Date(),
        })),
        {
          id: paymentBId,
          tenantId: tenantBId,
          clientId: clientB.id,
          amountAr: 700n,
          receivedAt,
          method: PaymentMethod.CASH,
          status: PaymentStatus.CONFIRMED,
          confirmedAt: new Date(),
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.paymentAllocation.deleteMany({
      where: { tenantId: { in: [tenantAId, tenantBId] } },
    });
    await prisma.payment.deleteMany({
      where: { tenantId: { in: [tenantAId, tenantBId] } },
    });
    await prisma.invoice.deleteMany({ where: { tenantId: tenantAId } });
    await prisma.client.deleteMany({
      where: { tenantId: { in: [tenantAId, tenantBId] } },
    });
    await prisma.tenant.deleteMany({
      where: { slug: { in: [tenantASlug, tenantBSlug] } },
    });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('serializes competing allocations and prevents invoice over-allocation', async () => {
    const results = await Promise.allSettled(
      paymentAIds.map((paymentId) =>
        service.allocate(auth, paymentId, { invoiceId, amountAr: '700' }),
      ),
    );
    const successful = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    const allocationTotal = await prisma.paymentAllocation.aggregate({
      where: { tenantId: tenantAId, invoiceId },
      _sum: { amountAr: true },
    });
    const allocatedAr = allocationTotal._sum.amountAr ?? 0n;

    expect(successful).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);
    expect(allocatedAr).toBe(700n);
    expect(allocatedAr).toBeLessThanOrEqual(1_000n);

    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      select: { amountAr: true, status: true },
    });
    expect(invoice.status).toBe(InvoiceStatus.ACTIVE);
    expect((invoice.amountAr - allocatedAr).toString()).toBe('300');
  });

  it('does not allow a tenant to allocate another tenant’s payment', async () => {
    await expect(
      service.allocate(auth, paymentBId, { invoiceId, amountAr: '100' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      await prisma.paymentAllocation.count({ where: { tenantId: tenantBId } }),
    ).toBe(0);
  });
});
