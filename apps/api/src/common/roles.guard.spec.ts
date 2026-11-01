import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  it('denies a role not authorized by the route', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([MembershipRole.ADMIN]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          auth: {
            userId: 'user-id',
            email: 'viewer@example.test',
            sessionId: 'session-id',
            tenantId: 'tenant-id',
            role: MembershipRole.VIEWER,
            memberships: [],
          },
        }),
      }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('requires an active tenant context even if the role is otherwise allowed', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([MembershipRole.ADMIN]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          auth: {
            userId: 'user-id',
            email: 'admin@example.test',
            sessionId: 'session-id',
            tenantId: null,
            role: MembershipRole.ADMIN,
            memberships: [],
          },
        }),
      }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
