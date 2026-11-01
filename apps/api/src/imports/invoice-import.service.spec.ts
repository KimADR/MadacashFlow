import { BadRequestException } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import type { AuthenticatedUserContext } from '../common/auth-context';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceImportService } from './invoice-import.service';
import type { InvoiceImportMappingDto } from './dto/invoice-import-mapping.dto';

const auth: AuthenticatedUserContext = {
  userId: '00000000-0000-4000-8000-000000000001',
  email: 'admin@example.test',
  sessionId: '00000000-0000-4000-8000-000000000002',
  tenantId: '00000000-0000-4000-8000-000000000003',
  role: MembershipRole.ADMIN,
  memberships: [],
};
const mapping: InvoiceImportMappingDto = {
  clientRefColumn: 'clientRef',
  numberColumn: 'number',
  issueDateColumn: 'issueDate',
  dueDateColumn: 'dueDate',
  amountArColumn: 'amountAr',
};

function csvFile(contents: string) {
  const buffer = Buffer.from(contents, 'utf8');
  return {
    buffer,
    size: buffer.byteLength,
    originalname: 'factures.csv',
  } as Express.Multer.File;
}

describe('InvoiceImportService preview', () => {
  const prismaMock = {
    client: { findMany: jest.fn() },
    invoice: { findMany: jest.fn() },
  };
  let service: InvoiceImportService;

  beforeEach(() => {
    jest.resetAllMocks();
    prismaMock.client.findMany.mockResolvedValue([
      {
        id: '00000000-0000-4000-8000-000000000010',
        reference: 'CLIENT-001',
        name: 'Entreprise Analakely',
      },
    ]);
    prismaMock.invoice.findMany.mockResolvedValue([]);
    service = new InvoiceImportService(prismaMock as unknown as PrismaService);
  });

  it('does not write records during preview and validates valid rows', async () => {
    const preview = await service.preview(
      auth,
      csvFile(
        'clientRef,number,issueDate,dueDate,amountAr\nCLIENT-001,FA-001,2026-10-01,2026-11-01,3000000',
      ),
      mapping,
    );

    expect(preview.validCount).toBe(1);
    expect(preview.rejectedCount).toBe(0);
    expect(preview.rows[0].amountAr).toBe('3000000');
    expect(prismaMock.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: auth.tenantId, reference: { in: ['CLIENT-001'] } } }),
    );
    expect(prismaMock.invoice.findMany).toHaveBeenCalled();
  });

  it('rejects empty files and malformed mappings', async () => {
    await expect(service.preview(auth, csvFile(''), mapping)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.preview(auth, csvFile('a,b\n1,2'), {
        ...mapping,
        amountArColumn: 'number',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reports invalid dates, unknown clients, zero amounts, and duplicates per row', async () => {
    const preview = await service.preview(
      auth,
      csvFile(
        [
          'clientRef,number,issueDate,dueDate,amountAr',
          'CLIENT-UNKNOWN,FA-001,2026-02-30,2026-02-31,0',
          'CLIENT-001,FA-002,2026-10-01,2026-09-30,100',
          'CLIENT-001,FA-003,2026-10-01,2026-11-01,100',
          'CLIENT-001,FA-003,2026-10-01,2026-11-01,100',
        ].join('\n'),
      ),
      mapping,
    );

    expect(preview.validCount).toBe(1);
    expect(preview.rejectedCount).toBe(3);
    expect(preview.rejectedRows[0].messages).toContain(
      'La référence client est inconnue dans cette entreprise.',
    );
    expect(preview.rejectedRows[1].messages).toContain(
      'La date d’échéance ne peut pas précéder la date de facture.',
    );
    expect(preview.rejectedRows[2].messages).toContain(
      'Cette facture apparaît plusieurs fois dans le fichier.',
    );
  });

  it('rejects headers, invalid CSV syntax, and wrong column counts', async () => {
    await expect(
      service.preview(auth, csvFile('wrong,headers\n1,2'), mapping),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.preview(auth, csvFile('clientRef,number,issueDate,dueDate,amountAr\n"bad'), mapping),
    ).rejects.toBeInstanceOf(BadRequestException);

    const preview = await service.preview(
      auth,
      csvFile(
        'clientRef,number,issueDate,dueDate,amountAr\nCLIENT-001,FA-001,2026-10-01,2026-11-01,3000000,unexpected',
      ),
      mapping,
    );
    expect(preview.validCount).toBe(0);
    expect(preview.rejectedRows[0].messages).toContain(
      'Le nombre de colonnes ne correspond pas à l’en-tête.',
    );
  });

  it('rejects a row whose invoice number already exists in this tenant', async () => {
    prismaMock.invoice.findMany.mockResolvedValue([
      { clientId: '00000000-0000-4000-8000-000000000010', number: 'FA-001' },
    ]);
    const preview = await service.preview(
      auth,
      csvFile('clientRef,number,issueDate,dueDate,amountAr\nCLIENT-001,FA-001,2026-10-01,2026-11-01,3000000'),
      mapping,
    );

    expect(preview.validCount).toBe(0);
    expect(preview.rejectedRows[0].messages).toContain(
      'Ce numéro de facture existe déjà pour ce client.',
    );
  });

  it('commits rows transactionally and treats repeated content as idempotent', async () => {
    const importRecord = {
      id: '00000000-0000-4000-8000-000000000020',
      createdCount: 1,
      rejectedCount: 0,
      rejectedRows: [],
    };
    const transactionMock = {
      invoiceImport: { create: jest.fn().mockResolvedValue(importRecord) },
      invoice: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prismaWithCommit = {
      ...prismaMock,
      invoiceImport: {
        findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(importRecord),
      },
      $transaction: jest.fn((callback: (transaction: typeof transactionMock) => Promise<unknown>) =>
        callback(transactionMock),
      ),
    };
    service = new InvoiceImportService(prismaWithCommit as unknown as PrismaService);
    const file = csvFile(
      'clientRef,number,issueDate,dueDate,amountAr\nCLIENT-001,FA-001,2026-10-01,2026-11-01,3000000',
    );

    const firstCommit = await service.commit(auth, file, mapping);
    const retry = await service.commit(auth, file, mapping);

    expect(firstCommit.createdCount).toBe(1);
    expect(firstCommit.idempotent).toBe(false);
    expect(retry.idempotent).toBe(true);
    expect(transactionMock.invoice.createMany).toHaveBeenCalledTimes(1);
    expect(transactionMock.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('rejects files larger than the configured maximum', async () => {
    const largeFile = csvFile('x');
    largeFile.size = 1_000_001;
    await expect(service.preview(auth, largeFile, mapping)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
