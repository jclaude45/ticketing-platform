-- CreateTable
CREATE TABLE "EventDraft" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventDraft_ownerId_idx" ON "EventDraft"("ownerId");

-- AddForeignKey
ALTER TABLE "EventDraft" ADD CONSTRAINT "EventDraft_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

