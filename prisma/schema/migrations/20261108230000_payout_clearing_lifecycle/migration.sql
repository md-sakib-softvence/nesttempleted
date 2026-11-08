ALTER TYPE "PayoutStatus" ADD VALUE IF NOT EXISTS 'FAILED';

ALTER TABLE "PayoutRequest"
ADD COLUMN "failureReason" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "reviewedBy" TEXT,
ADD COLUMN "transferReference" TEXT;

CREATE INDEX "PayoutRequest_transferReference_idx" ON "PayoutRequest"("transferReference");
