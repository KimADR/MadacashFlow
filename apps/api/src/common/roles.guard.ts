import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { MembershipRole } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator';
import type { AuthenticatedRequest } from './request';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<MembershipRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.auth?.tenantId || !request.auth.role || !requiredRoles.includes(request.auth.role)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Accès interdit pour ce rôle ou cette entreprise.' });
    }

    return true;
  }
}
