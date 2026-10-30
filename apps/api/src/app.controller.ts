import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

type HealthResponse = {
  status: 'ok';
  service: 'api';
  timestamp: string;
};

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  getHealth(): HealthResponse {
    return this.appService.getHealth();
  }
}
