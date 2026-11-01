import { Controller, Get, UseGuards } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { AuthGuard } from '../common/auth.guard';
import { CurrentAuth } from '../common/current-auth.decorator';
import type { AuthenticatedUserContext } from '../common/auth-context';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { TenantService } from './tenant.service';

@Controller('tenants')
@UseGuards(AuthGuard, RolesGuard)
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get('current')
  @Roles(
    MembershipRole.ADMIN,
    MembershipRole.FINANCE,
    MembershipRole.SALES,
    MembershipRole.VIEWER,
  )
  getCurrent(@CurrentAuth() auth: AuthenticatedUserContext) {
    return this.tenantService.getCurrent(auth);
  }
}
