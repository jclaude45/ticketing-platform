-- CreateTable
CREATE TABLE "TaskPendingAssignee" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskPendingAssignee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskPendingAssignee_taskId_email_key" ON "TaskPendingAssignee"("taskId", "email");
CREATE INDEX "TaskPendingAssignee_email_idx" ON "TaskPendingAssignee"("email");

-- AddForeignKey
ALTER TABLE "TaskPendingAssignee" ADD CONSTRAINT "TaskPendingAssignee_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "EventTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
