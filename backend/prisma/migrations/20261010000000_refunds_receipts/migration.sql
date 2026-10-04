-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'REFUNDED';

-- AlterTable
ALTER TABLE "BillingPayment" ADD COLUMN     "receiptNumber" INTEGER;

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "requestedById" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "paidById" TEXT,
    "reference" TEXT,
    "note" TEXT,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Refund_paymentId_key" ON "Refund"("paymentId");

-- CreateIndex
CREATE INDEX "Refund_status_idx" ON "Refund"("status");

-- CreateIndex
CREATE INDEX "Refund_eventId_idx" ON "Refund"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingPayment_receiptNumber_key" ON "BillingPayment"("receiptNumber");

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── Data: number the receipts of the payments already confirmed, in date order ──
UPDATE "BillingPayment" b SET "receiptNumber" = n.num
FROM (SELECT "id", ROW_NUMBER() OVER (ORDER BY COALESCE("paidAt", "createdAt"), "id") AS num FROM "BillingPayment" WHERE "status" = 'COMPLETED') n
WHERE b."id" = n."id";
