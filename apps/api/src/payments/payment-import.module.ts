import { Module } from '@nestjs/common';
import { PaymentImportController } from './payment-import.controller';
import { PaymentImportService } from './payment-import.service';

@Module({
  controllers: [PaymentImportController],
  providers: [PaymentImportService],
})
export class PaymentImportModule {}
