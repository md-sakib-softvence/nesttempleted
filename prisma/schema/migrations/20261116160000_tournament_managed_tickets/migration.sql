ALTER TABLE "Tournament" ADD COLUMN "ticketPrice" DOUBLE PRECISION;
ALTER TABLE "TicketTier" ADD COLUMN "tournamentManaged" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "TicketTier_one_managed_per_tournament" ON "TicketTier" ("tournamentId") WHERE "tournamentManaged" = true;
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_ticketPrice_nonnegative" CHECK ("ticketPrice" IS NULL OR ("ticketPrice" >= 0 AND "ticketPrice" < 'Infinity'::float8));
