import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InvoiceStatus,
  MembershipRole,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import {
  calendarDateString,
  madagascarToday,
  parseCalendarDate,
} from '../common/calendar-date';
import type { AuthenticatedUserContext } from '../common/auth-context';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateInvoiceDto } from './dto/create-invoice.dto';
import type { ListInvoicesDto } from './dto/list-invoices.dto';
import { buildAgingSummary } from './aging';

const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;

function toApiInvoice<T extends { amountAr: bigint; issueDate: Date; dueDate: Date }>(
  invoice: T,
): Omit<T, 'amountAr' | 'issueDate' | 'dueDate'> & {
  amountAr: string;
  issueDate: string;
  dueDate: string;
} {
  return {
    ...invoice,
    amountAr: invoice.amountAr.toString(),
    issueDate: calendarDateString(invoice.issueDate),
    dueDate: calendarDateString(invoice.dueDate),
  };
}

@Injectable()
export class InvoiceService {
  constructor(private readonly prisma: PrismaService) {}

  async list(auth: AuthenticatedUserContext, query: ListInvoicesDto) {
    const tenantId = this.requireTenant(auth);
    if (query.dueAfter && query.dueBefore && query.dueAfter > query.dueBefore) {
      throw new BadRequestException({
        code: 'INVALID_DUE_DATE_RANGE',
        message: 'La date de début doit précéder la date de fin.',
      });
    }

    const search = query.search?.trim();
    const where: Prisma.InvoiceWhereInput = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.dueAfter || query.dueBefore
        ? {
            dueDate: {
              ...(query.dueAfter
                ? { gte: parseCalendarDate(query.dueAfter)! }
                : {}),
              ...(query.dueBefore
                ? { lte: parseCalendarDate(query.dueBefore)! }
                : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { number: { contains: search, mode: 'insensitive' } },
              { client: { name: { contains: search, mode: 'insensitive' } } },
              { client: { reference: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        include: {
          client: { select: { id: true, reference: true, name: true } },
          allocations: {
            where: { payment: { status: PaymentStatus.CONFIRMED } },
            select: { amountAr: true },
          },
        },
        orderBy: [{ dueDate: 'asc' }, { issueDate: 'desc' }, { id: 'asc' }],
        skip,
        take: query.limit,
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      items: items.map(({ allocations, ...invoice }) => {
        const allocatedAr = allocations.reduce(
          (sum, allocation) => sum + allocation.amountAr,
          0n,
        );
        const remainingAr =
          invoice.status === InvoiceStatus.ACTIVE
            ? invoice.amountAr - allocatedAr
            : 0n;
        return { ...toApiInvoice(invoice), remainingAr: remainingAr.toString() };
      }),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      },
    };
  }

  async create(auth: AuthenticatedUserContext, dto: CreateInvoiceDto) {
    const tenantId = this.requireTenant(auth);
    const issueDate = parseCalendarDate(dto.issueDate);
    const dueDate = parseCalendarDate(dto.dueDate);
    if (!issueDate || !dueDate || dueDate < issueDate) {
      throw new BadRequestException({
        code: 'INVALID_INVOICE_DATES',
        message: 'Les dates doivent être valides et l’échéance ne peut précéder la date de facture.',
      });
    }
    const amountAr = BigInt(dto.amountAr);
    if (amountAr <= 0n || amountAr > MAX_POSTGRES_BIGINT) {
      throw new BadRequestException({
        code: 'INVALID_INVOICE_AMOUNT',
        message: 'Le montant doit être un entier positif en ariary dans la limite autorisée.',
      });
    }

    const client = await this.prisma.client.findFirst({
      where: { id: dto.clientId, tenantId },
      select: { id: true },
    });
    if (!client) {
      throw new NotFoundException({
        code: 'CLIENT_NOT_FOUND',
        message: 'Client introuvable dans cette entreprise.',
      });
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const invoice = await transaction.invoice.create({
          data: {
            tenantId,
            clientId: client.id,
            number: dto.number.trim(),
            issueDate,
            dueDate,
            amountAr,
          },
          include: { client: { select: { id: true, reference: true, name: true } } },
        });
        await transaction.auditLog.create({
          data: {
            tenantId,
            userId: auth.userId,
            action: 'INVOICE_CREATED',
            details: {
              invoiceId: invoice.id,
              clientId: invoice.clientId,
              number: invoice.number,
              amountAr: invoice.amountAr.toString(),
            },
          },
        });

        return toApiInvoice(invoice);
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'INVOICE_NUMBER_EXISTS',
          message: 'Ce numéro de facture existe déjà pour ce client.',
        });
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new NotFoundException({
          code: 'CLIENT_NOT_FOUND',
          message: 'Client introuvable dans cette entreprise.',
        });
      }
      throw error;
    }
  }

  async cancel(
    auth: AuthenticatedUserContext,
    invoiceId: string,
  ): Promise<{ status: InvoiceStatus }> {
    const tenantId = this.requireTenant(auth);
    return this.prisma.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Invoice"
        WHERE "id" = ${invoiceId}::uuid AND "tenantId" = ${tenantId}::uuid
        FOR UPDATE
      `;
      if (locked.length === 0) {
        throw new NotFoundException({
          code: 'INVOICE_NOT_FOUND',
          message: 'Facture introuvable dans cette entreprise.',
        });
      }

      const current = await transaction.invoice.findFirst({
        where: { id: invoiceId, tenantId },
        select: { id: true, status: true },
      });
      if (!current) {
        throw new NotFoundException({
          code: 'INVOICE_NOT_FOUND',
          message: 'Facture introuvable dans cette entreprise.',
        });
      }
      if (current.status === InvoiceStatus.CANCELLED) {
        return { status: InvoiceStatus.CANCELLED };
      }

      const allocations = await transaction.paymentAllocation.aggregate({
        where: {
          tenantId,
          invoiceId,
          payment: { status: PaymentStatus.CONFIRMED },
        },
        _sum: { amountAr: true },
      });
      if ((allocations._sum.amountAr ?? 0n) > 0n) {
        throw new ConflictException({
          code: 'INVOICE_HAS_PAYMENTS',
          message: 'Une facture avec un paiement affecté ne peut pas être annulée.',
        });
      }

      const result = await transaction.invoice.updateMany({
        where: {
          id: invoiceId,
          tenantId,
          status: InvoiceStatus.ACTIVE,
        },
        data: {
          status: InvoiceStatus.CANCELLED,
          cancelledAt: new Date(),
        },
      });
      if (result.count !== 1) {
        throw new ConflictException({
          code: 'INVOICE_ALREADY_CHANGED',
          message: 'La facture a changé pendant l’opération. Actualisez la page.',
        });
      }

      await transaction.auditLog.create({
        data: {
          tenantId,
          userId: auth.userId,
          action: 'INVOICE_CANCELLED',
          details: { invoiceId },
        },
      });

      return { status: InvoiceStatus.CANCELLED };
    });
  }

  async agingSummary(auth: AuthenticatedUserContext) {
    const tenantId = this.requireTenant(auth);
    const groups = await this.prisma.$queryRaw<
      Array<{ dueDate: Date; amountAr: bigint; count: bigint }>
    >`
      SELECT i."dueDate",
        SUM(i."amountAr" - COALESCE(a."allocatedAr", 0)) AS "amountAr",
        COUNT(*) AS "count"
      FROM "Invoice" i
      LEFT JOIN (
        SELECT pa."tenantId", pa."invoiceId", SUM(pa."amountAr") AS "allocatedAr"
        FROM "PaymentAllocation" pa
        INNER JOIN "Payment" p
          ON p."tenantId" = pa."tenantId" AND p."id" = pa."paymentId"
        WHERE pa."tenantId" = ${tenantId}::uuid AND p."status" = 'CONFIRMED'
        GROUP BY pa."tenantId", pa."invoiceId"
      ) a ON a."tenantId" = i."tenantId" AND a."invoiceId" = i."id"
      WHERE i."tenantId" = ${tenantId}::uuid
        AND i."status" = 'ACTIVE'
        AND i."amountAr" > COALESCE(a."allocatedAr", 0)
      GROUP BY i."dueDate"
    `;

    return buildAgingSummary(
      groups.map((group) => ({
        dueDate: group.dueDate,
        amountAr: group.amountAr,
        count: Number(group.count),
      })),
      madagascarToday(),
    );
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
}
