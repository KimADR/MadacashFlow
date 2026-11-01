import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CollectionEventType,
  ForecastExpenseStatus,
  InvoiceStatus,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import type { AuthenticatedUserContext } from '../common/auth-context';
import {
  calendarDateString,
  madagascarToday,
  parseCalendarDate,
} from '../common/calendar-date';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateForecastExpenseDto } from './dto/create-forecast-expense.dto';
import type { ListForecastExpensesDto } from './dto/list-forecast-expenses.dto';
import type { SetOpeningBalanceDto } from './dto/set-opening-balance.dto';
import type { UpdateForecastExpenseDto } from './dto/update-forecast-expense.dto';
import { buildCashForecast } from './forecast-engine';

const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;
const FORECAST_DAYS = 13 * 7;

type ExpenseRecord = {
  id: string;
  description: string;
  plannedDate: Date;
  amountAr: bigint;
  status: ForecastExpenseStatus;
  createdAt: Date;
  updatedAt: Date;
};

function toApiExpense(expense: ExpenseRecord) {
  return {
    ...expense,
    plannedDate: calendarDateString(expense.plannedDate),
    amountAr: expense.amountAr.toString(),
  };
}

function addCalendarDays(value: string, days: number): string {
  const date = parseCalendarDate(value);
  if (!date) throw new Error('Expected a valid ISO calendar date.');
  date.setUTCDate(date.getUTCDate() + days);
  return calendarDateString(date);
}

@Injectable()
export class ForecastService {
  constructor(private readonly prisma: PrismaService) {}

  async currentOpeningBalance(auth: AuthenticatedUserContext) {
    const tenantId = this.requireTenant(auth);
    const today = madagascarToday();
    const balance = await this.prisma.cashOpeningBalance.findUnique({
      where: {
        tenantId_asOfDate: {
          tenantId,
          asOfDate: parseCalendarDate(today)!,
        },
      },
    });
    return balance
      ? {
          id: balance.id,
          asOfDate: calendarDateString(balance.asOfDate),
          amountAr: balance.amountAr.toString(),
          updatedAt: balance.updatedAt.toISOString(),
        }
      : null;
  }

  async setOpeningBalance(
    auth: AuthenticatedUserContext,
    dto: SetOpeningBalanceDto,
  ) {
    const tenantId = this.requireTenant(auth);
    const asOfDate = parseCalendarDate(dto.asOfDate);
    const today = madagascarToday();
    if (!asOfDate || dto.asOfDate !== today) {
      throw new BadRequestException({
        code: 'OPENING_BALANCE_DATE_MUST_BE_TODAY',
        message: 'Le solde initial doit être saisi pour la date du jour.',
      });
    }
    const amountAr = this.parseAmount(dto.amountAr, true);

    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.cashOpeningBalance.findUnique({
        where: { tenantId_asOfDate: { tenantId, asOfDate } },
        select: { amountAr: true },
      });
      const balance = await transaction.cashOpeningBalance.upsert({
        where: { tenantId_asOfDate: { tenantId, asOfDate } },
        create: { tenantId, asOfDate, amountAr },
        update: { amountAr },
      });
      await transaction.auditLog.create({
        data: {
          tenantId,
          userId: auth.userId,
          action: 'CASH_OPENING_BALANCE_SET',
          details: {
            asOfDate: dto.asOfDate,
            previousAmountAr: current?.amountAr.toString() ?? null,
            amountAr: amountAr.toString(),
          },
        },
      });
      return {
        id: balance.id,
        asOfDate: calendarDateString(balance.asOfDate),
        amountAr: balance.amountAr.toString(),
        updatedAt: balance.updatedAt.toISOString(),
      };
    });
  }

  async listExpenses(
    auth: AuthenticatedUserContext,
    query: ListForecastExpensesDto,
  ) {
    const tenantId = this.requireTenant(auth);
    const today = parseCalendarDate(madagascarToday())!;
    const horizonEnd = parseCalendarDate(
      addCalendarDays(madagascarToday(), FORECAST_DAYS),
    )!;
    const where: Prisma.ForecastExpenseWhereInput = {
      tenantId,
      plannedDate: { gt: today, lte: horizonEnd },
      ...(query.status ? { status: query.status } : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.forecastExpense.findMany({
        where,
        orderBy: [{ plannedDate: 'asc' }, { id: 'asc' }],
        skip,
        take: query.limit,
      }),
      this.prisma.forecastExpense.count({ where }),
    ]);
    return {
      items: items.map((item) => toApiExpense(item)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      },
    };
  }

  async createExpense(
    auth: AuthenticatedUserContext,
    dto: CreateForecastExpenseDto,
  ) {
    const tenantId = this.requireTenant(auth);
    const description = this.parseDescription(dto.description);
    const plannedDate = this.parseFutureDate(dto.plannedDate);
    const amountAr = this.parseAmount(dto.amountAr);

    return this.prisma.$transaction(async (transaction) => {
      const expense = await transaction.forecastExpense.create({
        data: { tenantId, description, plannedDate, amountAr },
      });
      await this.audit(
        transaction,
        auth,
        tenantId,
        'FORECAST_EXPENSE_CREATED',
        {
          expenseId: expense.id,
          description,
          plannedDate: dto.plannedDate,
          amountAr: amountAr.toString(),
        },
      );
      return toApiExpense(expense);
    });
  }

  async updateExpense(
    auth: AuthenticatedUserContext,
    expenseId: string,
    dto: UpdateForecastExpenseDto,
  ) {
    const tenantId = this.requireTenant(auth);
    const data: Prisma.ForecastExpenseUpdateManyMutationInput = {};
    if (dto.description !== undefined) {
      data.description = this.parseDescription(dto.description);
    }
    if (dto.plannedDate !== undefined) {
      data.plannedDate = this.parseFutureDate(dto.plannedDate);
    }
    if (dto.amountAr !== undefined) {
      data.amountAr = this.parseAmount(dto.amountAr);
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException({
        code: 'EMPTY_FORECAST_EXPENSE_UPDATE',
        message: 'Indiquez au moins un champ à modifier.',
      });
    }

    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.forecastExpense.findFirst({
        where: {
          id: expenseId,
          tenantId,
          status: ForecastExpenseStatus.PLANNED,
        },
      });
      if (!current) throw this.expenseNotFound();
      const result = await transaction.forecastExpense.updateMany({
        where: {
          id: expenseId,
          tenantId,
          status: ForecastExpenseStatus.PLANNED,
        },
        data,
      });
      if (result.count !== 1) {
        throw new ConflictException({
          code: 'FORECAST_EXPENSE_CHANGED',
          message: 'Cette dépense a changé. Actualisez la page.',
        });
      }
      const expense = await transaction.forecastExpense.findFirst({
        where: { id: expenseId, tenantId },
      });
      if (!expense) throw this.expenseNotFound();
      await this.audit(
        transaction,
        auth,
        tenantId,
        'FORECAST_EXPENSE_UPDATED',
        {
          expenseId,
          changes: {
            ...(dto.description !== undefined
              ? { description: dto.description.trim() }
              : {}),
            ...(dto.plannedDate !== undefined
              ? { plannedDate: dto.plannedDate }
              : {}),
            ...(dto.amountAr !== undefined ? { amountAr: dto.amountAr } : {}),
          },
        },
      );
      return toApiExpense(expense);
    });
  }

  async cancelExpense(auth: AuthenticatedUserContext, expenseId: string) {
    const tenantId = this.requireTenant(auth);
    return this.prisma.$transaction(async (transaction) => {
      const result = await transaction.forecastExpense.updateMany({
        where: {
          id: expenseId,
          tenantId,
          status: ForecastExpenseStatus.PLANNED,
        },
        data: { status: ForecastExpenseStatus.CANCELLED },
      });
      if (result.count === 0) throw this.expenseNotFound();
      await this.audit(
        transaction,
        auth,
        tenantId,
        'FORECAST_EXPENSE_CANCELLED',
        {
          expenseId,
        },
      );
      return { id: expenseId, status: ForecastExpenseStatus.CANCELLED };
    });
  }

  async forecast(auth: AuthenticatedUserContext) {
    const tenantId = this.requireTenant(auth);
    const today = madagascarToday();
    const asOfDate = parseCalendarDate(today)!;
    const openingBalance = await this.prisma.cashOpeningBalance.findUnique({
      where: { tenantId_asOfDate: { tenantId, asOfDate } },
    });
    if (!openingBalance) {
      return {
        configured: false,
        openingBalance: null,
        forecast: null,
      };
    }

    const horizonEnd = parseCalendarDate(
      addCalendarDays(today, FORECAST_DAYS),
    )!;
    const [payments, invoices, expenses] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          tenantId,
          status: PaymentStatus.CONFIRMED,
          receivedAt: { gt: asOfDate, lte: horizonEnd },
        },
        select: {
          receivedAt: true,
          amountAr: true,
          allocations: { select: { invoiceId: true, amountAr: true } },
        },
      }),
      this.prisma.invoice.findMany({
        where: { tenantId, status: InvoiceStatus.ACTIVE },
        select: {
          id: true,
          dueDate: true,
          amountAr: true,
          allocations: {
            where: {
              payment: {
                status: PaymentStatus.CONFIRMED,
                receivedAt: { lte: asOfDate },
              },
            },
            select: { amountAr: true },
          },
          collectionCase: {
            select: {
              disputedAt: true,
              events: {
                where: {
                  type: CollectionEventType.PROMISE_RECORDED,
                },
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                take: 1,
                select: { promisedDate: true, amountAr: true },
              },
            },
          },
        },
      }),
      this.prisma.forecastExpense.findMany({
        where: {
          tenantId,
          status: ForecastExpenseStatus.PLANNED,
          plannedDate: { gt: asOfDate, lte: horizonEnd },
        },
        select: { plannedDate: true, amountAr: true },
      }),
    ]);

    const futureAllocatedByInvoice = new Map<string, bigint>();
    for (const payment of payments) {
      for (const allocation of payment.allocations) {
        futureAllocatedByInvoice.set(
          allocation.invoiceId,
          (futureAllocatedByInvoice.get(allocation.invoiceId) ?? 0n) +
            allocation.amountAr,
        );
      }
    }
    const forecast = buildCashForecast({
      asOfDate: today,
      openingBalanceAr: openingBalance.amountAr,
      payments: payments.map((payment) => ({
        receivedAt: calendarDateString(payment.receivedAt),
        amountAr: payment.amountAr,
      })),
      invoices: invoices.map((invoice) => {
        const balanceAr =
          invoice.amountAr -
          invoice.allocations.reduce(
            (sum, allocation) => sum + allocation.amountAr,
            0n,
          );
        const latestPromise = invoice.collectionCase?.events[0];
        return {
          dueDate: calendarDateString(invoice.dueDate),
          balanceAr: balanceAr > 0n ? balanceAr : 0n,
          allocatedAfterAsOfAr: futureAllocatedByInvoice.get(invoice.id) ?? 0n,
          disputed: invoice.collectionCase?.disputedAt != null,
          promise:
            latestPromise?.promisedDate && latestPromise.amountAr !== null
              ? {
                  promisedDate: calendarDateString(latestPromise.promisedDate),
                  amountAr: latestPromise.amountAr,
                }
              : null,
        };
      }),
      expenses: expenses.map((expense) => ({
        plannedDate: calendarDateString(expense.plannedDate),
        amountAr: expense.amountAr,
      })),
    });

    return {
      configured: true,
      openingBalance: {
        asOfDate: today,
        amountAr: openingBalance.amountAr.toString(),
        updatedAt: openingBalance.updatedAt.toISOString(),
      },
      forecast,
    };
  }

  private parseFutureDate(value: string): Date {
    const date = parseCalendarDate(value);
    const today = madagascarToday();
    if (!date) {
      throw new BadRequestException({
        code: 'INVALID_CALENDAR_DATE',
        message: 'La date doit être une date calendaire valide.',
      });
    }
    if (value <= today) {
      throw new BadRequestException({
        code: 'FORECAST_DATE_NOT_FUTURE',
        message: 'La date prévue doit être postérieure à aujourd’hui.',
      });
    }
    if (value > addCalendarDays(today, FORECAST_DAYS)) {
      throw new BadRequestException({
        code: 'FORECAST_DATE_OUTSIDE_HORIZON',
        message:
          'La date prévue doit se situer dans les 13 prochaines semaines.',
      });
    }
    return date;
  }

  private parseDescription(value: string): string {
    const description = value.trim();
    if (!description) {
      throw new BadRequestException({
        code: 'INVALID_FORECAST_EXPENSE_DESCRIPTION',
        message: 'La description de la dépense ne peut pas être vide.',
      });
    }
    return description;
  }

  private parseAmount(value: string, allowZero = false): bigint {
    if (!/^(0|[1-9]\d{0,18})$/.test(value)) {
      throw new BadRequestException({
        code: 'INVALID_FORECAST_AMOUNT',
        message: 'Le montant doit être un entier en ariary.',
      });
    }
    const amountAr = BigInt(value);
    if (
      (allowZero ? amountAr < 0n : amountAr <= 0n) ||
      amountAr > MAX_POSTGRES_BIGINT
    ) {
      throw new BadRequestException({
        code: 'INVALID_FORECAST_AMOUNT',
        message: allowZero
          ? 'Le montant doit être un entier positif ou nul en ariary.'
          : 'Le montant doit être un entier positif en ariary.',
      });
    }
    return amountAr;
  }

  private async audit(
    transaction: Prisma.TransactionClient,
    auth: AuthenticatedUserContext,
    tenantId: string,
    action: string,
    details: Prisma.InputJsonObject,
  ) {
    await transaction.auditLog.create({
      data: { tenantId, userId: auth.userId, action, details },
    });
  }

  private requireTenant(auth: AuthenticatedUserContext): string {
    if (!auth.tenantId || !auth.role) {
      throw new ForbiddenException({
        code: 'TENANT_NOT_SELECTED',
        message: 'Sélectionnez une entreprise avant de continuer.',
      });
    }
    return auth.tenantId;
  }

  private expenseNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'FORECAST_EXPENSE_NOT_FOUND',
      message: 'Dépense prévue introuvable dans cette entreprise.',
    });
  }
}
