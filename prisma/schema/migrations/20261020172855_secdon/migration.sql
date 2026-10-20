-- CreateEnum
CREATE TYPE "SeriesStatus" AS ENUM ('DRAFT', 'UPCOMING', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SeriesParticipantType" AS ENUM ('PLAYER', 'TEAM');

-- CreateEnum
CREATE TYPE "SeriesParticipationMode" AS ENUM ('OPEN_SERIES', 'CLOSED_SERIES');

-- CreateEnum
CREATE TYPE "SeriesScoringMethod" AS ENUM ('CUMULATIVE', 'BEST_N_RESULTS');

-- CreateEnum
CREATE TYPE "SeriesParticipantStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'WITHDRAWN', 'DISQUALIFIED');

-- CreateEnum
CREATE TYPE "SeriesQualificationStatus" AS ENUM ('QUALIFIED', 'PROVISIONAL', 'NOT_QUALIFIED');

-- CreateEnum
CREATE TYPE "SeriesRankMovement" AS ENUM ('up', 'down', 'same');

-- CreateEnum
CREATE TYPE "SeriesPublicationStatus" AS ENUM ('NOT_PUBLISHED', 'PUBLISHED', 'DRAFT');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TournamentStatus" ADD VALUE 'REGISTRATION_OPEN';
ALTER TYPE "TournamentStatus" ADD VALUE 'IN_PROGRESS';
ALTER TYPE "TournamentStatus" ADD VALUE 'PAUSED';
ALTER TYPE "TournamentStatus" ADD VALUE 'ARCHIVED';

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "TournamentRegistration" ADD COLUMN     "assignedSlot" INTEGER,
ADD COLUMN     "paymentDeadline" TIMESTAMP(3),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "Series" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "logoUrl" TEXT,
    "imageUrl" TEXT,
    "status" "SeriesStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "participantType" "SeriesParticipantType" NOT NULL DEFAULT 'PLAYER',
    "participationMode" "SeriesParticipationMode" NOT NULL DEFAULT 'OPEN_SERIES',
    "minimumEventsRequired" INTEGER NOT NULL DEFAULT 1,
    "scoringMethod" "SeriesScoringMethod" NOT NULL DEFAULT 'CUMULATIVE',
    "bestNResults" INTEGER NOT NULL DEFAULT 0,
    "scoringConfig" JSONB NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeriesTournament" (
    "seriesId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "sequenceOrder" INTEGER NOT NULL,
    "weightMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeriesTournament_pkey" PRIMARY KEY ("seriesId","tournamentId")
);

-- CreateTable
CREATE TABLE "SeriesParticipant" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "status" "SeriesParticipantStatus" NOT NULL DEFAULT 'ACTIVE',
    "qualificationStatus" "SeriesQualificationStatus" NOT NULL DEFAULT 'PROVISIONAL',
    "approved" BOOLEAN NOT NULL DEFAULT true,
    "tournamentsEntered" INTEGER NOT NULL DEFAULT 0,
    "tournamentsCompleted" INTEGER NOT NULL DEFAULT 0,
    "eventsMissed" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "podiums" INTEGER NOT NULL DEFAULT 0,
    "goalsFor" INTEGER NOT NULL DEFAULT 0,
    "goalsAgainst" INTEGER NOT NULL DEFAULT 0,
    "goalDifference" INTEGER NOT NULL DEFAULT 0,
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "currentRank" INTEGER,
    "previousRank" INTEGER,
    "movement" "SeriesRankMovement" NOT NULL DEFAULT 'same',
    "disqualificationReason" TEXT,
    "lastTournamentPoints" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeriesParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeriesPointAdjustment" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeriesPointAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeriesPublication" (
    "seriesId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "publicSlug" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "status" "SeriesPublicationStatus" NOT NULL DEFAULT 'NOT_PUBLISHED',
    "publishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeriesPublication_pkey" PRIMARY KEY ("seriesId")
);

-- CreateTable
CREATE TABLE "MatchDispute" (
    "disputeId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "tournamentId" TEXT,
    "reason" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchDispute_pkey" PRIMARY KEY ("disputeId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Series_code_key" ON "Series"("code");

-- CreateIndex
CREATE UNIQUE INDEX "SeriesParticipant_seriesId_playerId_key" ON "SeriesParticipant"("seriesId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "SeriesPublication_publicSlug_key" ON "SeriesPublication"("publicSlug");

-- AddForeignKey
ALTER TABLE "SeriesTournament" ADD CONSTRAINT "SeriesTournament_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeriesTournament" ADD CONSTRAINT "SeriesTournament_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("tournamentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeriesParticipant" ADD CONSTRAINT "SeriesParticipant_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeriesParticipant" ADD CONSTRAINT "SeriesParticipant_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("playerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeriesPointAdjustment" ADD CONSTRAINT "SeriesPointAdjustment_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeriesPointAdjustment" ADD CONSTRAINT "SeriesPointAdjustment_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "SeriesParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeriesPublication" ADD CONSTRAINT "SeriesPublication_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;
