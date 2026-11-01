import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ClientModule } from './clients/client.module';
import { CollectionModule } from './collections/collection.module';
import { AuthGuard } from './common/auth.guard';
import { CsrfGuard } from './common/csrf.guard';
import { RolesGuard } from './common/roles.guard';
import { InvoiceImportModule } from './imports/invoice-import.module';
import { InvoiceModule } from './invoices/invoice.module';
import { ForecastModule } from './forecast/forecast.module';
import { PaymentModule } from './payments/payment.module';
import { PaymentImportModule } from './payments/payment-import.module';
import { PrismaModule } from './prisma/prisma.module';
import { TenantModule } from './tenants/tenant.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    TenantModule,
    ClientModule,
    CollectionModule,
    InvoiceModule,
    ForecastModule,
    InvoiceImportModule,
    PaymentModule,
    PaymentImportModule,
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    AuthGuard,
    RolesGuard,
    CsrfGuard,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
})
export class AppModule {}
