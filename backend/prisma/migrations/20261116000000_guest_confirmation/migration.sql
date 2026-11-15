-- AlterEnum
ALTER TYPE "TicketStatus" ADD VALUE 'INVITED';

-- CreateTable
CREATE TABLE "GuestForm" (
    "eventId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "deadline" TIMESTAMP(3),
    "intro" TEXT,
    "askPhone" TEXT NOT NULL DEFAULT 'OPTIONAL',
    "fields" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestForm_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "GuestResponse" (
    "ticketId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "respondedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestResponse_pkey" PRIMARY KEY ("ticketId")
);

-- CreateIndex
CREATE INDEX "GuestResponse_eventId_status_idx" ON "GuestResponse"("eventId", "status");

-- AddForeignKey
ALTER TABLE "GuestForm" ADD CONSTRAINT "GuestForm_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestResponse" ADD CONSTRAINT "GuestResponse_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestResponse" ADD CONSTRAINT "GuestResponse_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

