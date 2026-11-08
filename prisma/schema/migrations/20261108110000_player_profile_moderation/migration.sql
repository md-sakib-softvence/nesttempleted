DO $$
BEGIN
  CREATE TYPE "PhotoModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "GamerTagModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'FLAGGED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Player"
  ADD COLUMN IF NOT EXISTS "photoStatus" "PhotoModerationStatus" NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN IF NOT EXISTS "photoModerationNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "photoModeratedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "photoModeratedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "gamertagStatus" "GamerTagModerationStatus" NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN IF NOT EXISTS "gamertagModerationNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "gamertagModeratedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "gamertagModeratedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "moderationNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "moderatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "moderatedBy" TEXT;
