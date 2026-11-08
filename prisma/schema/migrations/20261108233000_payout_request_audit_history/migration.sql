CREATE TABLE "PayoutRequestEvent" (
    "eventId" TEXT NOT NULL,
    "payoutId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT NOT NULL,
    "actorName" TEXT,
    "actorEmail" TEXT,
    "reason" TEXT,
    "transferReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayoutRequestEvent_pkey" PRIMARY KEY ("eventId"),
    CONSTRAINT "PayoutRequestEvent_payoutId_fkey"
      FOREIGN KEY ("payoutId") REFERENCES "PayoutRequest"("payoutId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "PayoutRequestEvent_payoutId_createdAt_idx"
  ON "PayoutRequestEvent"("payoutId", "createdAt");
CREATE INDEX "PayoutRequestEvent_actorId_createdAt_idx"
  ON "PayoutRequestEvent"("actorId", "createdAt");

-- Preserve a request-created event for existing payout records during rollout.
INSERT INTO "PayoutRequestEvent" (
  "eventId", "payoutId", "action", "fromStatus", "toStatus",
  "actorId", "actorRole", "actorName", "actorEmail", "createdAt"
)
SELECT
  gen_random_uuid()::text,
  p."payoutId",
  'REQUESTED',
  NULL,
  'PENDING',
  p."playerId",
  'PLAYER',
  NULL,
  pl.email,
  p."createdAt"
FROM "PayoutRequest" p
JOIN "Player" pl ON pl."playerId" = p."playerId";

-- Existing requests may already have moved beyond PENDING before event history existed.
INSERT INTO "PayoutRequestEvent" (
  "eventId", "payoutId", "action", "fromStatus", "toStatus",
  "actorId", "actorRole", "actorName", "actorEmail", "reason", "transferReference", "createdAt"
)
SELECT
  gen_random_uuid()::text,
  p."payoutId",
  p.status::text,
  'PENDING',
  p.status::text,
  COALESCE(p."reviewedBy", p."processedBy"),
  'ADMIN',
  a.name,
  a.email,
  COALESCE(p."rejectionReason", p."failureReason"),
  p."transferReference",
  COALESCE(p."reviewedAt", p."processedAt", p."updatedAt")
FROM "PayoutRequest" p
LEFT JOIN "Admin" a ON a."adminId" = COALESCE(p."reviewedBy", p."processedBy")
WHERE p.status <> 'PENDING';
