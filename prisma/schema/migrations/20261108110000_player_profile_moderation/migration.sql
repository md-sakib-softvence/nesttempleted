CREATE TYPE "PhotoModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "GamerTagModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'FLAGGED');

ALTER TABLE "Player"
  ADD COLUMN "photoStatus" "PhotoModerationStatus" NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN "photoModerationNotes" TEXT,
  ADD COLUMN "photoModeratedAt" TIMESTAMP(3),
  ADD COLUMN "photoModeratedBy" TEXT,
  ADD COLUMN "gamertagStatus" "GamerTagModerationStatus" NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN "gamertagModerationNotes" TEXT,
  ADD COLUMN "gamertagModeratedAt" TIMESTAMP(3),
  ADD COLUMN "gamertagModeratedBy" TEXT,
  ADD COLUMN "moderationNotes" TEXT,
  ADD COLUMN "moderatedAt" TIMESTAMP(3),
  ADD COLUMN "moderatedBy" TEXT;
