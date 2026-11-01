import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { AuthGuard } from '../common/auth.guard';
import { CurrentAuth } from '../common/current-auth.decorator';
import type { AuthenticatedUserContext } from '../common/auth-context';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ClientService } from './client.service';
import { CreateClientDto } from './dto/create-client.dto';
import { ListClientsDto } from './dto/list-clients.dto';

@Controller('clients')
@UseGuards(AuthGuard, RolesGuard)
export class ClientController {
  constructor(private readonly clientService: ClientService) {}

  @Get()
  @Roles(
    MembershipRole.ADMIN,
    MembershipRole.FINANCE,
    MembershipRole.SALES,
    MembershipRole.VIEWER,
  )
  list(
    @CurrentAuth() auth: AuthenticatedUserContext,
    @Query() query: ListClientsDto,
  ) {
    return this.clientService.list(auth, query);
  }

  @Post()
  @Roles(MembershipRole.ADMIN, MembershipRole.FINANCE, MembershipRole.SALES)
  create(
    @CurrentAuth() auth: AuthenticatedUserContext,
    @Body() dto: CreateClientDto,
  ) {
    return this.clientService.create(auth, dto);
  }
}
