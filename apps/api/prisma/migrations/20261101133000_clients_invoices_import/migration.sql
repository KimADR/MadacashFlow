-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateTable
CREATE TABLE "Client" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "reference" VARCHAR(80) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "email" VARCHAR(320),
    "phone" VARCHAR(40),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "number" VARCHAR(80) NOT NULL,
    "issueDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "amountAr" BIGINT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ACTIVE',
    "cancelledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Invoice_amountAr_positive" CHECK ("amountAr" > 0),
    CONSTRAINT "Invoice_dueDate_not_before_issueDate" CHECK ("dueDate" >= "issueDate")
);

-- CreateTable
CREATE TABLE "InvoiceImport" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "contentHash" CHAR(64) NOT NULL,
    "createdCount" INTEGER NOT NULL,
    "rejectedCount" INTEGER NOT NULL,
    "rejectedRows" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceImport_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InvoiceImport_counts_non_negative" CHECK ("createdCount" >= 0 AND "rejectedCount" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_tenantId_reference_key" ON "Client"("tenantId", "reference");
CREATE UNIQUE INDEX "Client_tenantId_id_key" ON "Client"("tenantId", "id");
CREATE INDEX "Client_tenantId_name_idx" ON "Client"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_tenantId_clientId_number_key" ON "Invoice"("tenantId", "clientId", "number");
CREATE INDEX "Invoice_tenantId_status_dueDate_idx" ON "Invoice"("tenantId", "status", "dueDate");
CREATE INDEX "Invoice_tenantId_clientId_idx" ON "Invoice"("tenantId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceImport_tenantId_contentHash_key" ON "InvoiceImport"("tenantId", "contentHash");
CREATE INDEX "InvoiceImport_tenantId_createdAt_idx" ON "InvoiceImport"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenantId_clientId_fkey"
FOREIGN KEY ("tenantId", "clientId") REFERENCES "Client"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceImport" ADD CONSTRAINT "InvoiceImport_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
