/*
  Warnings:

  - You are about to drop the column `globalRecord` on the `Player` table. All the data in the column will be lost.
  - You are about to drop the column `profession` on the `Player` table. All the data in the column will be lost.
  - Added the required column `ageRange` to the `MarketingDataCollection` table without a default value. This is not possible if the table is not empty.
  - Added the required column `gender` to the `MarketingDataCollection` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "MarketingDataCollection" ADD COLUMN     "ageRange" TEXT NOT NULL,
ADD COLUMN     "employeeId" TEXT,
ADD COLUMN     "gender" TEXT NOT NULL,
ADD COLUMN     "globalRecord" TEXT,
ADD COLUMN     "profession" TEXT;

-- AlterTable
ALTER TABLE "Player" DROP COLUMN "globalRecord",
DROP COLUMN "profession";

-- AddForeignKey
ALTER TABLE "MarketingDataCollection" ADD CONSTRAINT "MarketingDataCollection_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("employeeId") ON DELETE SET NULL ON UPDATE CASCADE;
