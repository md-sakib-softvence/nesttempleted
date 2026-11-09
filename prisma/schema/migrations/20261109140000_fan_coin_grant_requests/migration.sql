CREATE TYPE "FanCoinRefillStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "FanCoinRefillRequest" (
    "requestId" TEXT NOT NULL,
    "fanId" TEXT NOT NULL,
    "requestedCoins" INTEGER NOT NULL,
    "approvedCoins" INTEGER,
    "reason" TEXT,
    "status" "FanCoinRefillStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedByRole" TEXT,
    "reviewedByEmail" TEXT,
    "pendingFanId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FanCoinRefillRequest_pkey" PRIMARY KEY ("requestId"),
    CONSTRAINT "FanCoinRefillRequest_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan"("fanId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "FanCoinRefillRequest_pendingFanId_key" ON "FanCoinRefillRequest"("pendingFanId");
CREATE INDEX "FanCoinRefillRequest_fanId_status_createdAt_idx" ON "FanCoinRefillRequest"("fanId", "status", "createdAt");
CREATE INDEX "FanCoinRefillRequest_status_createdAt_idx" ON "FanCoinRefillRequest"("status", "createdAt");
