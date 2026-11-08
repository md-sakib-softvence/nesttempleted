CREATE TYPE "TicketAudienceRole" AS ENUM ('FAN', 'PLAYER');

ALTER TABLE "TicketTier"
ADD COLUMN "audienceRole" "TicketAudienceRole" NOT NULL DEFAULT 'FAN';

CREATE INDEX "TicketTier_audienceRole_tournamentId_status_idx"
ON "TicketTier"("audienceRole", "tournamentId", "status");
