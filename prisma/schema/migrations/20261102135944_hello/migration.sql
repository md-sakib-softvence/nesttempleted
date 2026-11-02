/*
  Warnings:

  - You are about to drop the column `topPoint` on the `Fan` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "TournamentGuidelineSection" AS ENUM ('RULES', 'TERMS', 'POLICY');

-- CreateEnum
CREATE TYPE "TournamentGuidelineType" AS ENUM ('TEXT', 'FILE', 'LINK');

-- CreateEnum
CREATE TYPE "TournamentGuidelineAudience" AS ENUM ('PLAYER', 'SPECTATOR', 'ALL');

-- AlterTable
ALTER TABLE "Fan" DROP COLUMN "topPoint";

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "purchaserId" TEXT,
ADD COLUMN     "purchaserRole" TEXT,
ADD COLUMN     "purpose" TEXT,
ADD COLUMN     "quantity" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "seatNumber" TEXT,
ADD COLUMN     "ticketTierId" TEXT,
ADD COLUMN     "tournamentId" TEXT,
ALTER COLUMN "applicationId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "lastScannedAt" TIMESTAMP(3),
ADD COLUMN     "totalScanCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TicketScanLog" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT,
    "showTicketId" TEXT,
    "qrToken" TEXT NOT NULL,
    "attendeeName" TEXT,
    "passType" TEXT,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "guardId" TEXT,
    "guardName" TEXT,
    "guardRole" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketScanLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentGuideline" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "section" "TournamentGuidelineSection" NOT NULL,
    "type" "TournamentGuidelineType" NOT NULL,
    "audience" "TournamentGuidelineAudience" NOT NULL DEFAULT 'ALL',
    "title" TEXT NOT NULL,
    "content" TEXT,
    "storageKey" TEXT,
    "externalUrl" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "effectiveAt" TIMESTAMP(3),
    "requiresAcceptance" BOOLEAN NOT NULL DEFAULT false,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentGuideline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketScanLog_createdAt_idx" ON "TicketScanLog"("createdAt");

-- CreateIndex
CREATE INDEX "TicketScanLog_guardId_idx" ON "TicketScanLog"("guardId");

-- CreateIndex
CREATE INDEX "TournamentGuideline_tournamentId_section_isPublished_sortOr_idx" ON "TournamentGuideline"("tournamentId", "section", "isPublished", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentGuideline_tournamentId_section_key_key" ON "TournamentGuideline"("tournamentId", "section", "key");

-- CreateIndex
CREATE INDEX "Payment_tournamentId_status_idx" ON "Payment"("tournamentId", "status");

-- CreateIndex
CREATE INDEX "Payment_purchaserId_status_idx" ON "Payment"("purchaserId", "status");

-- AddForeignKey
ALTER TABLE "TournamentGuideline" ADD CONSTRAINT "TournamentGuideline_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("tournamentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("tournamentId") ON DELETE CASCADE ON UPDATE CASCADE;
