import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CollectionChannel,
  CollectionEventType,
  InvoiceStatus,
  MembershipRole,
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
import type { ListCollectionItemsDto } from './dto/list-collection-items.dto';
import type { RecordDisputeDto } from './dto/record-dispute.dto';
import type { RecordPromiseDto } from './dto/record-promise.dto';
import type { RecordReminderDto } from './dto/record-reminder.dto';
import type { ResolveDisputeDto } from './dto/resolve-dispute.dto';

const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;

type QueueRow = {
  id: string;
  number: string;
  dueDate: Date;
  amountAr: bigint;
  remainingAr: bigint;
  clientId: string;
  clientReference: string;
  clientName: string;
  collectionCaseId: string | null;
  disputedAt: Date | null;
  disputeReason: string | null;
  promisedDate: Date | null;
  promisedAmountAr: bigint | null;
  latestEventType: CollectionEventType | null;
  totalCount: bigint;
};

function toApiEvent<
  T extends { amountAr: bigint | null; promisedDate: Date | null },
>(event: T) {
  return {
    ...event,
    amountAr: event.amountAr?.toString() ?? null,
    promisedDate: event.promisedDate
      ? calendarDateString(event.promisedDate)
      : null,
  };
}

@Injectable()
export class CollectionService {
  constructor(private readonly prisma: PrismaService) {}

  async list(auth: AuthenticatedUserContext, query: ListCollectionItemsDto) {
    const tenantId = this.requireTenant(auth);
    const skip = (query.page - 1) * query.limit;
    const rows = await this.prisma.$queryRaw<QueueRow[]>`
      SELECT
        i."id",
        i."number",
        i."dueDate",
        i."amountAr",
        i."amountAr" - COALESCE(a."allocatedAr", 0) AS "remainingAr",
        c."id" AS "clientId",
        c."reference" AS "clientReference",
        c."name" AS "clientName",
        cc."id" AS "collectionCaseId",
        cc."disputedAt",
        cc."disputeReason",
        promise."promisedDate",
        promise."amountAr" AS "promisedAmountAr",
        latest."type" AS "latestEventType",
        COUNT(*) OVER() AS "totalCount"
      FROM "Invoice" i
      INNER JOIN "Client" c
        ON c."tenantId" = i."tenantId" AND c."id" = i."clientId"
      LEFT JOIN (
        SELECT pa."tenantId", pa."invoiceId", SUM(pa."amountAr") AS "allocatedAr"
        FROM "PaymentAllocation" pa
        INNER JOIN "Payment" p
          ON p."tenantId" = pa."tenantId" AND p."id" = pa."paymentId"
        WHERE pa."tenantId" = ${tenantId}::uuid AND p."status" = 'CONFIRMED'
        GROUP BY pa."tenantId", pa."invoiceId"
      ) a ON a."tenantId" = i."tenantId" AND a."invoiceId" = i."id"
      LEFT JOIN "CollectionCase" cc
        ON cc."tenantId" = i."tenantId" AND cc."invoiceId" = i."id"
      LEFT JOIN LATERAL (
        SELECT e."promisedDate", e."amountAr"
        FROM "CollectionEvent" e
        WHERE e."tenantId" = cc."tenantId"
          AND e."collectionCaseId" = cc."id"
          AND e."type" = 'PROMISE_RECORDED'
        ORDER BY e."createdAt" DESC, e."id" DESC
        LIMIT 1
      ) promise ON TRUE
      LEFT JOIN LATERAL (
        SELECT e."type"
        FROM "CollectionEvent" e
        WHERE e."tenantId" = cc."tenantId"
          AND e."collectionCaseId" = cc."id"
        ORDER BY e."createdAt" DESC, e."id" DESC
        LIMIT 1
      ) latest ON TRUE
      WHERE i."tenantId" = ${tenantId}::uuid
        AND i."status" = 'ACTIVE'
        AND i."amountAr" > COALESCE(a."allocatedAr", 0)
      ORDER BY i."dueDate" ASC, i."id" ASC
      LIMIT ${query.limit} OFFSET ${skip}
    `;

    return {
      items: rows.map((row) => ({
        id: row.id,
        number: row.number,
        dueDate: calendarDateString(row.dueDate),
        amountAr: row.amountAr.toString(),
        remainingAr: row.remainingAr.toString(),
        client: {
          id: row.clientId,
          reference: row.clientReference,
          name: row.clientName,
        },
        dispute: row.disputedAt
          ? {
              openedAt: row.disputedAt.toISOString(),
              reason: row.disputeReason,
            }
          : null,
        promise:
          row.promisedDate && row.promisedAmountAr !== null
            ? {
                promisedDate: calendarDateString(row.promisedDate),
                amountAr: row.promisedAmountAr.toString(),
              }
            : null,
        latestEventType: row.latestEventType,
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: Number(rows[0]?.totalCount ?? 0n),
        pages: Math.ceil(Number(rows[0]?.totalCount ?? 0n) / query.limit),
      },
    };
  }

  async events(auth: AuthenticatedUserContext, invoiceId: string) {
    const tenantId = this.requireTenant(auth);
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      select: { id: true },
    });
    if (!invoice) throw this.invoiceNotFound();

    const collectionCase = await this.prisma.collectionCase.findUnique({
      where: { tenantId_invoiceId: { tenantId, invoiceId } },
      include: {
        events: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 100,
          include: { user: { select: { email: true } } },
        },
      },
    });
    return {
      items: (collectionCase?.events ?? []).map((event) => toApiEvent(event)),
    };
  }

  async recordReminder(
    auth: AuthenticatedUserContext,
    invoiceId: string,
    dto: RecordReminderDto,
  ) {
    const tenantId = this.requireTenant(auth);
    return this.prisma.$transaction(async (transaction) => {
      const { invoice, remainingAr } = await this.lockOpenInvoice(
        transaction,
        tenantId,
        invoiceId,
      );
      const collectionCase = await this.getOrCreateCase(
        transaction,
        tenantId,
        invoiceId,
      );
      if (collectionCase.disputedAt) {
        throw new ConflictException({
          code: 'COLLECTION_DISPUTED',
          message:
            'Le suivi est suspendu pendant le litige. Résolvez-le avant toute relance.',
        });
      }

      const event = await transaction.collectionEvent.create({
        data: {
          tenantId,
          collectionCaseId: collectionCase.id,
          userId: auth.userId,
          type: CollectionEventType.REMINDER_RECORDED,
          channel: dto.channel,
          note: dto.note?.trim() || null,
        },
        include: { user: { select: { email: true } } },
      });
      await this.audit(
        transaction,
        auth,
        tenantId,
        'COLLECTION_REMINDER_RECORDED',
        {
          invoiceId,
          caseId: collectionCase.id,
          channel: dto.channel,
        },
      );
      return {
        ...toApiEvent(event),
        invoiceNumber: invoice.number,
        remainingAr: remainingAr.toString(),
      };
    });
  }

  async recordPromise(
    auth: AuthenticatedUserContext,
    invoiceId: string,
    dto: RecordPromiseDto,
  ) {
    const tenantId = this.requireTenant(auth);
    const promisedDate = parseCalendarDate(dto.promisedDate);
    const amountAr = this.parseAmount(dto.amountAr);
    if (!promisedDate) {
      throw new BadRequestException({
        code: 'INVALID_PROMISE_DATE',
        message: 'La date promise doit être une date calendaire valide.',
      });
    }
    if (dto.promisedDate < madagascarToday()) {
      throw new BadRequestException({
        code: 'PROMISE_DATE_IN_PAST',
        message:
          'La date de promesse ne peut pas être antérieure à aujourd’hui.',
      });
    }

    return this.prisma.$transaction(async (transaction) => {
      const { invoice, remainingAr } = await this.lockOpenInvoice(
        transaction,
        tenantId,
        invoiceId,
      );
      if (amountAr > remainingAr) {
        throw new ConflictException({
          code: 'PROMISE_EXCEEDS_BALANCE',
          message: 'Le montant promis dépasse le solde restant de la facture.',
        });
      }
      const collectionCase = await this.getOrCreateCase(
        transaction,
        tenantId,
        invoiceId,
      );
      if (collectionCase.disputedAt) {
        throw new ConflictException({
          code: 'COLLECTION_DISPUTED',
          message: 'Enregistrez la promesse après la résolution du litige.',
        });
      }

      const event = await transaction.collectionEvent.create({
        data: {
          tenantId,
          collectionCaseId: collectionCase.id,
          userId: auth.userId,
          type: CollectionEventType.PROMISE_RECORDED,
          promisedDate,
          amountAr,
          note: dto.note?.trim() || null,
        },
        include: { user: { select: { email: true } } },
      });
      await this.audit(
        transaction,
        auth,
        tenantId,
        'COLLECTION_PROMISE_RECORDED',
        {
          invoiceId,
          caseId: collectionCase.id,
          promisedDate: dto.promisedDate,
          amountAr: amountAr.toString(),
        },
      );
      return {
        ...toApiEvent(event),
        invoiceNumber: invoice.number,
        remainingAr: remainingAr.toString(),
      };
    });
  }

  async openDispute(
    auth: AuthenticatedUserContext,
    invoiceId: string,
    dto: RecordDisputeDto,
  ) {
    const tenantId = this.requireTenant(auth);
    const reason = dto.reason.trim();
    if (!reason) {
      throw new BadRequestException({
        code: 'INVALID_DISPUTE_REASON',
        message: 'Le motif du litige ne peut pas être vide.',
      });
    }
    return this.prisma.$transaction(async (transaction) => {
      const { invoice } = await this.lockOpenInvoice(
        transaction,
        tenantId,
        invoiceId,
      );
      const collectionCase = await this.getOrCreateCase(
        transaction,
        tenantId,
        invoiceId,
      );
      if (collectionCase.disputedAt) {
        throw new ConflictException({
          code: 'DISPUTE_ALREADY_OPEN',
          message: 'Un litige est déjà ouvert pour cette facture.',
        });
      }
      const disputedAt = new Date();
      await transaction.collectionCase.update({
        where: { id: collectionCase.id },
        data: { disputedAt, disputeReason: reason },
      });
      const event = await transaction.collectionEvent.create({
        data: {
          tenantId,
          collectionCaseId: collectionCase.id,
          userId: auth.userId,
          type: CollectionEventType.DISPUTE_OPENED,
          note: reason,
        },
        include: { user: { select: { email: true } } },
      });
      await this.audit(
        transaction,
        auth,
        tenantId,
        'COLLECTION_DISPUTE_OPENED',
        {
          invoiceId,
          caseId: collectionCase.id,
        },
      );
      return { ...toApiEvent(event), invoiceNumber: invoice.number };
    });
  }

  async resolveDispute(
    auth: AuthenticatedUserContext,
    invoiceId: string,
    dto: ResolveDisputeDto,
  ) {
    const tenantId = this.requireTenant(auth);
    return this.prisma.$transaction(async (transaction) => {
      const invoice = await this.lockInvoice(transaction, tenantId, invoiceId);
      const collectionCase = await transaction.collectionCase.findUnique({
        where: { tenantId_invoiceId: { tenantId, invoiceId } },
      });
      if (!collectionCase?.disputedAt) {
        throw new ConflictException({
          code: 'NO_OPEN_DISPUTE',
          message: 'Aucun litige n’est ouvert pour cette facture.',
        });
      }
      await transaction.collectionCase.update({
        where: { id: collectionCase.id },
        data: { disputedAt: null, disputeReason: null },
      });
      const event = await transaction.collectionEvent.create({
        data: {
          tenantId,
          collectionCaseId: collectionCase.id,
          userId: auth.userId,
          type: CollectionEventType.DISPUTE_RESOLVED,
          note: dto.note?.trim() || null,
        },
        include: { user: { select: { email: true } } },
      });
      await this.audit(
        transaction,
        auth,
        tenantId,
        'COLLECTION_DISPUTE_RESOLVED',
        {
          invoiceId,
          caseId: collectionCase.id,
        },
      );
      return { ...toApiEvent(event), invoiceNumber: invoice.number };
    });
  }

  private async lockInvoice(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    invoiceId: string,
  ) {
    const locked = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Invoice"
      WHERE "id" = ${invoiceId}::uuid AND "tenantId" = ${tenantId}::uuid
      FOR UPDATE
    `;
    if (locked.length === 0) throw this.invoiceNotFound();

    const invoice = await transaction.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      select: {
        id: true,
        number: true,
        amountAr: true,
        status: true,
        allocations: {
          where: { payment: { status: PaymentStatus.CONFIRMED } },
          select: { amountAr: true },
        },
      },
    });
    if (!invoice) throw this.invoiceNotFound();
    return invoice;
  }

  private async lockOpenInvoice(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    invoiceId: string,
  ) {
    const invoice = await this.lockInvoice(transaction, tenantId, invoiceId);
    if (invoice.status !== InvoiceStatus.ACTIVE) {
      throw new ConflictException({
        code: 'INVOICE_NOT_ACTIVE',
        message:
          'Le suivi de recouvrement concerne uniquement les factures actives.',
      });
    }
    const allocatedAr = invoice.allocations.reduce(
      (sum, allocation) => sum + allocation.amountAr,
      0n,
    );
    const remainingAr = invoice.amountAr - allocatedAr;
    if (remainingAr <= 0n) {
      throw new ConflictException({
        code: 'INVOICE_ALREADY_SETTLED',
        message: 'Cette facture est déjà soldée.',
      });
    }
    return { invoice, remainingAr };
  }

  private async getOrCreateCase(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    invoiceId: string,
  ) {
    return transaction.collectionCase.upsert({
      where: { tenantId_invoiceId: { tenantId, invoiceId } },
      update: {},
      create: { tenantId, invoiceId },
    });
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

  private parseAmount(value: string): bigint {
    const amountAr = BigInt(value);
    if (amountAr <= 0n || amountAr > MAX_POSTGRES_BIGINT) {
      throw new BadRequestException({
        code: 'INVALID_PROMISE_AMOUNT',
        message: 'Le montant promis doit être un entier positif en ariary.',
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

  private invoiceNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'INVOICE_NOT_FOUND',
      message: 'Facture introuvable dans cette entreprise.',
    });
  }
}
