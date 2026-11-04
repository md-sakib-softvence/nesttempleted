CREATE TYPE "FanTournamentApplicationStatus" AS ENUM (
  'PENDING_PAYMENT',
  'PAYMENT_CONFIRMED',
  'COMPLETED',
  'CANCELLED'
);

CREATE TABLE "FanTournamentApplication" (
  "id" TEXT NOT NULL,
  "fanId" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "homeVenueId" TEXT,
  "primaryTeamId" TEXT,
  "secondaryTeamId" TEXT,
  "jerseySize" TEXT,
  "entryFee" DOUBLE PRECISION NOT NULL,
  "currency" "Currency" NOT NULL,
  "status" "FanTournamentApplicationStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
  "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "paymentGateway" TEXT NOT NULL DEFAULT 'FLUTTERWAVE',
  "txRef" TEXT,
  "flwTransactionId" TEXT,
  "paidAmount" DOUBLE PRECISION,
  "paidCurrency" "Currency",
  "paidAt" TIMESTAMP(3),
  "playerId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FanTournamentApplication_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TournamentRegistration"
ADD COLUMN "fanApplicationId" TEXT;

CREATE UNIQUE INDEX "FanTournamentApplication_fanId_tournamentId_key"
ON "FanTournamentApplication"("fanId", "tournamentId");

CREATE UNIQUE INDEX "FanTournamentApplication_txRef_key"
ON "FanTournamentApplication"("txRef");

CREATE UNIQUE INDEX "FanTournamentApplication_flwTransactionId_key"
ON "FanTournamentApplication"("flwTransactionId");

CREATE INDEX "FanTournamentApplication_tournamentId_status_paymentStatus_idx"
ON "FanTournamentApplication"("tournamentId", "status", "paymentStatus");

CREATE INDEX "FanTournamentApplication_fanId_status_idx"
ON "FanTournamentApplication"("fanId", "status");

CREATE UNIQUE INDEX "TournamentRegistration_fanApplicationId_key"
ON "TournamentRegistration"("fanApplicationId");

ALTER TABLE "FanTournamentApplication"
ADD CONSTRAINT "FanTournamentApplication_fanId_fkey"
FOREIGN KEY ("fanId") REFERENCES "Fan"("fanId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FanTournamentApplication"
ADD CONSTRAINT "FanTournamentApplication_tournamentId_fkey"
FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("tournamentId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FanTournamentApplication"
ADD CONSTRAINT "FanTournamentApplication_homeVenueId_fkey"
FOREIGN KEY ("homeVenueId") REFERENCES "Venue"("venueId") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FanTournamentApplication"
ADD CONSTRAINT "FanTournamentApplication_playerId_fkey"
FOREIGN KEY ("playerId") REFERENCES "Player"("playerId") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TournamentRegistration"
ADD CONSTRAINT "TournamentRegistration_fanApplicationId_fkey"
FOREIGN KEY ("fanApplicationId") REFERENCES "FanTournamentApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

