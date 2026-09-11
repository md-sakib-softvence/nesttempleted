-- AlterTable
ALTER TABLE "Fan" ADD COLUMN     "gamerTag" TEXT,
ADD COLUMN     "surname" TEXT,
ADD COLUMN     "username" TEXT;

-- AlterTable
ALTER TABLE "MarketingDataCollection" DROP COLUMN "gamerTag";

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "gamerTag" TEXT,
ADD COLUMN     "surname" TEXT,
ADD COLUMN     "username" TEXT;

