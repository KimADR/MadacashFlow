CREATE TYPE "CollectionEventType" AS ENUM (
    'REMINDER_RECORDED',
    'PROMISE_RECORDED',
    'DISPUTE_OPENED',
    'DISPUTE_RESOLVED'
);
CREATE TYPE "CollectionChannel" AS ENUM ('EMAIL', 'PHONE', 'IN_PERSON', 'OTHER');

CREATE TABLE "CollectionCase" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "disputedAt" TIMESTAMPTZ(3),
    "disputeReason" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "CollectionCase_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CollectionCase_tenantId_id_key" UNIQUE ("tenantId", "id"),
    CONSTRAINT "CollectionCase_tenantId_invoiceId_key" UNIQUE ("tenantId", "invoiceId")
);

CREATE TABLE "CollectionEvent" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "collectionCaseId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "CollectionEventType" NOT NULL,
    "channel" "CollectionChannel",
    "note" VARCHAR(1000),
    "promisedDate" DATE,
    "amountAr" BIGINT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CollectionEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CollectionEvent_amountAr_positive"
        CHECK ("amountAr" IS NULL OR "amountAr" > 0),
    CONSTRAINT "CollectionEvent_type_payload_check"
        CHECK (
            ("type" = 'REMINDER_RECORDED' AND "channel" IS NOT NULL AND "promisedDate" IS NULL AND "amountAr" IS NULL)
            OR ("type" = 'PROMISE_RECORDED' AND "channel" IS NULL AND "promisedDate" IS NOT NULL AND "amountAr" IS NOT NULL)
            OR ("type" IN ('DISPUTE_OPENED', 'DISPUTE_RESOLVED') AND "channel" IS NULL AND "promisedDate" IS NULL AND "amountAr" IS NULL)
        )
);

CREATE INDEX "CollectionCase_tenantId_disputedAt_idx"
    ON "CollectionCase"("tenantId", "disputedAt");
CREATE INDEX "CollectionEvent_tenantId_collectionCaseId_createdAt_idx"
    ON "CollectionEvent"("tenantId", "collectionCaseId", "createdAt");

ALTER TABLE "CollectionCase"
    ADD CONSTRAINT "CollectionCase_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "CollectionCase_tenantId_invoiceId_fkey"
        FOREIGN KEY ("tenantId", "invoiceId") REFERENCES "Invoice"("tenantId", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CollectionEvent"
    ADD CONSTRAINT "CollectionEvent_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "CollectionEvent_tenantId_collectionCaseId_fkey"
        FOREIGN KEY ("tenantId", "collectionCaseId") REFERENCES "CollectionCase"("tenantId", "id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "CollectionEvent_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
