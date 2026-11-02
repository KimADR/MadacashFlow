import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

describe('AppController', () => {
  let appController: AppController;
  const prismaMock = { $queryRaw: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    })
      .useMocker((token) => (token === PrismaService ? prismaMock : undefined))
      .compile();

    appController = module.get<AppController>(AppController);
    prismaMock.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
  });

  it('should return a health payload with status ok', () => {
    const response = appController.getHealth();

    expect(response.status).toBe('ok');
    expect(response.service).toBe('api');
    expect(typeof response.timestamp).toBe('string');
  });

  it('reports readiness only when the database query succeeds', async () => {
    const response = await appController.getReadiness();

    expect(response.status).toBe('ok');
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('returns a sanitized unavailable error when the database is unreachable', async () => {
    prismaMock.$queryRaw.mockRejectedValueOnce(new Error('database connection details'));

    await expect(appController.getReadiness()).rejects.toMatchObject({
      status: 503,
      response: {
        code: 'DATABASE_NOT_READY',
        message: 'La base de données est temporairement indisponible.',
      },
    });
  });
});
