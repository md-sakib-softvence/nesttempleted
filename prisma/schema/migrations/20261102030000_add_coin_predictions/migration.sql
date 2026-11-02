CREATE TYPE "FanPredictionStatus" AS ENUM ('PENDING', 'WON', 'LOST', 'VOID');

CREATE TYPE "FanCoinTransactionType" AS ENUM ('SEED_CREDIT', 'PREDICTION_STAKE', 'PREDICTION_PAYOUT', 'PREDICTION_REFUND');

CREATE TABLE "FanPrediction" (
    "id" TEXT NOT NULL,
    "fanId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "matchTitle" TEXT NOT NULL,
    "predictedWinnerId" TEXT NOT NULL,
    "predictedWinnerName" TEXT NOT NULL,
    "stakeCoins" INTEGER NOT NULL,
    "odds" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "potentialPayout" INTEGER NOT NULL,
    "status" "FanPredictionStatus" NOT NULL DEFAULT 'PENDING',
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FanPrediction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FanCoinTransaction" (
    "id" TEXT NOT NULL,
    "fanId" TEXT NOT NULL,
    "predictionId" TEXT,
    "type" "FanCoinTransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FanCoinTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FanPrediction_fanId_tournamentId_matchId_key" ON "FanPrediction"("fanId", "tournamentId", "matchId");
CREATE INDEX "FanPrediction_fanId_status_createdAt_idx" ON "FanPrediction"("fanId", "status", "createdAt");
CREATE INDEX "FanPrediction_tournamentId_matchId_status_idx" ON "FanPrediction"("tournamentId", "matchId", "status");
CREATE INDEX "FanCoinTransaction_fanId_createdAt_idx" ON "FanCoinTransaction"("fanId", "createdAt");
CREATE INDEX "FanCoinTransaction_predictionId_idx" ON "FanCoinTransaction"("predictionId");

ALTER TABLE "FanPrediction" ADD CONSTRAINT "FanPrediction_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan"("fanId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FanPrediction" ADD CONSTRAINT "FanPrediction_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("tournamentId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FanCoinTransaction" ADD CONSTRAINT "FanCoinTransaction_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan"("fanId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FanCoinTransaction" ADD CONSTRAINT "FanCoinTransaction_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "FanPrediction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
