-- A managed tournament ticket tier is maintained for Player registrations.
-- Keep the audience-scoped index so existing Fan tiers remain independent.
DROP INDEX IF EXISTS "TicketTier_one_managed_per_tournament";

CREATE UNIQUE INDEX "TicketTier_one_managed_per_audience"
  ON "TicketTier" ("tournamentId", "audienceRole")
  WHERE "tournamentManaged" = true;

-- Backfill Player tiers for existing tournaments so registrations do not need
-- an admin to create the first Player ticket manually.
INSERT INTO "TicketTier" (
  "tierId",
  "tournamentId",
  "tournamentManaged",
  "name",
  "audienceRole",
  "type",
  "price",
  "currency",
  "capacity",
  "sold",
  "description",
  "status",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  tournament."tournamentId",
  true,
  tournament."name",
  'PLAYER'::"TicketAudienceRole",
  'DAY_PASS'::"TicketType",
  tournament."entryFee",
  tournament."currency",
  tournament."capacity",
  0,
  NULL,
  CASE WHEN tournament."registrationOpen" THEN 'ACTIVE' ELSE 'HIDDEN' END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Tournament" AS tournament
WHERE NOT EXISTS (
  SELECT 1
  FROM "TicketTier" AS player_tier
  WHERE player_tier."tournamentId" = tournament."tournamentId"
    AND player_tier."audienceRole" = 'PLAYER'::"TicketAudienceRole"
);
