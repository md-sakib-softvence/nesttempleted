-- CreateEnum
CREATE TYPE "AnnouncementStatus" AS ENUM ('SENT', 'DRAFT');

-- CreateEnum
CREATE TYPE "SponsorStatus" AS ENUM ('BOTH', 'PLAYER', 'FAN');

-- CreateEnum
CREATE TYPE "TournamentFormat" AS ENUM ('LEAGUE', 'LEAGUE_DOUBLE', 'LEAGUE_AND_KNOCKOUT', 'LEAGUE_AND_KNOCKOUT_DOUBLE', 'SINGLE_ELIMINATION', 'DOUBLE_ELIMINATION');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('USD', 'GBP', 'NGN');

-- CreateEnum
CREATE TYPE "PrizeRule" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "RegistrationCutOffMode" AS ENUM ('DEADLINE', 'CAPACITY', 'BOTH', 'MANUAL');

-- CreateEnum
CREATE TYPE "FrequencyStatus" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('DRAFT', 'UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SchedulingMode" AS ENUM ('MANUAL', 'AUTO_HOME_VENUE', 'PLAYER_SELF', 'AUTO_RANDOM');

-- CreateEnum
CREATE TYPE "TournamentRegistrationStatus" AS ENUM ('REGISTERED', 'SELECTED_UNPAID', 'CONFIRMED', 'WAITLISTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RaffleStatus" AS ENUM ('OPEN', 'CLOSED', 'DRAWN', 'CANCELLED');

-- CreateTable
CREATE TABLE "Announcement" (
    "announcementId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'GLOBAL',
    "channels" TEXT[] DEFAULT ARRAY['APP']::TEXT[],
    "status" "AnnouncementStatus" NOT NULL DEFAULT 'SENT',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("announcementId")
);

-- CreateTable
CREATE TABLE "AnnouncementTemplate" (
    "templateId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "variables" TEXT[],
    "message" TEXT NOT NULL,
    "defaultMessage" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnnouncementTemplate_pkey" PRIMARY KEY ("templateId")
);

-- CreateTable
CREATE TABLE "Tournament" (
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gameTitle" TEXT NOT NULL,
    "tournamentFormat" "TournamentFormat" NOT NULL,
    "numberOfTeams" INTEGER NOT NULL,
    "entryFee" DOUBLE PRECISION NOT NULL,
    "currency" "Currency" NOT NULL,
    "paymentWindow" INTEGER NOT NULL,
    "prizeRule" "PrizeRule" NOT NULL,
    "percentage" DOUBLE PRECISION,
    "houseRake" DOUBLE PRECISION,
    "couponCreation" BOOLEAN NOT NULL DEFAULT false,
    "registrationCutOffMode" "RegistrationCutOffMode",
    "startDate" TIMESTAMP(3) NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "dailyStart" TEXT NOT NULL,
    "dailyEnd" TEXT NOT NULL,
    "matchDuration" INTEGER NOT NULL,
    "turnoverDuration" INTEGER NOT NULL,
    "lunchBreakTime" TEXT,
    "lunchDuration" INTEGER,
    "buffer" INTEGER NOT NULL,
    "frequencyStatus" "FrequencyStatus" NOT NULL,
    "frequencyArray" TEXT[],
    "canvasImage" TEXT,
    "playerOrgUrl" TEXT,
    "prOrgUrl" TEXT,
    "tournamentLogoUrl" TEXT,
    "rules" TEXT[],
    "tsAndTc" TEXT[],
    "schedulingMode" "SchedulingMode" NOT NULL DEFAULT 'MANUAL',
    "schedule" JSONB,
    "status" "TournamentStatus" NOT NULL DEFAULT 'UPCOMING',
    "registrationOpen" BOOLEAN NOT NULL DEFAULT false,
    "requireJerseySize" BOOLEAN NOT NULL DEFAULT false,
    "schedulingPaused" BOOLEAN NOT NULL DEFAULT false,
    "playerCardTemplate" JSONB,
    "fanPassTemplate" JSONB,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("tournamentId")
);

-- CreateTable
CREATE TABLE "ManageEventCost" (
    "manageEventCostId" TEXT NOT NULL,
    "costCategory" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "tournamentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManageEventCost_pkey" PRIMARY KEY ("manageEventCostId")
);

-- CreateTable
CREATE TABLE "ManageEventPrize" (
    "manageEventPrizeId" TEXT NOT NULL,
    "prizeCategory" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "tournamentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManageEventPrize_pkey" PRIMARY KEY ("manageEventPrizeId")
);

-- CreateTable
CREATE TABLE "Venue" (
    "venueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "tournamentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("venueId")
);

-- CreateTable
CREATE TABLE "Screen" (
    "screenId" TEXT NOT NULL,
    "screenName" TEXT NOT NULL,
    "venueId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Screen_pkey" PRIMARY KEY ("screenId")
);

-- CreateTable
CREATE TABLE "Schedule" (
    "scheduleId" TEXT NOT NULL,
    "screenId" TEXT,
    "fanId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("scheduleId")
);

-- CreateTable
CREATE TABLE "Sponsor" (
    "sponsorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logo" TEXT,
    "website" TEXT,
    "priority" TEXT,
    "contact" TEXT,
    "value" DOUBLE PRECISION,
    "status" "SponsorStatus" NOT NULL DEFAULT 'BOTH',
    "tournamentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sponsor_pkey" PRIMARY KEY ("sponsorId")
);

-- CreateTable
CREATE TABLE "TournamentRegistration" (
    "registrationId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "homeVenueId" TEXT,
    "primaryTeamId" TEXT,
    "secondaryTeamId" TEXT,
    "status" "TournamentRegistrationStatus" NOT NULL DEFAULT 'REGISTERED',
    "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "jerseySize" TEXT,
    "playerPhotoUrl" TEXT,
    "qrCodeString" TEXT,
    "checkedInVenue" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentRegistration_pkey" PRIMARY KEY ("registrationId")
);

-- CreateTable
CREATE TABLE "Raffle" (
    "raffleId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prizeDescription" TEXT NOT NULL,
    "numberOfWinners" INTEGER NOT NULL DEFAULT 1,
    "status" "RaffleStatus" NOT NULL DEFAULT 'OPEN',
    "drawDate" TIMESTAMP(3),
    "registrationCloseDate" TIMESTAMP(3),
    "entries" JSONB DEFAULT '[]',
    "winners" JSONB DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Raffle_pkey" PRIMARY KEY ("raffleId")
);

-- CreateIndex
CREATE INDEX "Announcement_status_idx" ON "Announcement"("status");

-- CreateIndex
CREATE INDEX "Announcement_audience_idx" ON "Announcement"("audience");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementTemplate_key_key" ON "AnnouncementTemplate"("key");

-- CreateIndex
CREATE INDEX "AnnouncementTemplate_key_idx" ON "AnnouncementTemplate"("key");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentRegistration_tournamentId_playerId_key" ON "TournamentRegistration"("tournamentId", "playerId");

-- AddForeignKey
ALTER TABLE "ManageEventCost" ADD CONSTRAINT "ManageEventCost_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("tournamentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManageEventPrize" ADD CONSTRAINT "ManageEventPrize_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("tournamentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venue" ADD CONSTRAINT "Venue_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("tournamentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Screen" ADD CONSTRAINT "Screen_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("venueId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_screenId_fkey" FOREIGN KEY ("screenId") REFERENCES "Screen"("screenId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan"("fanId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sponsor" ADD CONSTRAINT "Sponsor_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("tournamentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentRegistration" ADD CONSTRAINT "TournamentRegistration_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("tournamentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentRegistration" ADD CONSTRAINT "TournamentRegistration_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("playerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Raffle" ADD CONSTRAINT "Raffle_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("tournamentId") ON DELETE CASCADE ON UPDATE CASCADE;
