-- Remove the player email verification feature and its temporary state.
ALTER TABLE "Player"
  DROP COLUMN IF EXISTS "emailVerificationAttempts",
  DROP COLUMN IF EXISTS "emailVerificationCodeHash",
  DROP COLUMN IF EXISTS "emailVerificationExpiresAt",
  DROP COLUMN IF EXISTS "emailVerificationRequestedAt",
  DROP COLUMN IF EXISTS "emailVerified";
