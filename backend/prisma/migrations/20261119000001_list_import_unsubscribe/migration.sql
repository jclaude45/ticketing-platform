-- AlterTable
ALTER TABLE "MailingListMember" ADD COLUMN     "imported" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "EmailUnsubscribe" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailUnsubscribe_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailUnsubscribe_organizerId_email_key" ON "EmailUnsubscribe"("organizerId", "email");

-- AddForeignKey
ALTER TABLE "EmailUnsubscribe" ADD CONSTRAINT "EmailUnsubscribe_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

