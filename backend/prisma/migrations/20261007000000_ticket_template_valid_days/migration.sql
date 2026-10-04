-- AlterTable
ALTER TABLE "TicketTemplate" ADD COLUMN     "validDays" TEXT[] DEFAULT ARRAY[]::TEXT[];

