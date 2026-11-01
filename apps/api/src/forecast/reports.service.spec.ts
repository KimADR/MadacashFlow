import { ForbiddenException } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import type { AuthenticatedUserContext } from '../common/auth-context';
import { madagascarToday, parseCalendarDate } from '../common/calendar-date';
import { PrismaService } from '../prisma/prisma.service';
import { neutralizeCsvCell } from './csv';
import { ReportsService } from './reports.service';

const auth: AuthenticatedUserContext = {
  userId: 'c0a80101-0000-4000-8000-000000000001',
  email: 'finance@example.test',
  sessionId: 'c0a80101-0000-4000-8000-000000000005',
  tenantId: 'c0a80101-0000-4000-8000-000000000002',
  role: MembershipRole.FINANCE,
  memberships: [],
};

describe('ReportsService', () => {
  it('exports only the current tenant open balances and neutralizes formula cells', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          number: '=HYPERLINK("https://example.test")',
          issueDate: parseCalendarDate(madagascarToday()),
          dueDate: parseCalendarDate(madagascarToday()),
          amountAr: 3_000_000n,
          remainingAr: 2_000_000n,
          clientReference: '+FORMULA',
          clientName: '@FORMULA',
        },
      ]),
    };
    const service = new ReportsService(prisma as unknown as PrismaService);

    const csv = await service.agingCsv(auth);

    expect(csv).toContain('"\'=HYPERLINK(""https://example.test"")"');
    expect(csv).toContain(neutralizeCsvCell('+FORMULA'));
    expect(csv).toContain('"\'@FORMULA"');
    expect(csv).toContain('"3000000","2000000"');
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });

  it('does not disclose a cross-tenant report without an active tenant', async () => {
    const prisma = { $queryRaw: jest.fn() };
    const service = new ReportsService(prisma as unknown as PrismaService);

    await expect(
      service.agingCsv({ ...auth, tenantId: null }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
