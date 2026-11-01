CREATE TABLE "PaymentImport" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "contentHash" CHAR(64) NOT NULL,
    "createdCount" INTEGER NOT NULL,
    "rejectedCount" INTEGER NOT NULL,
    "rejectedRows" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentImport_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PaymentImport_counts_non_negative" CHECK ("createdCount" >= 0 AND "rejectedCount" >= 0),
    CONSTRAINT "PaymentImport_tenantId_id_key" UNIQUE ("tenantId", "id")
);

CREATE UNIQUE INDEX "PaymentImport_tenantId_contentHash_key"
    ON "PaymentImport"("tenantId", "contentHash");
CREATE INDEX "PaymentImport_tenantId_createdAt_idx"
    ON "PaymentImport"("tenantId", "createdAt");

ALTER TABLE "PaymentImport"
    ADD CONSTRAINT "PaymentImport_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Payment" ADD COLUMN "importId" UUID;
CREATE INDEX "Payment_tenantId_importId_idx" ON "Payment"("tenantId", "importId");
ALTER TABLE "Payment"
    ADD CONSTRAINT "Payment_tenantId_importId_fkey"
    FOREIGN KEY ("tenantId", "importId") REFERENCES "PaymentImport"("tenantId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
