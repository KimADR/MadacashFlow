import { MembershipRole } from '@prisma/client';
import type { AuthenticatedUserContext } from '../common/auth-context';
import { ForecastController } from './forecast.controller';
import { ForecastService } from './forecast.service';

describe('ForecastController', () => {
  const auth: AuthenticatedUserContext = {
    userId: 'c0a80101-0000-4000-8000-000000000001',
    email: 'admin@example.test',
    sessionId: 'c0a80101-0000-4000-8000-000000000002',
    tenantId: 'c0a80101-0000-4000-8000-000000000003',
    role: MembershipRole.ADMIN,
    memberships: [],
  };
  const forecastService = {
    currentOpeningBalance: jest.fn(),
  };
  const controller = new ForecastController(
    forecastService as unknown as ForecastService,
  );

  it('returns an explicit JSON envelope when no balance is configured', async () => {
    forecastService.currentOpeningBalance.mockResolvedValue(null);

    await expect(controller.openingBalance(auth)).resolves.toEqual({
      openingBalance: null,
    });
  });
});
