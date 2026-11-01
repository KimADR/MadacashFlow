import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceStatus, PaymentStatus, Prisma } from '@prisma/client';
import type { AuthenticatedUserContext } from '../common/auth-context';
import { calendarDateString, parseCalendarDate } from '../common/calendar-date';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateAllocationDto } from './dto/create-allocation.dto';
import type { CreatePaymentDto } from './dto/create-payment.dto';
import type { ListPaymentsDto } from './dto/list-payments.dto';

const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;

function toApiPayment<T extends { amountAr: bigint; receivedAt: Date }>(payment: T) {
  return {
    ...payment,
    amountAr: payment.amountAr.toString(),
    receivedAt: calendarDateString(payment.receivedAt),
  };
}

@Injectable()
export class PaymentService {
  constructor(private readonly prisma: PrismaService) {}

  async list(auth: AuthenticatedUserContext, query: ListPaymentsDto) {
    const tenantId = this.requireTenant(auth);
    const where: Prisma.PaymentWhereInput = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        include: {
          client: { select: { id: true, reference: true, name: true } },
          allocations: {
            include: { invoice: { select: { id: true, number: true } } },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
        skip,
        take: query.limit,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      items: items.map((payment) => {
        const allocatedAr = payment.allocations.reduce(
          (sum, allocation) => sum + allocation.amountAr,
          0n,
        );
        return {
          ...toApiPayment(payment),
          allocatedAr: allocatedAr.toString(),
          unallocatedAr: (payment.amountAr - allocatedAr).toString(),
          allocations: payment.allocations.map((allocation) => ({
            id: allocation.id,
            invoiceId: allocation.invoiceId,
            invoiceNumber: allocation.invoice.number,
            amountAr: allocation.amountAr.toString(),
          })),
        };
      }),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      },
    };
  }

  async create(auth: AuthenticatedUserContext, dto: CreatePaymentDto) {
    const tenantId = this.requireTenant(auth);
    const amountAr = this.parseAmount(dto.amountAr);
    const receivedAt = parseCalendarDate(dto.receivedAt);
    if (!receivedAt) {
      throw new BadRequestException({
        code: 'INVALID_PAYMENT_DATE',
        message: 'La date d’encaissement doit être une date calendaire valide.',
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

    return this.prisma.$transaction(async (transaction) => {
      const payment = await transaction.payment.create({
        data: {
          tenantId,
          clientId: client.id,
          amountAr,
          receivedAt,
          method: dto.method,
          reference: dto.reference?.trim() || null,
        },
        include: { client: { select: { id: true, reference: true, name: true } } },
      });
      await transaction.auditLog.create({
        data: {
          tenantId,
          userId: auth.userId,
          action: 'PAYMENT_CREATED',
          details: {
            paymentId: payment.id,
            clientId: payment.clientId,
            amountAr: payment.amountAr.toString(),
            method: payment.method,
          },
        },
      });

      return toApiPayment(payment);
    });
  }

  async confirm(auth: AuthenticatedUserContext, paymentId: string) {
    const tenantId = this.requireTenant(auth);
    return this.prisma.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Payment"
        WHERE "id" = ${paymentId}::uuid AND "tenantId" = ${tenantId}::uuid
        FOR UPDATE
      `;
      if (locked.length === 0) {
        throw this.paymentNotFound();
      }

      const payment = await transaction.payment.findFirst({
        where: { id: paymentId, tenantId },
      });
      if (!payment) {
        throw this.paymentNotFound();
      }
      if (payment.status === PaymentStatus.CONFIRMED) {
        return {
          id: payment.id,
          status: payment.status,
          confirmedAt: payment.confirmedAt,
        };
      }

      const confirmedAt = new Date();
      await transaction.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.CONFIRMED, confirmedAt },
      });
      await transaction.auditLog.create({
        data: {
          tenantId,
          userId: auth.userId,
          action: 'PAYMENT_CONFIRMED',
          details: {
            paymentId: payment.id,
            amountAr: payment.amountAr.toString(),
          },
        },
      });

      return { id: payment.id, status: PaymentStatus.CONFIRMED, confirmedAt };
    });
  }

  async allocate(
    auth: AuthenticatedUserContext,
    paymentId: string,
    dto: CreateAllocationDto,
  ) {
    const tenantId = this.requireTenant(auth);
    const amountAr = this.parseAmount(dto.amountAr);

    return this.prisma.$transaction(async (transaction) => {
      const lockedPayments = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Payment"
        WHERE "id" = ${paymentId}::uuid AND "tenantId" = ${tenantId}::uuid
        FOR UPDATE
      `;
      if (lockedPayments.length === 0) {
        throw this.paymentNotFound();
      }
      const payment = await transaction.payment.findFirst({
        where: { id: paymentId, tenantId },
        select: { id: true, clientId: true, amountAr: true, status: true },
      });
      if (!payment) {
        throw this.paymentNotFound();
      }
      if (payment.status !== PaymentStatus.CONFIRMED) {
        throw new ConflictException({
          code: 'PAYMENT_NOT_CONFIRMED',
          message: 'Confirmez le paiement avant de l’affecter.',
        });
      }

      const lockedInvoices = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Invoice"
        WHERE "id" = ${dto.invoiceId}::uuid AND "tenantId" = ${tenantId}::uuid
        FOR UPDATE
      `;
      if (lockedInvoices.length === 0) {
        throw this.invoiceNotFound();
      }
      const invoice = await transaction.invoice.findFirst({
        where: { id: dto.invoiceId, tenantId },
        select: { id: true, clientId: true, amountAr: true, status: true },
      });
      if (!invoice) {
        throw this.invoiceNotFound();
      }
      if (invoice.clientId !== payment.clientId) {
        throw new BadRequestException({
          code: 'PAYMENT_CLIENT_MISMATCH',
          message: 'Le paiement et la facture doivent concerner le même client.',
        });
      }
      if (invoice.status !== InvoiceStatus.ACTIVE) {
        throw new ConflictException({
          code: 'INVOICE_NOT_ACTIVE',
          message: 'Une facture annulée ne peut pas recevoir d’affectation.',
        });
      }

      const existing = await transaction.paymentAllocation.findUnique({
        where: { paymentId_invoiceId: { paymentId, invoiceId: invoice.id } },
        select: { id: true, amountAr: true },
      });
      if (existing) {
        if (existing.amountAr === amountAr) {
          return {
            id: existing.id,
            paymentId,
            invoiceId: invoice.id,
            amountAr: existing.amountAr.toString(),
          };
        }
        throw new ConflictException({
          code: 'ALLOCATION_ALREADY_EXISTS',
          message: 'Une affectation existe déjà pour ce paiement et cette facture.',
        });
      }

      const paymentAllocated = await transaction.paymentAllocation.aggregate({
        where: { tenantId, paymentId },
        _sum: { amountAr: true },
      });
      const alreadyAllocatedPaymentAr = paymentAllocated._sum.amountAr ?? 0n;
      if (amountAr > payment.amountAr - alreadyAllocatedPaymentAr) {
        throw new ConflictException({
          code: 'PAYMENT_OVERALLOCATION',
          message: 'Le montant dépasse le solde non affecté de ce paiement.',
        });
      }

      const invoiceAllocated = await transaction.paymentAllocation.aggregate({
        where: {
          tenantId,
          invoiceId: invoice.id,
          payment: { status: PaymentStatus.CONFIRMED },
        },
        _sum: { amountAr: true },
      });
      const alreadyAllocatedInvoiceAr = invoiceAllocated._sum.amountAr ?? 0n;
      if (amountAr > invoice.amountAr - alreadyAllocatedInvoiceAr) {
        throw new ConflictException({
          code: 'INVOICE_OVERALLOCATION',
          message: 'Le montant dépasse le solde restant de cette facture.',
        });
      }

      const allocation = await transaction.paymentAllocation.create({
        data: {
          tenantId,
          paymentId,
          invoiceId: invoice.id,
          amountAr,
        },
      });
      await transaction.auditLog.create({
        data: {
          tenantId,
          userId: auth.userId,
          action: 'PAYMENT_ALLOCATED',
          details: {
            paymentId,
            invoiceId: invoice.id,
            allocationId: allocation.id,
            amountAr: amountAr.toString(),
          },
        },
      });

      return {
        id: allocation.id,
        paymentId,
        invoiceId: invoice.id,
        amountAr: amountAr.toString(),
      };
    });
  }

  private parseAmount(value: string): bigint {
    const amountAr = BigInt(value);
    if (amountAr <= 0n || amountAr > MAX_POSTGRES_BIGINT) {
      throw new BadRequestException({
        code: 'INVALID_PAYMENT_AMOUNT',
        message: 'Le montant doit être un entier positif en ariary dans la limite autorisée.',
      });
    }
    return amountAr;
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

  private paymentNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'PAYMENT_NOT_FOUND',
      message: 'Paiement introuvable dans cette entreprise.',
    });
  }

  private invoiceNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'INVOICE_NOT_FOUND',
      message: 'Facture introuvable dans cette entreprise.',
    });
  }
}
