import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import { createHash } from 'node:crypto';
import type { AuthenticatedUserContext } from '../common/auth-context';
import { calendarDateString, parseCalendarDate } from '../common/calendar-date';
import { MAX_CSV_BYTES } from '../common/csv-limits';
import { PrismaService } from '../prisma/prisma.service';
import type { PaymentImportMappingDto } from './dto/payment-import-mapping.dto';

const MAX_CSV_ROWS = 5_000;
const MAX_CSV_RECORD_BYTES = 64_000;
const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;
const PAYMENT_METHODS = new Set<string>(Object.values(PaymentMethod));

type CsvRowError = { row: number; messages: string[] };
type ValidPaymentRow = {
  row: number;
  clientId: string;
  clientReference: string;
  clientName: string;
  amountAr: bigint;
  receivedAt: Date;
  method: PaymentMethod;
  reference: string | null;
};
type CsvPreview = {
  contentHash: string;
  rows: ValidPaymentRow[];
  rejectedRows: CsvRowError[];
};

function csvError(message: string): BadRequestException {
  return new BadRequestException({ code: 'INVALID_PAYMENT_CSV', message });
}

@Injectable()
export class PaymentImportService {
  constructor(private readonly prisma: PrismaService) {}

  async preview(
    auth: AuthenticatedUserContext,
    file: Express.Multer.File | undefined,
    mapping: PaymentImportMappingDto,
  ) {
    const tenantId = this.requireTenant(auth);
    const preview = await this.parseAndValidate(tenantId, file, mapping);
    return {
      previewId: preview.contentHash,
      validCount: preview.rows.length,
      rejectedCount: preview.rejectedRows.length,
      rows: preview.rows.map((row) => ({
        row: row.row,
        clientReference: row.clientReference,
        clientName: row.clientName,
        amountAr: row.amountAr.toString(),
        receivedAt: calendarDateString(row.receivedAt),
        method: row.method,
        reference: row.reference,
      })),
      rejectedRows: preview.rejectedRows,
    };
  }

  async commit(
    auth: AuthenticatedUserContext,
    file: Express.Multer.File | undefined,
    mapping: PaymentImportMappingDto,
  ) {
    const tenantId = this.requireTenant(auth);
    const preview = await this.parseAndValidate(tenantId, file, mapping);
    const existing = await this.prisma.paymentImport.findUnique({
      where: {
        tenantId_contentHash: { tenantId, contentHash: preview.contentHash },
      },
    });
    if (existing) return this.toCommitResult(existing, true);
    if (preview.rows.length === 0) {
      throw new ConflictException({
        code: 'NO_VALID_PAYMENTS',
        message: 'Aucun paiement valide à importer. Corrigez le fichier avant de recommencer.',
        rejectedRows: preview.rejectedRows,
      });
    }

    try {
      const result = await this.prisma.$transaction(async (transaction) => {
        const importRecord = await transaction.paymentImport.create({
          data: {
            tenantId,
            contentHash: preview.contentHash,
            createdCount: preview.rows.length,
            rejectedCount: preview.rejectedRows.length,
            rejectedRows: preview.rejectedRows as Prisma.InputJsonValue,
          },
        });
        await transaction.payment.createMany({
          data: preview.rows.map((row) => ({
            tenantId,
            clientId: row.clientId,
            amountAr: row.amountAr,
            receivedAt: row.receivedAt,
            method: row.method,
            reference: row.reference,
            importId: importRecord.id,
          })),
        });
        await transaction.auditLog.create({
          data: {
            tenantId,
            userId: auth.userId,
            action: 'PAYMENTS_IMPORTED',
            details: {
              importId: importRecord.id,
              contentHash: preview.contentHash,
              createdCount: preview.rows.length,
              rejectedCount: preview.rejectedRows.length,
            },
          },
        });
        return importRecord;
      });
      return this.toCommitResult(result, false);
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const completedImport = await this.prisma.paymentImport.findUnique({
          where: {
            tenantId_contentHash: { tenantId, contentHash: preview.contentHash },
          },
        });
        if (completedImport) return this.toCommitResult(completedImport, true);
        throw new ConflictException({
          code: 'PAYMENT_IMPORT_CONFLICT',
          message: 'Un conflit empêche cet import. Vérifiez le fichier avant de recommencer.',
        });
      }
      throw error;
    }
  }

  private async parseAndValidate(
    tenantId: string,
    file: Express.Multer.File | undefined,
    mapping: PaymentImportMappingDto,
  ): Promise<CsvPreview> {
    if (!file || file.size === 0) throw csvError('Le fichier CSV est vide ou absent.');
    if (file.size > MAX_CSV_BYTES) throw csvError('Le fichier dépasse la limite de 1 Mo.');

    const columns = [
      mapping.clientRefColumn.trim(),
      mapping.amountArColumn.trim(),
      mapping.receivedAtColumn.trim(),
      mapping.methodColumn.trim(),
      mapping.referenceColumn?.trim() ?? '',
    ];
    const requiredColumns = columns.slice(0, 4);
    if (
      requiredColumns.some((column) => !column) ||
      (columns[4] && requiredColumns.includes(columns[4])) ||
      new Set(requiredColumns).size !== requiredColumns.length
    ) {
      throw csvError('Chaque champ obligatoire doit correspondre à une colonne distincte.');
    }

    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer);
    } catch {
      throw csvError('Le fichier doit être encodé en UTF-8.');
    }
    if (text.includes('\u0000')) throw csvError('Le fichier contient des caractères non autorisés.');

    let records: string[][];
    try {
      records = parse(text, {
        bom: true,
        skip_empty_lines: true,
        relax_column_count: true,
        max_record_size: MAX_CSV_RECORD_BYTES,
      });
    } catch {
      throw csvError('Le format CSV est invalide. Vérifiez les guillemets et séparateurs.');
    }
    if (records.length < 2) throw csvError('Le fichier doit contenir un en-tête et au moins un paiement.');
    if (records.length - 1 > MAX_CSV_ROWS) {
      throw csvError(`Le fichier ne peut pas dépasser ${MAX_CSV_ROWS} lignes de paiement.`);
    }

    const headers = records[0].map((header) => String(header).trim());
    const selectedColumns = columns.filter(Boolean);
    if (
      headers.some((header) => !header) ||
      new Set(headers).size !== headers.length ||
      selectedColumns.some((column) => !headers.includes(column))
    ) {
      throw csvError('Les en-têtes sont absents, dupliqués ou ne correspondent pas au mapping choisi.');
    }
    const positions = selectedColumns.map((column) => headers.indexOf(column));
    const [clientRefPosition, amountPosition, datePosition, methodPosition, referencePosition] =
      positions;

    const clientReferences = new Set<string>();
    for (const record of records.slice(1)) {
      const reference = String(record[clientRefPosition] ?? '').trim();
      if (reference) clientReferences.add(reference);
    }
    const clients = await this.prisma.client.findMany({
      where: { tenantId, reference: { in: [...clientReferences] } },
      select: { id: true, reference: true, name: true },
    });
    const clientByReference = new Map(
      clients.map((client) => [client.reference, client]),
    );
    const rows: ValidPaymentRow[] = [];
    const rejectedRows: CsvRowError[] = [];

    for (const [index, record] of records.slice(1).entries()) {
      const rowNumber = index + 2;
      const messages: string[] = [];
      if (record.length !== headers.length) {
        rejectedRows.push({
          row: rowNumber,
          messages: ['Le nombre de colonnes ne correspond pas à l’en-tête.'],
        });
        continue;
      }
      const clientReference = String(record[clientRefPosition] ?? '').trim();
      const client = clientByReference.get(clientReference);
      if (!client) messages.push('La référence client est inconnue dans cette entreprise.');

      const amountValue = String(record[amountPosition] ?? '').trim();
      let amountAr: bigint | null = null;
      if (!/^[1-9]\d{0,18}$/.test(amountValue)) {
        messages.push('Le montant doit être un entier positif en ariary, sans séparateur ni décimale.');
      } else {
        amountAr = BigInt(amountValue);
        if (amountAr > MAX_POSTGRES_BIGINT) {
          messages.push('Le montant dépasse la limite autorisée pour un BIGINT PostgreSQL.');
        }
      }

      const receivedAt = parseCalendarDate(String(record[datePosition] ?? '').trim());
      if (!receivedAt) {
        messages.push('La date de réception doit être valide au format AAAA-MM-JJ.');
      }
      const methodValue = String(record[methodPosition] ?? '').trim();
      const method = PAYMENT_METHODS.has(methodValue)
        ? Object.values(PaymentMethod).find((candidate) => candidate === methodValue)
        : undefined;
      if (!method) {
        messages.push('Le mode doit être CASH, BANK_TRANSFER, MOBILE_MONEY, CHEQUE ou OTHER.');
      }
      const reference =
        referencePosition === undefined
          ? null
          : String(record[referencePosition] ?? '').trim() || null;
      if (reference && reference.length > 120) {
        messages.push('La référence est limitée à 120 caractères.');
      }

      if (messages.length || !client || amountAr === null || !receivedAt || !method) {
        rejectedRows.push({ row: rowNumber, messages });
        continue;
      }
      rows.push({
        row: rowNumber,
        clientId: client.id,
        clientReference: client.reference,
        clientName: client.name,
        amountAr,
        receivedAt,
        method,
        reference,
      });
    }

    rejectedRows.sort((left, right) => left.row - right.row);
    const contentHash = createHash('sha256')
      .update(
        JSON.stringify({
          tenantId,
          mapping: selectedColumns,
          content: file.buffer.toString('base64'),
        }),
      )
      .digest('hex');
    return { contentHash, rows, rejectedRows };
  }

  private toCommitResult(
    result: {
      id: string;
      createdCount: number;
      rejectedCount: number;
      rejectedRows: Prisma.JsonValue;
    },
    idempotent: boolean,
  ) {
    return {
      importId: result.id,
      createdCount: result.createdCount,
      rejectedCount: result.rejectedCount,
      rejectedRows: result.rejectedRows,
      idempotent,
    };
  }

  private requireTenant(auth: AuthenticatedUserContext): string {
    if (!auth.tenantId) {
      throw new ForbiddenException({
        code: 'TENANT_NOT_SELECTED',
        message: 'Sélectionnez une entreprise avant de continuer.',
      });
    }
    return auth.tenantId;
  }
}
