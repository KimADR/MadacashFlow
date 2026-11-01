import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedUserContext } from '../common/auth-context';
import { calendarDateString, madagascarToday } from '../common/calendar-date';
import { PrismaService } from '../prisma/prisma.service';
import { getAgingBucket, type AgingBucket } from '../invoices/aging';
import { csvRow } from './csv';

const MAX_AGING_EXPORT_ROWS = 10_000;

type AgingReportRow = {
  number: string;
  issueDate: Date;
  dueDate: Date;
  amountAr: bigint;
  remainingAr: bigint;
  clientReference: string;
  clientName: string;
};

const AGING_LABELS: Record<AgingBucket, string> = {
  current: 'Non échue',
  days1To30: '1–30 jours',
  days31To60: '31–60 jours',
  days61To90: '61–90 jours',
  over90: 'Plus de 90 jours',
};

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async agingCsv(auth: AuthenticatedUserContext): Promise<string> {
    const tenantId = this.requireTenant(auth);
    const today = madagascarToday();
    const invoices = await this.prisma.$queryRaw<AgingReportRow[]>`
      SELECT
        i."number",
        i."issueDate",
        i."dueDate",
        i."amountAr",
        i."amountAr" - COALESCE(a."allocatedAr", 0) AS "remainingAr",
        c."reference" AS "clientReference",
        c."name" AS "clientName"
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
      WHERE i."tenantId" = ${tenantId}::uuid
        AND i."status" = 'ACTIVE'
        AND i."amountAr" > COALESCE(a."allocatedAr", 0)
      ORDER BY i."dueDate" ASC, i."id" ASC
      LIMIT ${MAX_AGING_EXPORT_ROWS + 1}
    `;
    if (invoices.length > MAX_AGING_EXPORT_ROWS) {
      throw new BadRequestException({
        code: 'AGING_EXPORT_TOO_LARGE',
        message: `L’export est limité à ${MAX_AGING_EXPORT_ROWS} factures par fichier.`,
      });
    }

    const rows = [
      csvRow([
        'Numéro facture',
        'Référence client',
        'Nom client',
        'Date émission',
        'Date échéance',
        'Montant initial MGA',
        'Solde restant MGA',
        'Ancienneté',
      ]),
    ];
    for (const invoice of invoices) {
      rows.push(
        csvRow([
          invoice.number,
          invoice.clientReference,
          invoice.clientName,
          calendarDateString(invoice.issueDate),
          calendarDateString(invoice.dueDate),
          invoice.amountAr.toString(),
          invoice.remainingAr.toString(),
          AGING_LABELS[getAgingBucket(invoice.dueDate, today)],
        ]),
      );
    }

    return `\uFEFF${rows.join('\r\n')}\r\n`;
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
