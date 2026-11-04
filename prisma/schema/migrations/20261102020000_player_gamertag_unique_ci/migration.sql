-- Enforce case-insensitive Gamer Tag uniqueness while allowing unset/blank tags.
CREATE UNIQUE INDEX IF NOT EXISTS "Player_gamerTag_normalized_key"
ON "Player" (LOWER(BTRIM("gamerTag")))
WHERE NULLIF(BTRIM("gamerTag"), '') IS NOT NULL;
