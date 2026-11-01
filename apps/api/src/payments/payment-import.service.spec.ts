import { BadRequestException, ConflictException } from '@nestjs/common';
import { MembershipRole, PaymentMethod, Prisma } from '@prisma/client';
import type { AuthenticatedUserContext } from '../common/auth-context';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentImportService } from './payment-import.service';
import type { PaymentImportMappingDto } from './dto/payment-import-mapping.dto';

const tenantId = '00000000-0000-4000-8000-000000000003';
const clientId = '00000000-0000-4000-8000-000000000010';
const importId = '00000000-0000-4000-8000-000000000020';
const auth: AuthenticatedUserContext = {
  userId: '00000000-0000-4000-8000-000000000001',
  email: 'finance@example.test',
  sessionId: '00000000-0000-4000-8000-000000000002',
  tenantId,
  role: MembershipRole.FINANCE,
  memberships: [],
};
const mapping: PaymentImportMappingDto = {
  clientRefColumn: 'clientRef',
  amountArColumn: 'amountAr',
  receivedAtColumn: 'receivedAt',
  methodColumn: 'method',
  referenceColumn: 'reference',
};

function csvFile(contents: string) {
  const buffer = Buffer.from(contents, 'utf8');
  return {
    buffer,
    size: buffer.byteLength,
    originalname: 'paiements.csv',
  } as Express.Multer.File;
}

const validCsv = [
  'clientRef,amountAr,receivedAt,method,reference',
  'CLIENT-001,1000000,2026-11-01,BANK_TRANSFER,REF-001',
].join('\n');

describe('PaymentImportService', () => {
  const prismaMock = {
    client: { findMany: jest.fn() },
    paymentImport: { findUnique: jest.fn() },
  };
  let service: PaymentImportService;

  beforeEach(() => {
    jest.resetAllMocks();
    prismaMock.client.findMany.mockResolvedValue([
      { id: clientId, reference: 'CLIENT-001', name: 'Entreprise Analakely' },
    ]);
    prismaMock.paymentImport.findUnique.mockResolvedValue(null);
    service = new PaymentImportService(prismaMock as unknown as PrismaService);
  });

  it('previews valid payments without writes and returns BIGINT values as strings', async () => {
    const preview = await service.preview(auth, csvFile(validCsv), mapping);

    expect(preview.validCount).toBe(1);
    expect(preview.rejectedCount).toBe(0);
    expect(preview.rows[0]).toMatchObject({
      clientReference: 'CLIENT-001',
      amountAr: '1000000',
      receivedAt: '2026-11-01',
      method: PaymentMethod.BANK_TRANSFER,
      reference: 'REF-001',
    });
    expect(prismaMock.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId, reference: { in: ['CLIENT-001'] } },
      }),
    );
    expect(prismaMock.paymentImport.findUnique).not.toHaveBeenCalled();
  });

  it('reports invalid client references, dates, methods and amounts by row', async () => {
    const preview = await service.preview(
      auth,
      csvFile([
        'clientRef,amountAr,receivedAt,method,reference',
        'UNKNOWN,0,2026-02-30,CASH,',
        'CLIENT-001,100,2026-11-01,NOT_A_METHOD,',
      ].join('\n')),
      mapping,
    );

    expect(preview.validCount).toBe(0);
    expect(preview.rejectedCount).toBe(2);
    expect(preview.rejectedRows[0].messages).toEqual(
      expect.arrayContaining([
        'La référence client est inconnue dans cette entreprise.',
        'Le montant doit être un entier positif en ariary, sans séparateur ni décimale.',
        'La date de réception doit être valide au format AAAA-MM-JJ.',
      ]),
    );
    expect(preview.rejectedRows[1].messages).toContain(
      'Le mode doit être CASH, BANK_TRANSFER, MOBILE_MONEY, CHEQUE ou OTHER.',
    );
  });

  it('rejects invalid CSV and duplicate mappings', async () => {
    await expect(service.preview(auth, csvFile(''), mapping)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.preview(auth, csvFile(validCsv), {
        ...mapping,
        methodColumn: 'amountAr',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.preview(auth, csvFile('clientRef,amountAr\n"bad'), mapping),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('commits rows as pending in one transaction and is idempotent on retry', async () => {
    const importRecord = {
      id: importId,
      createdCount: 1,
      rejectedCount: 0,
      rejectedRows: [],
    };
    const transaction = {
      paymentImport: { create: jest.fn().mockResolvedValue(importRecord) },
      payment: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prismaWithCommit = {
      ...prismaMock,
      paymentImport: {
        findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(importRecord),
      },
      $transaction: jest.fn(
        (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction),
      ),
    };
    service = new PaymentImportService(prismaWithCommit as unknown as PrismaService);

    const first = await service.commit(auth, csvFile(validCsv), mapping);
    const retry = await service.commit(auth, csvFile(validCsv), mapping);

    expect(first.createdCount).toBe(1);
    expect(first.idempotent).toBe(false);
    expect(retry.idempotent).toBe(true);
    expect(transaction.payment.createMany).toHaveBeenCalledTimes(1);
    expect(transaction.payment.createMany).toHaveBeenCalledWith({
      data: [{
        tenantId,
        clientId,
        amountAr: 1_000_000n,
        receivedAt: new Date('2026-11-01T00:00:00.000Z'),
        method: PaymentMethod.BANK_TRANSFER,
        reference: 'REF-001',
        importId,
      }],
    });
    expect(transaction.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('does not commit when every row is rejected', async () => {
    const prismaWithTransaction = {
      ...prismaMock,
      $transaction: jest.fn(),
    };
    service = new PaymentImportService(prismaWithTransaction as unknown as PrismaService);
    prismaMock.client.findMany.mockResolvedValue([]);

    await expect(
      service.commit(auth, csvFile(validCsv), mapping),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prismaWithTransaction.$transaction).not.toHaveBeenCalled();
  });

  it('rejects amounts exceeding PostgreSQL BIGINT', async () => {
    const preview = await service.preview(
      auth,
      csvFile([
        'clientRef,amountAr,receivedAt,method,reference',
        'CLIENT-001,9223372036854775808,2026-11-01,CASH,',
      ].join('\n')),
      mapping,
    );

    expect(preview.validCount).toBe(0);
    expect(preview.rejectedRows[0].messages).toContain(
      'Le montant dépasse la limite autorisée pour un BIGINT PostgreSQL.',
    );
  });

  it('returns completed import on a concurrent idempotency conflict', async () => {
    const importRecord = {
      id: importId,
      createdCount: 1,
      rejectedCount: 0,
      rejectedRows: [],
    };
    const transaction = {
      paymentImport: { create: jest.fn() },
      payment: { createMany: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    transaction.paymentImport.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique conflict', {
        code: 'P2002',
        clientVersion: '6.19.0',
      }),
    );
    const prismaWithConflict = {
      ...prismaMock,
      paymentImport: {
        findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(importRecord),
      },
      $transaction: jest.fn(
        (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction),
      ),
    };
    service = new PaymentImportService(prismaWithConflict as unknown as PrismaService);

    const result = await service.commit(auth, csvFile(validCsv), mapping);

    expect(result.idempotent).toBe(true);
    expect(transaction.payment.createMany).not.toHaveBeenCalled();
  });
});
