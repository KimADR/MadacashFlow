import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUserContext } from '../common/auth-context';
import type { LoginDto } from './dto/login.dto';

const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS ?? 7);

if (!Number.isInteger(SESSION_TTL_DAYS) || SESSION_TTL_DAYS < 1 || SESSION_TTL_DAYS > 30) {
  throw new Error('SESSION_TTL_DAYS must be an integer between 1 and 30');
}

@Injectable()
export class AuthService {
  private readonly dummyPasswordHash = argon2.hash(randomBytes(32).toString('hex'));

  constructor(private readonly prisma: PrismaService) {}

  async login(dto: LoginDto): Promise<{
    sessionToken: string;
    expiresAt: Date;
    user: { id: string; email: string };
    memberships: Array<{
      tenantId: string;
      tenantName: string;
      role: MembershipRole;
    }>;
  }> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: { tenant: { select: { id: true, name: true, isActive: true } } },
        },
      },
    });

    const passwordHash = user?.passwordHash ?? (await this.dummyPasswordHash);
    const passwordMatches = await argon2.verify(passwordHash, dto.password);
    if (!user || !user.isActive || !passwordMatches) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Adresse e-mail ou mot de passe incorrect.',
      });
    }

    const activeMemberships = user.memberships.filter((membership) => membership.tenant.isActive);
    const sessionToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
    await this.prisma.session.create({
      data: {
        tokenHash: createHash('sha256').update(sessionToken).digest('hex'),
        userId: user.id,
        expiresAt,
      },
    });

    return {
      sessionToken,
      expiresAt,
      user: { id: user.id, email: user.email },
      memberships: activeMemberships.map((membership) => ({
        tenantId: membership.tenant.id,
        tenantName: membership.tenant.name,
        role: membership.role,
      })),
    };
  }

  async selectTenant(
    auth: AuthenticatedUserContext,
    tenantId: string,
  ): Promise<{ tenantId: string; tenantName: string; role: MembershipRole }> {
    const membership = await this.prisma.membership.findFirst({
      where: {
        userId: auth.userId,
        tenantId,
        tenant: { isActive: true },
      },
      include: { tenant: { select: { id: true, name: true } } },
    });

    if (!membership) {
      throw new ForbiddenException({
        code: 'TENANT_ACCESS_DENIED',
        message: 'Vous ne disposez pas d’un accès actif à cette entreprise.',
      });
    }

    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.session.updateMany({
        where: {
          id: auth.sessionId,
          userId: auth.userId,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { activeTenantId: tenantId },
      });

      if (result.count !== 1) {
        throw new UnauthorizedException({
          code: 'UNAUTHENTICATED',
          message: 'Session invalide ou expirée.',
        });
      }

      await transaction.auditLog.create({
        data: {
          tenantId,
          userId: auth.userId,
          action: 'TENANT_SELECTED',
          details: { previousTenantId: auth.tenantId, tenantId },
        },
      });
    });

    return {
      tenantId: membership.tenant.id,
      tenantName: membership.tenant.name,
      role: membership.role,
    };
  }

  async logout(auth: AuthenticatedUserContext): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.session.updateMany({
        where: {
          id: auth.sessionId,
          userId: auth.userId,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });

      if (auth.tenantId) {
        await transaction.auditLog.create({
          data: {
            tenantId: auth.tenantId,
            userId: auth.userId,
            action: 'SESSION_REVOKED',
            details: { sessionId: auth.sessionId },
          },
        });
      }
    });
  }
}
