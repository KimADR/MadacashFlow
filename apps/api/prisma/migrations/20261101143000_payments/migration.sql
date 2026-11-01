CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'CONFIRMED');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHEQUE', 'OTHER');

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenantId_id_key" UNIQUE ("tenantId", "id");

CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "amountAr" BIGINT NOT NULL,
    "receivedAt" DATE NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" VARCHAR(120),
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "confirmedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Payment_amountAr_positive" CHECK ("amountAr" > 0),
    CONSTRAINT "Payment_tenantId_id_key" UNIQUE ("tenantId", "id")
);

CREATE TABLE "PaymentAllocation" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "amountAr" BIGINT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PaymentAllocation_amountAr_positive" CHECK ("amountAr" > 0),
    CONSTRAINT "PaymentAllocation_paymentId_invoiceId_key" UNIQUE ("paymentId", "invoiceId")
);

CREATE INDEX "Payment_tenantId_status_receivedAt_idx" ON "Payment"("tenantId", "status", "receivedAt");
CREATE INDEX "Payment_tenantId_clientId_idx" ON "Payment"("tenantId", "clientId");
CREATE INDEX "PaymentAllocation_tenantId_invoiceId_idx" ON "PaymentAllocation"("tenantId", "invoiceId");
CREATE INDEX "PaymentAllocation_tenantId_paymentId_idx" ON "PaymentAllocation"("tenantId", "paymentId");

ALTER TABLE "Payment"
    ADD CONSTRAINT "Payment_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "Payment_tenantId_clientId_fkey"
        FOREIGN KEY ("tenantId", "clientId") REFERENCES "Client"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PaymentAllocation"
    ADD CONSTRAINT "PaymentAllocation_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "PaymentAllocation_tenantId_paymentId_fkey"
        FOREIGN KEY ("tenantId", "paymentId") REFERENCES "Payment"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "PaymentAllocation_tenantId_invoiceId_fkey"
        FOREIGN KEY ("tenantId", "invoiceId") REFERENCES "Invoice"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
