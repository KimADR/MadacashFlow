import { UnauthorizedException } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService', () => {
  const prismaMock = {
    user: { findUnique: jest.fn() },
    session: { create: jest.fn() },
  };
  let authService: AuthService;
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await argon2.hash('correct-local-password', {
      type: argon2.argon2id,
    });
  });

  beforeEach(() => {
    jest.resetAllMocks();
    authService = new AuthService(prismaMock as unknown as PrismaService);
    prismaMock.session.create.mockResolvedValue({});
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'c0a80101-0000-4000-8000-000000000001',
      email: 'admin@example.test',
      passwordHash,
      isActive: true,
      memberships: [
        {
          role: MembershipRole.ADMIN,
          tenant: {
            id: 'c0a80101-0000-4000-8000-000000000002',
            name: 'Entreprise A',
            isActive: true,
          },
        },
      ],
    });
  });

  it('creates a session with only a hash of the opaque token', async () => {
    const result = await authService.login({
      email: ' ADMIN@example.test ',
      password: 'correct-local-password',
    });
    const createSession = prismaMock.session.create.mock.calls[0][0];

    expect(result.sessionToken).toHaveLength(43);
    expect(createSession.data.tokenHash).toHaveLength(64);
    expect(createSession.data.tokenHash).not.toBe(result.sessionToken);
    expect(createSession.data.userId).toBe('c0a80101-0000-4000-8000-000000000001');
    expect(result.memberships[0].role).toBe(MembershipRole.ADMIN);
  });

  it('returns the same authentication error for an unknown account or wrong password', async () => {
    await expect(
      authService.login({ email: 'admin@example.test', password: 'incorrect-password' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    await expect(
      authService.login({ email: 'missing@example.test', password: 'incorrect-password' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  }, 30_000);
});
