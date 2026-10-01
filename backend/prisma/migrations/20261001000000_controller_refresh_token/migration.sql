-- AlterTable: controllers get their own session (hashed refresh token), like users
ALTER TABLE "Controller" ADD COLUMN "refreshToken" TEXT;
