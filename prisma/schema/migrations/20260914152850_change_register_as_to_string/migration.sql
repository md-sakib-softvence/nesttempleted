/*
  Warnings:

  - The `registerAs` column on the `MarketingDataCollection` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "MarketingDataCollection" DROP COLUMN "registerAs",
ADD COLUMN     "registerAs" TEXT;
