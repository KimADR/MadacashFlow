import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

type StatusResponse = {
  status: 'ok';
  service: 'api';
  timestamp: string;
};

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  getHealth(): StatusResponse {
    return this.appService.getHealth();
  }

  @Get('ready')
  getReadiness(): Promise<StatusResponse> {
    return this.appService.getReadiness();
  }
}
