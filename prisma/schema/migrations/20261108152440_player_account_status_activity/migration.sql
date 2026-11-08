-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PlayerActivityLog" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT,
    "fromValue" TEXT,
    "toValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayerActivityLog_playerId_createdAt_idx" ON "PlayerActivityLog"("playerId", "createdAt");

-- CreateIndex
CREATE INDEX "PlayerActivityLog_eventType_createdAt_idx" ON "PlayerActivityLog"("eventType", "createdAt");

-- AddForeignKey
ALTER TABLE "PlayerActivityLog" ADD CONSTRAINT "PlayerActivityLog_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("playerId") ON DELETE CASCADE ON UPDATE CASCADE;
