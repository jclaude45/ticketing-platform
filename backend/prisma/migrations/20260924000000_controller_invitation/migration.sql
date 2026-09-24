-- AlterTable: make password nullable and add invitation fields
ALTER TABLE "Controller" ALTER COLUMN "password" DROP NOT NULL;
ALTER TABLE "Controller" ADD COLUMN "invitationToken" TEXT;
ALTER TABLE "Controller" ADD COLUMN "invitedAt" TIMESTAMP(3);

-- AlterTable: existing controllers were created with a password → activate them
UPDATE "Controller" SET "isActive" = true WHERE "password" IS NOT NULL;

-- AlterTable: change default for new rows (handled by schema, not SQL)
ALTER TABLE "Controller" ALTER COLUMN "isActive" SET DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "Controller_invitationToken_key" ON "Controller"("invitationToken");
