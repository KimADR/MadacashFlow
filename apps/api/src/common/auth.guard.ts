import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { parse } from 'cookie';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedRequest } from './request';

export const SESSION_COOKIE_NAME = 'madacash_session';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = parse(request.headers.cookie ?? '')[SESSION_COOKIE_NAME];
    if (!token) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Session requise.' });
    }

    const session = await this.prisma.session.findUnique({
      where: { tokenHash: createHash('sha256').update(token).digest('hex') },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            isActive: true,
            memberships: {
              include: {
                tenant: { select: { id: true, name: true, slug: true, isActive: true } },
              },
            },
          },
        },
      },
    });

    const now = new Date();
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      !session.user.isActive
    ) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Session invalide ou expirée.' });
    }

    const memberships = session.user.memberships.map((membership) => ({
      tenantId: membership.tenant.id,
      tenantName: membership.tenant.name,
      tenantSlug: membership.tenant.slug,
      isTenantActive: membership.tenant.isActive,
      role: membership.role,
    }));
    const activeMembership = memberships.find(
      (membership) =>
        membership.tenantId === session.activeTenantId && membership.isTenantActive,
    );

    request.auth = {
      userId: session.user.id,
      email: session.user.email,
      sessionId: session.id,
      tenantId: activeMembership?.tenantId ?? null,
      role: activeMembership?.role ?? null,
      memberships,
    };

    return true;
  }
}
