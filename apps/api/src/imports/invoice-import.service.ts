import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import { createHash } from 'node:crypto';
import type { AuthenticatedUserContext } from '../common/auth-context';
import { MAX_CSV_BYTES } from '../common/csv-limits';
import {
  calendarDateString,
  parseCalendarDate,
} from '../common/calendar-date';
import { PrismaService } from '../prisma/prisma.service';
import type { InvoiceImportMappingDto } from './dto/invoice-import-mapping.dto';

const MAX_CSV_ROWS = 5_000;
const MAX_CSV_RECORD_BYTES = 64_000;
const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;

type CsvRowError = { row: number; messages: string[] };
type ValidInvoiceRow = {
  row: number;
  clientId: string;
  clientReference: string;
  clientName: string;
  number: string;
  issueDate: Date;
  dueDate: Date;
  amountAr: bigint;
};
type CsvPreview = {
  contentHash: string;
  rows: ValidInvoiceRow[];
  rejectedRows: CsvRowError[];
};
function csvError(message: string): BadRequestException {
  return new BadRequestException({ code: 'INVALID_INVOICE_CSV', message });
}

@Injectable()
export class InvoiceImportService {
  constructor(private readonly prisma: PrismaService) {}

  async preview(
    auth: AuthenticatedUserContext,
    file: Express.Multer.File | undefined,
    mapping: InvoiceImportMappingDto,
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
        number: row.number,
        issueDate: calendarDateString(row.issueDate),
        dueDate: calendarDateString(row.dueDate),
        amountAr: row.amountAr.toString(),
      })),
      rejectedRows: preview.rejectedRows,
    };
  }

  async commit(
    auth: AuthenticatedUserContext,
    file: Express.Multer.File | undefined,
    mapping: InvoiceImportMappingDto,
  ) {
    const tenantId = this.requireTenant(auth);
    const preview = await this.parseAndValidate(tenantId, file, mapping);
    const existing = await this.prisma.invoiceImport.findUnique({
      where: {
        tenantId_contentHash: {
          tenantId,
          contentHash: preview.contentHash,
        },
      },
    });
    if (existing) {
      return this.toCommitResult(existing, true);
    }
    if (preview.rows.length === 0) {
      throw new ConflictException({
        code: 'NO_VALID_INVOICES',
        message: 'Aucune ligne valide à importer. Corrigez le fichier avant de recommencer.',
        rejectedRows: preview.rejectedRows,
      });
    }

    try {
      const result = await this.prisma.$transaction(async (transaction) => {
        const importRecord = await transaction.invoiceImport.create({
          data: {
            tenantId,
            contentHash: preview.contentHash,
            createdCount: preview.rows.length,
            rejectedCount: preview.rejectedRows.length,
            rejectedRows: preview.rejectedRows as Prisma.InputJsonValue,
          },
        });

        await transaction.invoice.createMany({
          data: preview.rows.map((row) => ({
            tenantId,
            clientId: row.clientId,
            number: row.number,
            issueDate: row.issueDate,
            dueDate: row.dueDate,
            amountAr: row.amountAr,
          })),
        });
        await transaction.auditLog.create({
          data: {
            tenantId,
            userId: auth.userId,
            action: 'INVOICES_IMPORTED',
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
        const completedImport = await this.prisma.invoiceImport.findUnique({
          where: {
            tenantId_contentHash: {
              tenantId,
              contentHash: preview.contentHash,
            },
          },
        });
        if (completedImport) {
          return this.toCommitResult(completedImport, true);
        }

        throw new ConflictException({
          code: 'INVOICE_IMPORT_CONFLICT',
          message: 'Une facture de ce fichier existe déjà. Actualisez l’aperçu avant de recommencer.',
        });
      }

      throw error;
    }
  }

  private async parseAndValidate(
    tenantId: string,
    file: Express.Multer.File | undefined,
    mapping: InvoiceImportMappingDto,
  ): Promise<CsvPreview> {
    if (!file || file.size === 0) {
      throw csvError('Le fichier CSV est vide ou absent.');
    }
    if (file.size > MAX_CSV_BYTES) {
      throw csvError('Le fichier dépasse la limite de 1 Mo.');
    }

    const columns = [
      mapping.clientRefColumn.trim(),
      mapping.numberColumn.trim(),
      mapping.issueDateColumn.trim(),
      mapping.dueDateColumn.trim(),
      mapping.amountArColumn.trim(),
    ];
    if (columns.some((column) => !column) || new Set(columns).size !== columns.length) {
      throw csvError('Chaque champ doit être associé à une colonne CSV distincte.');
    }

    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer);
    } catch {
      throw csvError('Le fichier doit être encodé en UTF-8.');
    }
    if (text.includes('\u0000')) {
      throw csvError('Le fichier contient des caractères non autorisés.');
    }

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
    if (records.length < 2) {
      throw csvError('Le fichier doit contenir une ligne d’en-tête et au moins une facture.');
    }
    if (records.length - 1 > MAX_CSV_ROWS) {
      throw csvError(`Le fichier ne peut pas dépasser ${MAX_CSV_ROWS} lignes de facture.`);
    }

    const headers = records[0].map((header) => String(header).trim());
    if (
      headers.some((header) => !header) ||
      new Set(headers).size !== headers.length ||
      columns.some((column) => !headers.includes(column))
    ) {
      throw csvError('Les en-têtes sont absents, dupliqués ou ne correspondent pas au mapping choisi.');
    }
    const positions = columns.map((column) => headers.indexOf(column));

    const clientReferences = new Set<string>();
    for (const record of records.slice(1)) {
      if (record.length > 0) {
        const reference = String(record[positions[0]] ?? '').trim();
        if (reference) clientReferences.add(reference);
      }
    }
    const clients = await this.prisma.client.findMany({
      where: { tenantId, reference: { in: [...clientReferences] } },
      select: { id: true, reference: true, name: true },
    });
    const clientByReference = new Map(
      clients.map((client) => [client.reference, client]),
    );
    const rows: ValidInvoiceRow[] = [];
    const rejectedRows: CsvRowError[] = [];
    const seenInvoiceKeys = new Set<string>();

    for (const [recordIndex, record] of records.slice(1).entries()) {
      const rowNumber = recordIndex + 2;
      const messages: string[] = [];
      if (record.length !== headers.length) {
        rejectedRows.push({
          row: rowNumber,
          messages: ['Le nombre de colonnes ne correspond pas à l’en-tête.'],
        });
        continue;
      }

      const [reference, number, issueDateValue, dueDateValue, amountValue] =
        positions.map((position) => String(record[position] ?? '').trim());
      const client = clientByReference.get(reference);
      if (!client) {
        messages.push('La référence client est inconnue dans cette entreprise.');
      }
      if (!number || number.length > 80) {
        messages.push('Le numéro de facture est obligatoire et limité à 80 caractères.');
      }

      const issueDate = parseCalendarDate(issueDateValue);
      const dueDate = parseCalendarDate(dueDateValue);
      if (!issueDate) messages.push('La date de facture doit être une date valide au format AAAA-MM-JJ.');
      if (!dueDate) messages.push('La date d’échéance doit être une date valide au format AAAA-MM-JJ.');
      if (issueDate && dueDate && dueDate < issueDate) {
        messages.push('La date d’échéance ne peut pas précéder la date de facture.');
      }

      let amountAr: bigint | null = null;
      if (!/^[1-9]\d{0,18}$/.test(amountValue)) {
        messages.push('Le montant doit être un entier positif en ariary, sans séparateur ni décimale.');
      } else {
        amountAr = BigInt(amountValue);
        if (amountAr > MAX_POSTGRES_BIGINT) {
          messages.push('Le montant dépasse la limite autorisée pour un BIGINT PostgreSQL.');
        }
      }

      const invoiceKey = client && number ? `${client.id}:${number}` : null;
      if (invoiceKey && seenInvoiceKeys.has(invoiceKey)) {
        messages.push('Cette facture apparaît plusieurs fois dans le fichier.');
      }

      if (messages.length > 0 || !client || !issueDate || !dueDate || amountAr === null) {
        rejectedRows.push({ row: rowNumber, messages });
        continue;
      }
      if (invoiceKey) seenInvoiceKeys.add(invoiceKey);
      rows.push({
        row: rowNumber,
        clientId: client.id,
        clientReference: client.reference,
        clientName: client.name,
        number,
        issueDate,
        dueDate,
        amountAr,
      });
    }

    const existingInvoices = rows.length
      ? await this.prisma.invoice.findMany({
          where: {
            tenantId,
            clientId: { in: [...new Set(rows.map((row) => row.clientId))] },
            number: { in: [...new Set(rows.map((row) => row.number))] },
          },
          select: { clientId: true, number: true },
        })
      : [];
    const existingKeys = new Set(
      existingInvoices.map((invoice) => `${invoice.clientId}:${invoice.number}`),
    );
    const acceptedRows: ValidInvoiceRow[] = [];
    for (const row of rows) {
      if (existingKeys.has(`${row.clientId}:${row.number}`)) {
        rejectedRows.push({
          row: row.row,
          messages: ['Ce numéro de facture existe déjà pour ce client.'],
        });
      } else {
        acceptedRows.push(row);
      }
    }
    rejectedRows.sort((left, right) => left.row - right.row);

    const contentHash = createHash('sha256')
      .update(
        JSON.stringify({
          tenantId,
          mapping: columns,
          content: file.buffer.toString('base64'),
        }),
      )
      .digest('hex');

    return { contentHash, rows: acceptedRows, rejectedRows };
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
