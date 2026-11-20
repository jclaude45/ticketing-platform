-- CreateTable
CREATE TABLE "EmailVerification" (
    "email" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "reason" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerification_pkey" PRIMARY KEY ("email")
);

