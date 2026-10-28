/*
  Warnings:

  - The `area` column on the `MarketingDataCollection` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TicketType" AS ENUM ('DAY_PASS', 'SEASON_PASS', 'VIP');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('ACTIVE', 'USED', 'TRANSFERRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WalletStatus" AS ENUM ('ACTIVE', 'FROZEN', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "WalletTransactionType" AS ENUM ('WITHDRAWAL_REQUEST', 'PAYOUT_APPROVED', 'PAYOUT_REJECTED', 'ENTRY_FEE', 'PRIZE_PAYOUT', 'TICKET_PURCHASE', 'REFUND', 'CREDIT_ADJUSTMENT', 'SYSTEM_BONUS');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "qrCode" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Fan" ADD COLUMN     "coins" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "MarketingDataCollection" DROP COLUMN "area",
ADD COLUMN     "area" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "profilePicture" TEXT;

-- CreateTable
CREATE TABLE "Follower" (
    "followerId" TEXT NOT NULL,
    "fanId" TEXT,
    "playerId" TEXT,
    "gamerTag" TEXT NOT NULL,
    "targetPlayerId" TEXT,
    "targetFanId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Follower_pkey" PRIMARY KEY ("followerId")
);

-- CreateTable
CREATE TABLE "PlayerDocument" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'Government ID',
    "url" TEXT NOT NULL,
    "uploadDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "ticketId" TEXT NOT NULL,
    "showTicketId" TEXT,
    "tournamentId" TEXT NOT NULL,
    "fanId" TEXT,
    "playerId" TEXT,
    "purchasedBy" TEXT NOT NULL,
    "purchaserRole" TEXT NOT NULL DEFAULT 'FAN',
    "type" "TicketType" NOT NULL DEFAULT 'DAY_PASS',
    "pricePaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "status" "TicketStatus" NOT NULL DEFAULT 'ACTIVE',
    "qrToken" TEXT NOT NULL,
    "checkedIn" BOOLEAN NOT NULL DEFAULT false,
    "checkedInAt" TIMESTAMP(3),
    "checkedInBy" TEXT,
    "checkedInVenue" TEXT,
    "seatNumber" TEXT,
    "screenId" TEXT,
    "paymentReference" TEXT,
    "flwTransactionId" TEXT,
    "paymentGateway" TEXT NOT NULL DEFAULT 'FLUTTERWAVE',
    "paymentStatus" TEXT NOT NULL DEFAULT 'SUCCESS',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("ticketId")
);

-- CreateTable
CREATE TABLE "TicketTier" (
    "tierId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TicketType" NOT NULL DEFAULT 'DAY_PASS',
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "capacity" INTEGER NOT NULL DEFAULT 100,
    "sold" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketTier_pkey" PRIMARY KEY ("tierId")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "walletId" TEXT NOT NULL,
    "playerId" TEXT,
    "fanId" TEXT,
    "userId" TEXT NOT NULL,
    "userRole" TEXT NOT NULL DEFAULT 'PLAYER',
    "cashBalance" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "creditBalance" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "escrowBalance" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "status" "WalletStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("walletId")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "transactionId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "type" "WalletTransactionType" NOT NULL DEFAULT 'PAYOUT_APPROVED',
    "amount" DOUBLE PRECISION NOT NULL,
    "balanceAfter" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "status" "TransactionStatus" NOT NULL DEFAULT 'SUCCESS',
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("transactionId")
);

-- CreateTable
CREATE TABLE "PayoutRequest" (
    "payoutId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "bankCode" TEXT,
    "bankName" TEXT,
    "accountName" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "processedAt" TIMESTAMP(3),
    "processedBy" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutRequest_pkey" PRIMARY KEY ("payoutId")
);

-- CreateIndex
CREATE INDEX "Follower_gamerTag_idx" ON "Follower"("gamerTag");

-- CreateIndex
CREATE INDEX "Follower_fanId_idx" ON "Follower"("fanId");

-- CreateIndex
CREATE INDEX "Follower_playerId_idx" ON "Follower"("playerId");

-- CreateIndex
CREATE INDEX "Follower_targetPlayerId_idx" ON "Follower"("targetPlayerId");

-- CreateIndex
CREATE INDEX "Follower_targetFanId_idx" ON "Follower"("targetFanId");

-- CreateIndex
CREATE INDEX "PlayerDocument_playerId_idx" ON "PlayerDocument"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_qrToken_key" ON "Ticket"("qrToken");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_paymentReference_key" ON "Ticket"("paymentReference");

-- CreateIndex
CREATE INDEX "Ticket_tournamentId_idx" ON "Ticket"("tournamentId");

-- CreateIndex
CREATE INDEX "Ticket_fanId_idx" ON "Ticket"("fanId");

-- CreateIndex
CREATE INDEX "Ticket_playerId_idx" ON "Ticket"("playerId");

-- CreateIndex
CREATE INDEX "Ticket_purchasedBy_idx" ON "Ticket"("purchasedBy");

-- CreateIndex
CREATE INDEX "Ticket_status_idx" ON "Ticket"("status");

-- CreateIndex
CREATE INDEX "Ticket_qrToken_idx" ON "Ticket"("qrToken");

-- CreateIndex
CREATE INDEX "Ticket_paymentReference_idx" ON "Ticket"("paymentReference");

-- CreateIndex
CREATE INDEX "TicketTier_tournamentId_idx" ON "TicketTier"("tournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_playerId_key" ON "Wallet"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_fanId_key" ON "Wallet"("fanId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- CreateIndex
CREATE INDEX "Wallet_userId_idx" ON "Wallet"("userId");

-- CreateIndex
CREATE INDEX "Wallet_playerId_idx" ON "Wallet"("playerId");

-- CreateIndex
CREATE INDEX "Wallet_fanId_idx" ON "Wallet"("fanId");

-- CreateIndex
CREATE INDEX "Wallet_status_idx" ON "Wallet"("status");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_reference_key" ON "WalletTransaction"("reference");

-- CreateIndex
CREATE INDEX "WalletTransaction_walletId_idx" ON "WalletTransaction"("walletId");

-- CreateIndex
CREATE INDEX "WalletTransaction_reference_idx" ON "WalletTransaction"("reference");

-- CreateIndex
CREATE INDEX "WalletTransaction_type_idx" ON "WalletTransaction"("type");

-- CreateIndex
CREATE INDEX "WalletTransaction_status_idx" ON "WalletTransaction"("status");

-- CreateIndex
CREATE INDEX "WalletTransaction_createdAt_idx" ON "WalletTransaction"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutRequest_reference_key" ON "PayoutRequest"("reference");

-- CreateIndex
CREATE INDEX "PayoutRequest_walletId_idx" ON "PayoutRequest"("walletId");

-- CreateIndex
CREATE INDEX "PayoutRequest_playerId_idx" ON "PayoutRequest"("playerId");

-- CreateIndex
CREATE INDEX "PayoutRequest_reference_idx" ON "PayoutRequest"("reference");

-- CreateIndex
CREATE INDEX "PayoutRequest_status_idx" ON "PayoutRequest"("status");

-- CreateIndex
CREATE INDEX "PayoutRequest_createdAt_idx" ON "PayoutRequest"("createdAt");

-- CreateIndex
CREATE INDEX "Fan_gamerTag_idx" ON "Fan"("gamerTag");

-- CreateIndex
CREATE INDEX "Player_gamerTag_idx" ON "Player"("gamerTag");

-- AddForeignKey
ALTER TABLE "Follower" ADD CONSTRAINT "Follower_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan"("fanId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follower" ADD CONSTRAINT "Follower_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("playerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follower" ADD CONSTRAINT "Follower_targetPlayerId_fkey" FOREIGN KEY ("targetPlayerId") REFERENCES "Player"("playerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follower" ADD CONSTRAINT "Follower_targetFanId_fkey" FOREIGN KEY ("targetFanId") REFERENCES "Fan"("fanId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerDocument" ADD CONSTRAINT "PlayerDocument_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("playerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("tournamentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan"("fanId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("playerId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketTier" ADD CONSTRAINT "TicketTier_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("tournamentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("playerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan"("fanId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("walletId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutRequest" ADD CONSTRAINT "PayoutRequest_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("walletId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutRequest" ADD CONSTRAINT "PayoutRequest_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("playerId") ON DELETE CASCADE ON UPDATE CASCADE;
