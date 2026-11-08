ALTER TABLE "Player"
ADD COLUMN "coins" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "PlayerCoinTransaction" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "paymentId" TEXT,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerCoinTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlayerCoinTransaction_paymentId_key"
ON "PlayerCoinTransaction"("paymentId");

CREATE INDEX "PlayerCoinTransaction_playerId_createdAt_idx"
ON "PlayerCoinTransaction"("playerId", "createdAt");

ALTER TABLE "PlayerCoinTransaction"
ADD CONSTRAINT "PlayerCoinTransaction_playerId_fkey"
FOREIGN KEY ("playerId") REFERENCES "Player"("playerId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlayerCoinTransaction"
ADD CONSTRAINT "PlayerCoinTransaction_paymentId_fkey"
FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
