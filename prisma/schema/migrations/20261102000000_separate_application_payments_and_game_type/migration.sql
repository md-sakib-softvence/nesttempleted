CREATE TYPE "TournamentGameType" AS ENUM ('FOOTBALL', 'OTHER');

ALTER TABLE "Tournament"
ADD COLUMN "gameType" "TournamentGameType" NOT NULL DEFAULT 'OTHER';

UPDATE "Tournament"
SET "gameType" = 'FOOTBALL'
WHERE "gameTitle" ILIKE '%football%'
   OR "gameTitle" ILIKE '%soccer%'
   OR "gameTitle" ILIKE '%fifa%'
   OR "gameTitle" ILIKE '%efootball%'
   OR "gameTitle" ILIKE '%eafc%'
   OR "gameTitle" ILIKE 'fc %'
   OR "gameTitle" ILIKE 'pes %'
   OR "gameTitle" ~* '(^|[^[:alnum:]])(ea[[:space:]]*sports[[:space:]]*)?fc([[:space:]]|[0-9])';

CREATE TABLE "Payment" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "gateway" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "amount" DOUBLE PRECISION NOT NULL,
  "currency" "Currency" NOT NULL,
  "txRef" TEXT,
  "flwTransactionId" TEXT,
  "checkoutUrl" TEXT,
  "paidAmount" DOUBLE PRECISION,
  "paidCurrency" "Currency",
  "paidAt" TIMESTAMP(3),
  "providerDetails" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Payment_txRef_key" ON "Payment"("txRef");
CREATE UNIQUE INDEX "Payment_flwTransactionId_key" ON "Payment"("flwTransactionId");
CREATE INDEX "Payment_applicationId_status_idx" ON "Payment"("applicationId", "status");
CREATE INDEX "Payment_gateway_status_idx" ON "Payment"("gateway", "status");

ALTER TABLE "Payment"
ADD CONSTRAINT "Payment_applicationId_fkey"
FOREIGN KEY ("applicationId") REFERENCES "FanTournamentApplication"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FanTournamentApplication"
ALTER COLUMN "status" DROP DEFAULT;

CREATE TYPE "FanTournamentApplicationStatus_new" AS ENUM (
  'PENDING_PAYMENT',
  'COMPLETED',
  'CANCELLED'
);

ALTER TABLE "FanTournamentApplication"
ALTER COLUMN "status" TYPE "FanTournamentApplicationStatus_new"
USING (
  CASE WHEN "status"::text = 'PAYMENT_CONFIRMED'
    THEN 'PENDING_PAYMENT'
    ELSE "status"::text
  END
)::"FanTournamentApplicationStatus_new";

DROP TYPE "FanTournamentApplicationStatus";
ALTER TYPE "FanTournamentApplicationStatus_new" RENAME TO "FanTournamentApplicationStatus";
ALTER TABLE "FanTournamentApplication"
ALTER COLUMN "status" SET DEFAULT 'PENDING_PAYMENT';

ALTER TABLE "FanTournamentApplication"
DROP COLUMN "entryFee",
DROP COLUMN "currency",
DROP COLUMN "paymentStatus",
DROP COLUMN "paymentGateway",
DROP COLUMN "txRef",
DROP COLUMN "flwTransactionId",
DROP COLUMN "paidAmount",
DROP COLUMN "paidCurrency",
DROP COLUMN "paidAt";

DROP INDEX IF EXISTS "FanTournamentApplication_tournamentId_status_paymentStatus_idx";
CREATE INDEX "FanTournamentApplication_tournamentId_status_idx"
ON "FanTournamentApplication"("tournamentId", "status");
