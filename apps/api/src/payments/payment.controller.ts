import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { CreateAllocationDto } from './dto/create-allocation.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ListPaymentsDto } from './dto/list-payments.dto';
import { PaymentService } from './payment.service';

@Controller('payments')
@UseGuards(AuthGuard, RolesGuard)
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Get()
  @Roles(
    MembershipRole.ADMIN,
    MembershipRole.FINANCE,
    MembershipRole.SALES,
    MembershipRole.VIEWER,
  )
  list(
    @CurrentAuth() auth: AuthenticatedUserContext,
    @Query() query: ListPaymentsDto,
  ) {
    return this.paymentService.list(auth, query);
  }

  @Post()
  @Roles(MembershipRole.ADMIN, MembershipRole.FINANCE)
  create(
    @CurrentAuth() auth: AuthenticatedUserContext,
    @Body() dto: CreatePaymentDto,
  ) {
    return this.paymentService.create(auth, dto);
  }

  @Post(':id/confirm')
  @Roles(MembershipRole.ADMIN, MembershipRole.FINANCE)
  confirm(
    @CurrentAuth() auth: AuthenticatedUserContext,
    @Param('id', new ParseUUIDPipe()) paymentId: string,
  ) {
    return this.paymentService.confirm(auth, paymentId);
  }

  @Post(':id/allocations')
  @Roles(MembershipRole.ADMIN, MembershipRole.FINANCE)
  allocate(
    @CurrentAuth() auth: AuthenticatedUserContext,
    @Param('id', new ParseUUIDPipe()) paymentId: string,
    @Body() dto: CreateAllocationDto,
  ) {
    return this.paymentService.allocate(auth, paymentId, dto);
  }
}
