import { Module } from '@nestjs/common';
import { ForecastController } from './forecast.controller';
import { ForecastService } from './forecast.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  controllers: [ForecastController, ReportsController],
  providers: [ForecastService, ReportsService],
})
export class ForecastModule {}
