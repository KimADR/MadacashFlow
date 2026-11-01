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
import { CollectionService } from './collection.service';
import { ListCollectionItemsDto } from './dto/list-collection-items.dto';
import { RecordDisputeDto } from './dto/record-dispute.dto';
import { RecordPromiseDto } from './dto/record-promise.dto';
import { RecordReminderDto } from './dto/record-reminder.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';

@Controller('collections')
@UseGuards(AuthGuard, RolesGuard)
export class CollectionController {
  constructor(private readonly collectionService: CollectionService) {}

  @Get()
  @Roles(
    MembershipRole.ADMIN,
    MembershipRole.FINANCE,
    MembershipRole.VIEWER,
  )
  list(
    @CurrentAuth() auth: AuthenticatedUserContext,
    @Query() query: ListCollectionItemsDto,
  ) {
    return this.collectionService.list(auth, query);
  }

  @Get('invoices/:invoiceId/events')
  @Roles(
    MembershipRole.ADMIN,
    MembershipRole.FINANCE,
    MembershipRole.VIEWER,
  )
  events(
    @CurrentAuth() auth: AuthenticatedUserContext,
    @Param('invoiceId', new ParseUUIDPipe()) invoiceId: string,
  ) {
    return this.collectionService.events(auth, invoiceId);
  }

  @Post('invoices/:invoiceId/reminders')
  @Roles(MembershipRole.ADMIN, MembershipRole.FINANCE)
  recordReminder(
    @CurrentAuth() auth: AuthenticatedUserContext,
    @Param('invoiceId', new ParseUUIDPipe()) invoiceId: string,
    @Body() dto: RecordReminderDto,
  ) {
    return this.collectionService.recordReminder(auth, invoiceId, dto);
  }

  @Post('invoices/:invoiceId/promises')
  @Roles(MembershipRole.ADMIN, MembershipRole.FINANCE)
  recordPromise(
    @CurrentAuth() auth: AuthenticatedUserContext,
    @Param('invoiceId', new ParseUUIDPipe()) invoiceId: string,
    @Body() dto: RecordPromiseDto,
  ) {
    return this.collectionService.recordPromise(auth, invoiceId, dto);
  }

  @Post('invoices/:invoiceId/disputes')
  @Roles(MembershipRole.ADMIN, MembershipRole.FINANCE)
  openDispute(
    @CurrentAuth() auth: AuthenticatedUserContext,
    @Param('invoiceId', new ParseUUIDPipe()) invoiceId: string,
    @Body() dto: RecordDisputeDto,
  ) {
    return this.collectionService.openDispute(auth, invoiceId, dto);
  }

  @Post('invoices/:invoiceId/disputes/resolve')
  @Roles(MembershipRole.ADMIN, MembershipRole.FINANCE)
  resolveDispute(
    @CurrentAuth() auth: AuthenticatedUserContext,
    @Param('invoiceId', new ParseUUIDPipe()) invoiceId: string,
    @Body() dto: ResolveDisputeDto,
  ) {
    return this.collectionService.resolveDispute(auth, invoiceId, dto);
  }
}
