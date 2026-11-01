import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InvoiceStatus, MembershipRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

const userId = 'c0a80101-0000-4000-8000-000000000001';
const tenantAId = 'c0a80101-0000-4000-8000-000000000002';
const tenantBId = 'c0a80101-0000-4000-8000-000000000003';
const sessionId = 'c0a80101-0000-4000-8000-000000000004';
const clientId = 'c0a80101-0000-4000-8000-000000000005';
const csrfToken = 'test-csrf-token';

describe('Client and invoice tenant isolation', () => {
  let app: INestApplication;
  const prismaMock = {
    session: { findUnique: jest.fn() },
    client: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
    },
    invoice: {
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    prismaMock.session.findUnique.mockResolvedValue({
      id: sessionId,
      activeTenantId: tenantAId,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user: {
        id: userId,
        email: 'admin@example.test',
        isActive: true,
        memberships: [{
          role: MembershipRole.ADMIN,
          tenant: { id: tenantAId, name: 'Entreprise A', slug: 'entreprise-a', isActive: true },
        }],
      },
    });
    prismaMock.client.findMany.mockResolvedValue([
      { id: clientId, tenantId: tenantAId, reference: 'CLIENT-A', name: 'Client A' },
    ]);
    prismaMock.client.count.mockResolvedValue(1);
    prismaMock.invoice.findMany.mockResolvedValue([]);
    prismaMock.invoice.count.mockResolvedValue(0);
    prismaMock.invoice.groupBy.mockResolvedValue([]);
    prismaMock.$transaction.mockImplementation((operation: unknown) => {
      if (Array.isArray(operation)) return Promise.all(operation);
      if (typeof operation === 'function') return operation(prismaMock);
      throw new Error('Unsupported transaction in test mock.');
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('scopes client pagination to the session tenant', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/clients?page=2&limit=1')
      .set('Cookie', 'madacash_session=opaque-token')
      .set('x-tenant-id', tenantBId)
      .expect(200);

    expect(prismaMock.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: tenantAId },
        skip: 1,
        take: 1,
      }),
    );
    expect(prismaMock.client.count).toHaveBeenCalledWith({
      where: { tenantId: tenantAId },
    });
  });

  it('scopes invoice list results to the session tenant and serializes BIGINT as a string', async () => {
    prismaMock.invoice.findMany.mockResolvedValueOnce([{
      id: 'c0a80101-0000-4000-8000-000000000006',
      tenantId: tenantAId,
      clientId,
      number: 'FA-001',
      issueDate: new Date('2026-10-01T00:00:00.000Z'),
      dueDate: new Date('2026-11-01T00:00:00.000Z'),
      amountAr: 9_000_000_000_000_001n,
      status: InvoiceStatus.ACTIVE,
      cancelledAt: null,
      createdAt: new Date('2026-10-01T00:00:00.000Z'),
      updatedAt: new Date('2026-10-01T00:00:00.000Z'),
      client: { id: clientId, reference: 'CLIENT-A', name: 'Client A' },
      allocations: [],
    }]);

    const response = await request(app.getHttpServer())
      .get('/api/v1/invoices?page=1&limit=10')
      .set('Cookie', 'madacash_session=opaque-token')
      .set('x-tenant-id', tenantBId)
      .expect(200);

    expect(prismaMock.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: tenantAId } }),
    );
    expect(response.body.items[0].amountAr).toBe('9000000000000001');
    expect(response.body.items[0].issueDate).toBe('2026-10-01');
  });

  it('does not allow invoice creation using a client from another tenant', async () => {
    prismaMock.client.findFirst.mockResolvedValueOnce(null);

    await request(app.getHttpServer())
      .post('/api/v1/invoices')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', `madacash_session=opaque-token; madacash_csrf=${csrfToken}`)
      .set('X-CSRF-Token', csrfToken)
      .send({
        clientId,
        number: 'FA-001',
        issueDate: '2026-10-01',
        dueDate: '2026-11-01',
        amountAr: '3000000',
        tenantId: tenantBId,
      })
      .expect(400);

    expect(prismaMock.client.findFirst).not.toHaveBeenCalled();
  });

  it('rejects unknown client ids without revealing clients from other tenants', async () => {
    prismaMock.client.findFirst.mockResolvedValueOnce(null);

    await request(app.getHttpServer())
      .post('/api/v1/invoices')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', `madacash_session=opaque-token; madacash_csrf=${csrfToken}`)
      .set('X-CSRF-Token', csrfToken)
      .send({
        clientId,
        number: 'FA-001',
        issueDate: '2026-10-01',
        dueDate: '2026-11-01',
        amountAr: '3000000',
      })
      .expect(404);

    expect(prismaMock.client.findFirst).toHaveBeenCalledWith({
      where: { id: clientId, tenantId: tenantAId },
      select: { id: true },
    });
  });
});
