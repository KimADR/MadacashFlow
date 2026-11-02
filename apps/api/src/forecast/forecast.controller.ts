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
import { CreateForecastExpenseDto } from './dto/create-forecast-expense.dto';
import { ListForecastExpensesDto } from './dto/list-forecast-expenses.dto';
import { SetOpeningBalanceDto } from './dto/set-opening-balance.dto';
import { UpdateForecastExpenseDto } from './dto/update-forecast-expense.dto';
import { ForecastService } from './forecast.service';

const READ_ROLES = [
  MembershipRole.ADMIN,
  MembershipRole.FINANCE,
  MembershipRole.VIEWER,
];
const WRITE_ROLES = [MembershipRole.ADMIN, MembershipRole.FINANCE];

@Controller('forecast')
@UseGuards(AuthGuard, RolesGuard)
export class ForecastController {
  constructor(private readonly forecastService: ForecastService) {}

  @Get()
  @Roles(...READ_ROLES)
  forecast(@CurrentAuth() auth: AuthenticatedUserContext) {
    return this.forecastService.forecast(auth);
  }

  @Get('opening-balance')
  @Roles(...READ_ROLES)
  async openingBalance(@CurrentAuth() auth: AuthenticatedUserContext) {
    return {
      openingBalance: await this.forecastService.currentOpeningBalance(auth),
    };
  }

  @Post('opening-balance')
  @Roles(...WRITE_ROLES)
  setOpeningBalance(
    @CurrentAuth() auth: AuthenticatedUserContext,
    @Body() dto: SetOpeningBalanceDto,
  ) {
    return this.forecastService.setOpeningBalance(auth, dto);
  }

  @Get('expenses')
  @Roles(...READ_ROLES)
  expenses(
    @CurrentAuth() auth: AuthenticatedUserContext,
    @Query() query: ListForecastExpensesDto,
  ) {
    return this.forecastService.listExpenses(auth, query);
  }

  @Post('expenses')
  @Roles(...WRITE_ROLES)
  createExpense(
    @CurrentAuth() auth: AuthenticatedUserContext,
    @Body() dto: CreateForecastExpenseDto,
  ) {
    return this.forecastService.createExpense(auth, dto);
  }

  @Patch('expenses/:expenseId')
  @Roles(...WRITE_ROLES)
  updateExpense(
    @CurrentAuth() auth: AuthenticatedUserContext,
    @Param('expenseId', new ParseUUIDPipe()) expenseId: string,
    @Body() dto: UpdateForecastExpenseDto,
  ) {
    return this.forecastService.updateExpense(auth, expenseId, dto);
  }

  @Post('expenses/:expenseId/cancel')
  @Roles(...WRITE_ROLES)
  cancelExpense(
    @CurrentAuth() auth: AuthenticatedUserContext,
    @Param('expenseId', new ParseUUIDPipe()) expenseId: string,
  ) {
    return this.forecastService.cancelExpense(auth, expenseId);
  }
}
