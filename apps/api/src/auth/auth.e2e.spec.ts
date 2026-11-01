import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MembershipRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

const userId = 'c0a80101-0000-4000-8000-000000000001';
const tenantAId = 'c0a80101-0000-4000-8000-000000000002';
const tenantBId = 'c0a80101-0000-4000-8000-000000000003';
const sessionId = 'c0a80101-0000-4000-8000-000000000004';
const csrfToken = 'test-csrf-token';

describe('Authentication and tenant isolation', () => {
  let app: INestApplication;
  const prismaMock = {
    session: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    membership: {
      findFirst: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
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
        memberships: [
          {
            role: MembershipRole.ADMIN,
            tenant: {
              id: tenantAId,
              name: 'Entreprise A',
              slug: 'entreprise-a',
              isActive: true,
            },
          },
        ],
      },
    });
    prismaMock.membership.findFirst.mockResolvedValue({
      role: MembershipRole.ADMIN,
      tenant: { id: tenantAId, name: 'Entreprise A', slug: 'entreprise-a' },
    });
    prismaMock.session.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.auditLog.create.mockResolvedValue({});
    prismaMock.$transaction.mockImplementation(
      async (callback: (transaction: typeof prismaMock) => Promise<unknown>) =>
        callback(prismaMock),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects requests without a valid session', async () => {
    prismaMock.session.findUnique.mockResolvedValueOnce(null);

    await request(app.getHttpServer())
      .get('/api/v1/tenants/current')
      .expect(401);
  });

  it('rejects expired and revoked sessions', async () => {
    prismaMock.session.findUnique
      .mockResolvedValueOnce({
        id: sessionId,
        activeTenantId: tenantAId,
        expiresAt: new Date(Date.now() - 1_000),
        revokedAt: null,
        user: { id: userId, email: 'admin@example.test', isActive: true, memberships: [] },
      })
      .mockResolvedValueOnce({
        id: sessionId,
        activeTenantId: tenantAId,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date(),
        user: { id: userId, email: 'admin@example.test', isActive: true, memberships: [] },
      });

    await request(app.getHttpServer())
      .get('/api/v1/tenants/current')
      .set('Cookie', 'madacash_session=opaque-token')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/tenants/current')
      .set('Cookie', 'madacash_session=opaque-token')
      .expect(401);
  });

  it('uses the tenant from the verified session, not a client-supplied tenant id', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/tenants/current?tenantId=${tenantBId}`)
      .set('Cookie', 'madacash_session=opaque-token')
      .set('x-tenant-id', tenantBId)
      .expect(200);

    expect(response.body.tenant.id).toBe(tenantAId);
    expect(response.body.role).toBe(MembershipRole.ADMIN);
  });

  it('allows the session owner to select an active tenant they belong to and audits the choice', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/tenant')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', `madacash_session=opaque-token; madacash_csrf=${csrfToken}`)
      .set('X-CSRF-Token', csrfToken)
      .send({ tenantId: tenantAId })
      .expect(201);

    expect(response.body.tenant.tenantId).toBe(tenantAId);
    expect(prismaMock.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { activeTenantId: tenantAId } }),
    );
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'TENANT_SELECTED', tenantId: tenantAId }),
      }),
    );
  });

  it('denies selecting a tenant outside the user memberships', async () => {
    prismaMock.membership.findFirst.mockResolvedValueOnce(null);

    await request(app.getHttpServer())
      .post('/api/v1/auth/tenant')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', `madacash_session=opaque-token; madacash_csrf=${csrfToken}`)
      .set('X-CSRF-Token', csrfToken)
      .send({ tenantId: tenantBId })
      .expect(403);
  });

  it('revokes the server session on logout', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', `madacash_session=opaque-token; madacash_csrf=${csrfToken}`)
      .set('X-CSRF-Token', csrfToken)
      .expect(201);

    expect(prismaMock.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: sessionId }) }),
    );
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'SESSION_REVOKED', tenantId: tenantAId }),
      }),
    );
  });

  it('rejects state-changing requests with an untrusted origin or invalid CSRF token', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/tenant')
      .set('Origin', 'https://attacker.example')
      .set('Cookie', `madacash_session=opaque-token; madacash_csrf=${csrfToken}`)
      .set('X-CSRF-Token', csrfToken)
      .send({ tenantId: tenantAId })
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/v1/auth/tenant')
      .set('Origin', 'http://localhost:3000')
      .set('Cookie', `madacash_session=opaque-token; madacash_csrf=${csrfToken}`)
      .set('X-CSRF-Token', 'different-token')
      .send({ tenantId: tenantAId })
      .expect(403);
  });
});
