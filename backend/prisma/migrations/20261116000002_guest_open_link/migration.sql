-- AlterTable
ALTER TABLE "GuestForm" ADD COLUMN     "openEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "openLimit" INTEGER,
ADD COLUMN     "openTemplateId" TEXT,
ADD COLUMN     "openToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "GuestForm_openToken_key" ON "GuestForm"("openToken");

