-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN "tournamentLogo" TEXT;
ALTER TABLE "Tournament" ADD COLUMN "tournamentBanner" TEXT;
ALTER TABLE "Tournament" ADD COLUMN "primaryOrganization" TEXT;
ALTER TABLE "Tournament" ADD COLUMN "secondaryOrganization" TEXT;
ALTER TABLE "Tournament" ADD COLUMN "fanPassLogo" TEXT;
ALTER TABLE "Tournament" ADD COLUMN "fanPassBg" TEXT;

-- Backfill initial media values from existing legacy fields
UPDATE "Tournament" SET
  "tournamentLogo" = COALESCE("tournamentLogo", "tournamentLogoUrl"),
  "tournamentBanner" = COALESCE("tournamentBanner", "canvasImage"),
  "primaryOrganization" = COALESCE("primaryOrganization", "playerOrgUrl"),
  "secondaryOrganization" = COALESCE("secondaryOrganization", "prOrgUrl"),
  "fanPassLogo" = COALESCE("fanPassLogo", "tournamentLogoUrl"),
  "fanPassBg" = COALESCE("fanPassBg", "canvasImage");

