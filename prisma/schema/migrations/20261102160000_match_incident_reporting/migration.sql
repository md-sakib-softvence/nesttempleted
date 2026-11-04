ALTER TABLE "MatchDispute"
ADD COLUMN "notes" TEXT,
ADD COLUMN "reportedBy" TEXT,
ADD COLUMN "reportedByRole" TEXT,
ADD COLUMN "reportedByName" TEXT;

CREATE INDEX "MatchDispute_tournamentId_matchId_status_idx" ON "MatchDispute"("tournamentId", "matchId", "status");
CREATE INDEX "MatchDispute_status_createdAt_idx" ON "MatchDispute"("status", "createdAt");
