-- AlterTable
ALTER TABLE "User" ADD COLUMN     "payoutInfo" JSONB;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "feePayer" TEXT NOT NULL DEFAULT 'ORGANIZER';

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'GENERATION';

-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "code" TEXT,
ADD COLUMN     "maxControllers" INTEGER NOT NULL DEFAULT -1,
ADD COLUMN     "period" TEXT NOT NULL DEFAULT 'MONTH';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "feeAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "feePayer" TEXT,
ADD COLUMN     "netAmount" DECIMAL(10,2),
ADD COLUMN     "ticketAmount" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "BillingAccount" (
    "organizerId" TEXT NOT NULL,
    "ticketCredits" INTEGER NOT NULL DEFAULT 0,
    "badgeCredits" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingAccount_pkey" PRIMARY KEY ("organizerId")
);

-- CreateTable
CREATE TABLE "BillingPayment" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "orderNumber" TEXT,
    "organizerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "planId" TEXT,
    "quantity" INTEGER,
    "unitPrice" DECIMAL(10,4),
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "paymentMethod" TEXT NOT NULL,
    "phone" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "part" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "paidById" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingPayment_reference_key" ON "BillingPayment"("reference");

-- CreateIndex
CREATE INDEX "BillingPayment_organizerId_idx" ON "BillingPayment"("organizerId");

-- CreateIndex
CREATE INDEX "Payout_organizerId_idx" ON "Payout"("organizerId");

-- CreateIndex
CREATE UNIQUE INDEX "Payout_eventId_part_key" ON "Payout"("eventId", "part");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_code_key" ON "SubscriptionPlan"("code");

-- AddForeignKey
ALTER TABLE "BillingAccount" ADD CONSTRAINT "BillingAccount_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ── Data: the plans of the pricing page ──
INSERT INTO "SubscriptionPlan" ("id", "name", "description", "price", "maxTickets", "maxBadges", "maxEvents", "showPoweredBy", "allowBulkExport", "allowCommunication", "isActive", "code", "period", "maxControllers", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'Gratuit', '100 billets à imprimer et 20 badges par événement', 0, 100, 20, -1, true, true, true, true, 'FREE', 'EVENT', 2, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Starter', '1 500 billets à imprimer et 100 badges par mois', 19, 1500, 100, -1, false, true, true, true, 'STARTER', 'MONTH', 10, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Pro', '6 000 billets à imprimer et 400 badges par mois', 59, 6000, 400, -1, false, true, true, true, 'PRO', 'MONTH', -1, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO UPDATE SET
  "description" = EXCLUDED."description", "price" = EXCLUDED."price", "maxTickets" = EXCLUDED."maxTickets",
  "maxBadges" = EXCLUDED."maxBadges", "maxEvents" = EXCLUDED."maxEvents", "showPoweredBy" = EXCLUDED."showPoweredBy",
  "allowBulkExport" = EXCLUDED."allowBulkExport", "allowCommunication" = EXCLUDED."allowCommunication",
  "isActive" = true, "code" = EXCLUDED."code", "period" = EXCLUDED."period", "maxControllers" = EXCLUDED."maxControllers",
  "updatedAt" = CURRENT_TIMESTAMP;

-- ── Data: where existing tickets come from (online sales never count against the quota) ──
UPDATE "Ticket" t SET "source" = 'ONLINE'
WHERE t."id" IN (
  SELECT jsonb_array_elements(p."ticketsData"::jsonb)->>'ticketId' FROM "Payment" p
  WHERE p."ticketsData" IS NOT NULL AND jsonb_typeof(p."ticketsData"::jsonb) = 'array'
);
UPDATE "Ticket" t SET "source" = a.src
FROM (
  SELECT "newValues"->>'source' AS src, jsonb_array_elements_text(COALESCE("newValues"->'serialNumbers', '[]'::jsonb)) AS serial
  FROM "AuditLog"
  WHERE "action" = 'ticket.generate' AND "newValues"->>'source' IN ('ONLINE', 'INVITATION')
) a
WHERE t."serialNumber" = a.serial;
