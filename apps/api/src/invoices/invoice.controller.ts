import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { AuthGuard } from '../common/auth.guard';
import { CurrentAuth } from '../common/current-auth.decorator';
import type { AuthenticatedUserContext } from '../common/auth-context';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { ListInvoicesDto } from './dto/list-invoices.dto';
import { InvoiceService } from './invoice.service';

@Controller('invoices')
@UseGuards(AuthGuard, RolesGuard)
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Get()
  @Roles(
    MembershipRole.ADMIN,
    MembershipRole.FINANCE,
    MembershipRole.SALES,
    MembershipRole.VIEWER,
  )
  list(
    @CurrentAuth() auth: AuthenticatedUserContext,
    @Query() query: ListInvoicesDto,
  ) {
    return this.invoiceService.list(auth, query);
  }

  @Get('summary')
  @Roles(
    MembershipRole.ADMIN,
    MembershipRole.FINANCE,
    MembershipRole.SALES,
    MembershipRole.VIEWER,
  )
  agingSummary(@CurrentAuth() auth: AuthenticatedUserContext) {
    return this.invoiceService.agingSummary(auth);
  }

  @Post()
  @Roles(MembershipRole.ADMIN, MembershipRole.FINANCE, MembershipRole.SALES)
  create(
    @CurrentAuth() auth: AuthenticatedUserContext,
    @Body() dto: CreateInvoiceDto,
  ) {
    return this.invoiceService.create(auth, dto);
  }

  @Patch(':id/cancel')
  @Roles(MembershipRole.ADMIN, MembershipRole.FINANCE)
  cancel(
    @CurrentAuth() auth: AuthenticatedUserContext,
    @Param('id', new ParseUUIDPipe()) invoiceId: string,
  ) {
    return this.invoiceService.cancel(auth, invoiceId);
  }
}
