-- The application now uses the Fan.coins balance exclusively.
ALTER TABLE "Fan" ADD COLUMN "coins" INTEGER NOT NULL DEFAULT 0;
UPDATE "Fan" SET "coins" = "topPoint";
ALTER TABLE "Fan" DROP COLUMN "topPoint";
