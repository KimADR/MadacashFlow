import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUserContext } from '../common/auth-context';

@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrent(auth: AuthenticatedUserContext) {
    if (!auth.tenantId || !auth.role) {
      throw new ForbiddenException({
        code: 'TENANT_NOT_SELECTED',
        message: 'Sélectionnez une entreprise autorisée pour continuer.',
      });
    }

    const membership = await this.prisma.membership.findFirst({
      where: {
        userId: auth.userId,
        tenantId: auth.tenantId,
        tenant: { isActive: true },
      },
      select: {
        role: true,
        tenant: { select: { id: true, name: true, slug: true } },
      },
    });

    if (!membership) {
      throw new ForbiddenException({
        code: 'TENANT_ACCESS_DENIED',
        message: 'Votre accès à cette entreprise n’est plus actif.',
      });
    }

    return {
      tenant: membership.tenant,
      role: membership.role,
    };
  }
}
