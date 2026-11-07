ALTER TYPE "FanCoinTransactionType" ADD VALUE 'PURCHASE_CREDIT';

ALTER TABLE "FanCoinTransaction"
ADD COLUMN "paymentId" TEXT;

CREATE UNIQUE INDEX "FanCoinTransaction_paymentId_key"
ON "FanCoinTransaction"("paymentId");

ALTER TABLE "FanCoinTransaction"
ADD CONSTRAINT "FanCoinTransaction_paymentId_fkey"
FOREIGN KEY ("paymentId") REFERENCES "Payment"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
