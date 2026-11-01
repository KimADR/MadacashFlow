import { Module } from '@nestjs/common';
import { InvoiceImportController } from './invoice-import.controller';
import { InvoiceImportService } from './invoice-import.service';

@Module({
  controllers: [InvoiceImportController],
  providers: [InvoiceImportService],
})
export class InvoiceImportModule {}
