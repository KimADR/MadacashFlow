CREATE TYPE "ForecastExpenseStatus" AS ENUM ('PLANNED', 'CANCELLED');

CREATE TABLE "CashOpeningBalance" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "asOfDate" DATE NOT NULL,
    "amountAr" BIGINT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "CashOpeningBalance_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CashOpeningBalance_amountAr_nonnegative" CHECK ("amountAr" >= 0),
    CONSTRAINT "CashOpeningBalance_tenantId_asOfDate_key" UNIQUE ("tenantId", "asOfDate")
);

CREATE TABLE "ForecastExpense" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "plannedDate" DATE NOT NULL,
    "amountAr" BIGINT NOT NULL,
    "status" "ForecastExpenseStatus" NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "ForecastExpense_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ForecastExpense_amountAr_positive" CHECK ("amountAr" > 0),
    CONSTRAINT "ForecastExpense_tenantId_id_key" UNIQUE ("tenantId", "id")
);

CREATE INDEX "ForecastExpense_tenantId_status_plannedDate_idx"
    ON "ForecastExpense"("tenantId", "status", "plannedDate");

ALTER TABLE "CashOpeningBalance"
    ADD CONSTRAINT "CashOpeningBalance_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ForecastExpense"
    ADD CONSTRAINT "ForecastExpense_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
