import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

type StatusResponse = {
  status: 'ok';
  service: 'api';
  timestamp: string;
};

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(private readonly prisma: PrismaService) {}

  getHealth(): StatusResponse {
    return this.status();
  }

  async getReadiness(): Promise<StatusResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      this.logger.error('Database readiness check failed.');
      throw new ServiceUnavailableException({
        code: 'DATABASE_NOT_READY',
        message: 'La base de données est temporairement indisponible.',
      });
    }

    return this.status();
  }

  private status(): StatusResponse {
    return {
      status: 'ok',
      service: 'api',
      timestamp: new Date().toISOString(),
    };
  }
}
