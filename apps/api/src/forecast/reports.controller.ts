import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { AuthGuard } from '../common/auth.guard';
import { CurrentAuth } from '../common/current-auth.decorator';
import type { AuthenticatedUserContext } from '../common/auth-context';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(AuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('aging.csv')
  @Roles(MembershipRole.ADMIN, MembershipRole.FINANCE, MembershipRole.VIEWER)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="balance-agee.csv"')
  agingCsv(@CurrentAuth() auth: AuthenticatedUserContext) {
    return this.reportsService.agingCsv(auth);
  }
}
