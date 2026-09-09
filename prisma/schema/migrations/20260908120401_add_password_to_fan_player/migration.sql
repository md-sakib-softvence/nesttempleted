-- CreateEnum
CREATE TYPE "FanStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BANNED');

-- CreateEnum
CREATE TYPE "RegisterAs" AS ENUM ('FRIEND', 'PLAYER');

-- CreateEnum
CREATE TYPE "PlayerStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BANNED_PERMANENTLY');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Fan" (
    "fanId" TEXT NOT NULL,
    "showFanId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "ageRange" TEXT NOT NULL,
    "status" "FanStatus" NOT NULL DEFAULT 'ACTIVE',
    "topPoint" INTEGER NOT NULL DEFAULT 0,
    "favoriteGame" TEXT NOT NULL,
    "profileImage" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fan_pkey" PRIMARY KEY ("fanId")
);

-- CreateTable
CREATE TABLE "MarketingDataCollection" (
    "marketingDataCollectionId" TEXT NOT NULL,
    "fanId" TEXT,
    "playerId" TEXT,
    "gamerTag" TEXT NOT NULL,
    "favoriteGameConsole" TEXT NOT NULL,
    "favoriteFootballGame" TEXT NOT NULL,
    "registerAs" "RegisterAs" NOT NULL,
    "instagramLink" TEXT,
    "facebookLink" TEXT,
    "tiktokLink" TEXT,
    "xLink" TEXT,
    "youtubeLink" TEXT,
    "instagramLinkUrl" TEXT,
    "facebookLinkUrl" TEXT,
    "tiktokLinkUrl" TEXT,
    "xLinkUrl" TEXT,
    "youtubeLinkUrl" TEXT,
    "parentName" TEXT,
    "parentPhoneNumber" TEXT,
    "occupation" TEXT,
    "area" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingDataCollection_pkey" PRIMARY KEY ("marketingDataCollectionId")
);

-- CreateTable
CREATE TABLE "Player" (
    "playerId" TEXT NOT NULL,
    "showPlayerId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "globalRecord" TEXT,
    "profession" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "document" TEXT[],
    "status" "PlayerStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("playerId")
);

-- CreateTable
CREATE TABLE "PlayerRegistrationHistory" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "status" "RegistrationStatus" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerRegistrationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Fan_showFanId_key" ON "Fan"("showFanId");

-- CreateIndex
CREATE UNIQUE INDEX "Fan_email_key" ON "Fan"("email");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingDataCollection_fanId_key" ON "MarketingDataCollection"("fanId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingDataCollection_playerId_key" ON "MarketingDataCollection"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "Player_showPlayerId_key" ON "Player"("showPlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "Player_email_key" ON "Player"("email");

-- AddForeignKey
ALTER TABLE "MarketingDataCollection" ADD CONSTRAINT "MarketingDataCollection_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan"("fanId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingDataCollection" ADD CONSTRAINT "MarketingDataCollection_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("playerId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerRegistrationHistory" ADD CONSTRAINT "PlayerRegistrationHistory_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("playerId") ON DELETE RESTRICT ON UPDATE CASCADE;
