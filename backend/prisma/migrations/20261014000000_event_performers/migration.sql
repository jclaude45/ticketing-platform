-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "performers" TEXT[] DEFAULT ARRAY[]::TEXT[];

