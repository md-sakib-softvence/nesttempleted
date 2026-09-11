/*
  Warnings:

  - You are about to drop the column `status` on the `ActivityLog` table. All the data in the column will be lost.
  - Added the required column `description` to the `ActivityLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `role` to the `ActivityLog` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'PLAYER';
ALTER TYPE "Role" ADD VALUE 'FAN';
ALTER TYPE "Role" ADD VALUE 'SECURITY_GUARD';
ALTER TYPE "Role" ADD VALUE 'EMPLOYEE';
ALTER TYPE "Role" ADD VALUE 'MANAGER';
ALTER TYPE "Role" ADD VALUE 'AMBASSADOR';

-- DropIndex
DROP INDEX "ActivityLog_status_idx";

-- AlterTable
ALTER TABLE "ActivityLog" DROP COLUMN "status",
ADD COLUMN     "description" TEXT NOT NULL,
ADD COLUMN     "role" "Role" NOT NULL;

-- DropEnum
DROP TYPE "ActivityStatus";

-- CreateIndex
CREATE INDEX "ActivityLog_title_idx" ON "ActivityLog"("title");
