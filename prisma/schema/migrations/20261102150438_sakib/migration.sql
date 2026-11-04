-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "AdminStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AnnouncementStatus" AS ENUM ('SENT', 'DRAFT');

-- CreateEnum
CREATE TYPE "EmployeeRole" AS ENUM ('SECURITY', 'EMPLOYEE', 'MANAGER', 'AMBASSADOR');

-- CreateEnum
CREATE TYPE "EmployeeState" AS ENUM ('ACTIVE', 'INACTIVE', 'TERMINATE');

-- CreateEnum
CREATE TYPE "FanPredictionStatus" AS ENUM ('PENDING', 'WON', 'LOST', 'VOID');

-- CreateEnum
CREATE TYPE "FanCoinTransactionType" AS ENUM ('SEED_CREDIT', 'PREDICTION_STAKE', 'PREDICTION_PAYOUT', 'PREDICTION_REFUND');

-- CreateEnum
CREATE TYPE "FanStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BANNED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'SUPER_ADMIN', 'PLAYER', 'FAN', 'SECURITY_GUARD', 'EMPLOYEE', 'MANAGER', 'AMBASSADOR');

-- CreateEnum
CREATE TYPE "Status" AS ENUM ('ACTIVE', 'TRIAL', 'SUSPEND');

-- CreateEnum
CREATE TYPE "RegisterAs" AS ENUM ('FRIEND', 'PLAYER');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('ALERT', 'REPORT', 'INFORMATION');

-- CreateEnum
CREATE TYPE "PlayerStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BANNED_PERMANENTLY');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

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
CREATE TYPE "TicketType" AS ENUM ('DAY_PASS', 'SEASON_PASS', 'VIP');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('ACTIVE', 'USED', 'TRANSFERRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TournamentGuidelineSection" AS ENUM ('RULES', 'TERMS', 'POLICY');

-- CreateEnum
CREATE TYPE "TournamentGuidelineType" AS ENUM ('TEXT', 'FILE', 'LINK');

-- CreateEnum
CREATE TYPE "TournamentGuidelineAudience" AS ENUM ('PLAYER', 'SPECTATOR', 'ALL');

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
CREATE TYPE "TournamentStatus" AS ENUM ('DRAFT', 'UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED', 'REGISTRATION_OPEN', 'IN_PROGRESS', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SchedulingMode" AS ENUM ('MANUAL', 'AUTO_HOME_VENUE', 'PLAYER_SELF', 'AUTO_RANDOM');

-- CreateEnum
CREATE TYPE "FanTournamentApplicationStatus" AS ENUM ('PENDING_PAYMENT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TournamentGameType" AS ENUM ('FOOTBALL', 'OTHER');

-- CreateEnum
CREATE TYPE "TournamentRegistrationStatus" AS ENUM ('REGISTERED', 'SELECTED_UNPAID', 'CONFIRMED', 'WAITLISTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RaffleStatus" AS ENUM ('OPEN', 'CLOSED', 'DRAWN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "WalletStatus" AS ENUM ('ACTIVE', 'FROZEN', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "WalletTransactionType" AS ENUM ('WITHDRAWAL_REQUEST', 'PAYOUT_APPROVED', 'PAYOUT_REJECTED', 'ENTRY_FEE', 'PRIZE_PAYOUT', 'TICKET_PURCHASE', 'REFUND', 'CREDIT_ADJUSTMENT', 'SYSTEM_BONUS');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ActivityLog" (
    "activityLogId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("activityLogId")
);

-- CreateTable
CREATE TABLE "Admin" (
    "adminId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "profileImage" TEXT,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'ADMIN',
    "status" "AdminStatus" NOT NULL DEFAULT 'ACTIVE',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("adminId")
);

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
CREATE TABLE "Employee" (
    "employeeId" TEXT NOT NULL,
    "showEmployeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "EmployeeRole" NOT NULL DEFAULT 'EMPLOYEE',
    "state" "EmployeeState" NOT NULL DEFAULT 'ACTIVE',
    "email" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "profileImage" TEXT,
    "document" TEXT[],
    "qrCode" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cashLeader" BOOLEAN NOT NULL DEFAULT false,
    "enablePost" BOOLEAN NOT NULL DEFAULT false,
    "password" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("employeeId")
);

-- CreateTable
CREATE TABLE "FanPrediction" (
    "id" TEXT NOT NULL,
    "fanId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "matchTitle" TEXT NOT NULL,
    "predictedWinnerId" TEXT NOT NULL,
    "predictedWinnerName" TEXT NOT NULL,
    "stakeCoins" INTEGER NOT NULL,
    "odds" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "potentialPayout" INTEGER NOT NULL,
    "status" "FanPredictionStatus" NOT NULL DEFAULT 'PENDING',
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FanPrediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FanCoinTransaction" (
    "id" TEXT NOT NULL,
    "fanId" TEXT NOT NULL,
    "predictionId" TEXT,
    "type" "FanCoinTransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FanCoinTransaction_pkey" PRIMARY KEY ("id")
);

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
    "coins" INTEGER NOT NULL DEFAULT 0,
    "favoriteGame" TEXT NOT NULL,
    "profileImage" TEXT,
    "username" TEXT,
    "gamerTag" TEXT,
    "surname" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fan_pkey" PRIMARY KEY ("fanId")
);

-- CreateTable
CREATE TABLE "Follower" (
    "followerId" TEXT NOT NULL,
    "fanId" TEXT,
    "playerId" TEXT,
    "gamerTag" TEXT NOT NULL,
    "targetPlayerId" TEXT,
    "targetFanId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Follower_pkey" PRIMARY KEY ("followerId")
);

-- CreateTable
CREATE TABLE "MarketingDataCollection" (
    "marketingDataCollectionId" TEXT NOT NULL,
    "fanId" TEXT,
    "playerId" TEXT,
    "employeeId" TEXT,
    "favoriteGameConsole" TEXT NOT NULL,
    "favoriteFootballGame" TEXT NOT NULL,
    "registerAs" TEXT,
    "gender" TEXT NOT NULL,
    "ageRange" TEXT NOT NULL,
    "globalRecord" TEXT,
    "profession" TEXT,
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
    "area" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingDataCollection_pkey" PRIMARY KEY ("marketingDataCollectionId")
);

-- CreateTable
CREATE TABLE "Notification" (
    "notificationId" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("notificationId")
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
    "username" TEXT,
    "gamerTag" TEXT,
    "surname" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "profilePicture" TEXT,
    "preferredPlatform" TEXT,
    "favoriteTeam" TEXT,
    "dateOfBirth" TIMESTAMP(3),
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

-- CreateTable
CREATE TABLE "PlayerDocument" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'Government ID',
    "url" TEXT NOT NULL,
    "uploadDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerDocument_pkey" PRIMARY KEY ("id")
);

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
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL,
    "fanPredictions" BOOLEAN NOT NULL DEFAULT false,
    "staffPosSystem" BOOLEAN NOT NULL DEFAULT false,
    "newBracketViewBeta" BOOLEAN NOT NULL DEFAULT false,
    "automatedPayouts" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "ticketId" TEXT NOT NULL,
    "showTicketId" TEXT,
    "tournamentId" TEXT NOT NULL,
    "fanId" TEXT,
    "playerId" TEXT,
    "purchasedBy" TEXT NOT NULL,
    "purchaserRole" TEXT NOT NULL DEFAULT 'FAN',
    "type" "TicketType" NOT NULL DEFAULT 'DAY_PASS',
    "pricePaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "status" "TicketStatus" NOT NULL DEFAULT 'ACTIVE',
    "qrToken" TEXT NOT NULL,
    "checkedIn" BOOLEAN NOT NULL DEFAULT false,
    "checkedInAt" TIMESTAMP(3),
    "checkedInBy" TEXT,
    "checkedInVenue" TEXT,
    "lastScannedAt" TIMESTAMP(3),
    "totalScanCount" INTEGER NOT NULL DEFAULT 0,
    "seatNumber" TEXT,
    "screenId" TEXT,
    "paymentReference" TEXT,
    "flwTransactionId" TEXT,
    "paymentGateway" TEXT NOT NULL DEFAULT 'FLUTTERWAVE',
    "paymentStatus" TEXT NOT NULL DEFAULT 'SUCCESS',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("ticketId")
);

-- CreateTable
CREATE TABLE "TicketTier" (
    "tierId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TicketType" NOT NULL DEFAULT 'DAY_PASS',
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "capacity" INTEGER NOT NULL DEFAULT 100,
    "sold" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketTier_pkey" PRIMARY KEY ("tierId")
);

-- CreateTable
CREATE TABLE "TicketScanLog" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT,
    "showTicketId" TEXT,
    "qrToken" TEXT NOT NULL,
    "attendeeName" TEXT,
    "passType" TEXT,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "guardId" TEXT,
    "guardName" TEXT,
    "guardRole" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketScanLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tournament" (
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gameTitle" TEXT NOT NULL,
    "gameType" "TournamentGameType" NOT NULL DEFAULT 'OTHER',
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
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("tournamentId")
);

-- CreateTable
CREATE TABLE "TournamentStaffAssignment" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentStaffAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentGuideline" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "section" "TournamentGuidelineSection" NOT NULL,
    "type" "TournamentGuidelineType" NOT NULL,
    "audience" "TournamentGuidelineAudience" NOT NULL DEFAULT 'ALL',
    "title" TEXT NOT NULL,
    "content" TEXT,
    "storageKey" TEXT,
    "externalUrl" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "effectiveAt" TIMESTAMP(3),
    "requiresAcceptance" BOOLEAN NOT NULL DEFAULT false,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentGuideline_pkey" PRIMARY KEY ("id")
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
    "fanApplicationId" TEXT,
    "homeVenueId" TEXT,
    "primaryTeamId" TEXT,
    "secondaryTeamId" TEXT,
    "status" "TournamentRegistrationStatus" NOT NULL DEFAULT 'REGISTERED',
    "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentDeadline" TIMESTAMP(3),
    "assignedSlot" INTEGER,
    "jerseySize" TEXT,
    "playerPhotoUrl" TEXT,
    "qrCodeString" TEXT,
    "checkedInVenue" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentRegistration_pkey" PRIMARY KEY ("registrationId")
);

-- CreateTable
CREATE TABLE "FanTournamentApplication" (
    "id" TEXT NOT NULL,
    "fanId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "homeVenueId" TEXT,
    "primaryTeamId" TEXT,
    "secondaryTeamId" TEXT,
    "jerseySize" TEXT,
    "status" "FanTournamentApplicationStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "playerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FanTournamentApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT,
    "tournamentId" TEXT,
    "purchaserId" TEXT,
    "purchaserRole" TEXT,
    "ticketTierId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "seatNumber" TEXT,
    "purpose" TEXT,
    "gateway" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" "Currency" NOT NULL,
    "txRef" TEXT,
    "flwTransactionId" TEXT,
    "checkoutUrl" TEXT,
    "paidAmount" DOUBLE PRECISION,
    "paidCurrency" "Currency",
    "paidAt" TIMESTAMP(3),
    "providerDetails" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
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

-- CreateTable
CREATE TABLE "MatchDispute" (
    "disputeId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "tournamentId" TEXT,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "reportedBy" TEXT,
    "reportedByRole" TEXT,
    "reportedByName" TEXT,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchDispute_pkey" PRIMARY KEY ("disputeId")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "walletId" TEXT NOT NULL,
    "playerId" TEXT,
    "fanId" TEXT,
    "userId" TEXT NOT NULL,
    "userRole" TEXT NOT NULL DEFAULT 'PLAYER',
    "cashBalance" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "creditBalance" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "escrowBalance" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "status" "WalletStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("walletId")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "transactionId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "type" "WalletTransactionType" NOT NULL DEFAULT 'PAYOUT_APPROVED',
    "amount" DOUBLE PRECISION NOT NULL,
    "balanceAfter" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "status" "TransactionStatus" NOT NULL DEFAULT 'SUCCESS',
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("transactionId")
);

-- CreateTable
CREATE TABLE "PayoutRequest" (
    "payoutId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "bankCode" TEXT,
    "bankName" TEXT,
    "accountName" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "processedAt" TIMESTAMP(3),
    "processedBy" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutRequest_pkey" PRIMARY KEY ("payoutId")
);

-- CreateIndex
CREATE INDEX "ActivityLog_title_idx" ON "ActivityLog"("title");

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- CreateIndex
CREATE INDEX "Announcement_status_idx" ON "Announcement"("status");

-- CreateIndex
CREATE INDEX "Announcement_audience_idx" ON "Announcement"("audience");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementTemplate_key_key" ON "AnnouncementTemplate"("key");

-- CreateIndex
CREATE INDEX "AnnouncementTemplate_key_idx" ON "AnnouncementTemplate"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_showEmployeeId_key" ON "Employee"("showEmployeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_email_key" ON "Employee"("email");

-- CreateIndex
CREATE INDEX "FanPrediction_fanId_status_createdAt_idx" ON "FanPrediction"("fanId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "FanPrediction_tournamentId_matchId_status_idx" ON "FanPrediction"("tournamentId", "matchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FanPrediction_fanId_tournamentId_matchId_key" ON "FanPrediction"("fanId", "tournamentId", "matchId");

-- CreateIndex
CREATE INDEX "FanCoinTransaction_fanId_createdAt_idx" ON "FanCoinTransaction"("fanId", "createdAt");

-- CreateIndex
CREATE INDEX "FanCoinTransaction_predictionId_idx" ON "FanCoinTransaction"("predictionId");

-- CreateIndex
CREATE UNIQUE INDEX "Fan_showFanId_key" ON "Fan"("showFanId");

-- CreateIndex
CREATE UNIQUE INDEX "Fan_email_key" ON "Fan"("email");

-- CreateIndex
CREATE INDEX "Fan_gamerTag_idx" ON "Fan"("gamerTag");

-- CreateIndex
CREATE INDEX "Follower_gamerTag_idx" ON "Follower"("gamerTag");

-- CreateIndex
CREATE INDEX "Follower_fanId_idx" ON "Follower"("fanId");

-- CreateIndex
CREATE INDEX "Follower_playerId_idx" ON "Follower"("playerId");

-- CreateIndex
CREATE INDEX "Follower_targetPlayerId_idx" ON "Follower"("targetPlayerId");

-- CreateIndex
CREATE INDEX "Follower_targetFanId_idx" ON "Follower"("targetFanId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingDataCollection_fanId_key" ON "MarketingDataCollection"("fanId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingDataCollection_playerId_key" ON "MarketingDataCollection"("playerId");

-- CreateIndex
CREATE INDEX "Notification_status_idx" ON "Notification"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Player_showPlayerId_key" ON "Player"("showPlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "Player_email_key" ON "Player"("email");

-- CreateIndex
CREATE INDEX "Player_gamerTag_idx" ON "Player"("gamerTag");

-- CreateIndex
CREATE INDEX "PlayerDocument_playerId_idx" ON "PlayerDocument"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "Series_code_key" ON "Series"("code");

-- CreateIndex
CREATE UNIQUE INDEX "SeriesParticipant_seriesId_playerId_key" ON "SeriesParticipant"("seriesId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "SeriesPublication_publicSlug_key" ON "SeriesPublication"("publicSlug");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_qrToken_key" ON "Ticket"("qrToken");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_paymentReference_key" ON "Ticket"("paymentReference");

-- CreateIndex
CREATE INDEX "Ticket_tournamentId_idx" ON "Ticket"("tournamentId");

-- CreateIndex
CREATE INDEX "Ticket_fanId_idx" ON "Ticket"("fanId");

-- CreateIndex
CREATE INDEX "Ticket_playerId_idx" ON "Ticket"("playerId");

-- CreateIndex
CREATE INDEX "Ticket_purchasedBy_idx" ON "Ticket"("purchasedBy");

-- CreateIndex
CREATE INDEX "Ticket_status_idx" ON "Ticket"("status");

-- CreateIndex
CREATE INDEX "Ticket_qrToken_idx" ON "Ticket"("qrToken");

-- CreateIndex
CREATE INDEX "Ticket_paymentReference_idx" ON "Ticket"("paymentReference");

-- CreateIndex
CREATE INDEX "TicketTier_tournamentId_idx" ON "TicketTier"("tournamentId");

-- CreateIndex
CREATE INDEX "TicketScanLog_createdAt_idx" ON "TicketScanLog"("createdAt");

-- CreateIndex
CREATE INDEX "TicketScanLog_guardId_idx" ON "TicketScanLog"("guardId");

-- CreateIndex
CREATE INDEX "TournamentStaffAssignment_employeeId_tournamentId_idx" ON "TournamentStaffAssignment"("employeeId", "tournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentStaffAssignment_tournamentId_matchId_key" ON "TournamentStaffAssignment"("tournamentId", "matchId");

-- CreateIndex
CREATE INDEX "TournamentGuideline_tournamentId_section_isPublished_sortOr_idx" ON "TournamentGuideline"("tournamentId", "section", "isPublished", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentGuideline_tournamentId_section_key_key" ON "TournamentGuideline"("tournamentId", "section", "key");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentRegistration_fanApplicationId_key" ON "TournamentRegistration"("fanApplicationId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentRegistration_tournamentId_playerId_key" ON "TournamentRegistration"("tournamentId", "playerId");

-- CreateIndex
CREATE INDEX "FanTournamentApplication_tournamentId_status_idx" ON "FanTournamentApplication"("tournamentId", "status");

-- CreateIndex
CREATE INDEX "FanTournamentApplication_fanId_status_idx" ON "FanTournamentApplication"("fanId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FanTournamentApplication_fanId_tournamentId_key" ON "FanTournamentApplication"("fanId", "tournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_txRef_key" ON "Payment"("txRef");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_flwTransactionId_key" ON "Payment"("flwTransactionId");

-- CreateIndex
CREATE INDEX "Payment_applicationId_status_idx" ON "Payment"("applicationId", "status");

-- CreateIndex
CREATE INDEX "Payment_tournamentId_status_idx" ON "Payment"("tournamentId", "status");

-- CreateIndex
CREATE INDEX "Payment_purchaserId_status_idx" ON "Payment"("purchaserId", "status");

-- CreateIndex
CREATE INDEX "Payment_gateway_status_idx" ON "Payment"("gateway", "status");

-- CreateIndex
CREATE INDEX "MatchDispute_tournamentId_matchId_status_idx" ON "MatchDispute"("tournamentId", "matchId", "status");

-- CreateIndex
CREATE INDEX "MatchDispute_status_createdAt_idx" ON "MatchDispute"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_playerId_key" ON "Wallet"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_fanId_key" ON "Wallet"("fanId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- CreateIndex
CREATE INDEX "Wallet_userId_idx" ON "Wallet"("userId");

-- CreateIndex
CREATE INDEX "Wallet_playerId_idx" ON "Wallet"("playerId");

-- CreateIndex
CREATE INDEX "Wallet_fanId_idx" ON "Wallet"("fanId");

-- CreateIndex
CREATE INDEX "Wallet_status_idx" ON "Wallet"("status");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_reference_key" ON "WalletTransaction"("reference");

-- CreateIndex
CREATE INDEX "WalletTransaction_walletId_idx" ON "WalletTransaction"("walletId");

-- CreateIndex
CREATE INDEX "WalletTransaction_reference_idx" ON "WalletTransaction"("reference");

-- CreateIndex
CREATE INDEX "WalletTransaction_type_idx" ON "WalletTransaction"("type");

-- CreateIndex
CREATE INDEX "WalletTransaction_status_idx" ON "WalletTransaction"("status");

-- CreateIndex
CREATE INDEX "WalletTransaction_createdAt_idx" ON "WalletTransaction"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutRequest_reference_key" ON "PayoutRequest"("reference");

-- CreateIndex
CREATE INDEX "PayoutRequest_walletId_idx" ON "PayoutRequest"("walletId");

-- CreateIndex
CREATE INDEX "PayoutRequest_playerId_idx" ON "PayoutRequest"("playerId");

-- CreateIndex
CREATE INDEX "PayoutRequest_reference_idx" ON "PayoutRequest"("reference");

-- CreateIndex
CREATE INDEX "PayoutRequest_status_idx" ON "PayoutRequest"("status");

-- CreateIndex
CREATE INDEX "PayoutRequest_createdAt_idx" ON "PayoutRequest"("createdAt");

-- AddForeignKey
ALTER TABLE "FanPrediction" ADD CONSTRAINT "FanPrediction_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan"("fanId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FanPrediction" ADD CONSTRAINT "FanPrediction_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("tournamentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FanCoinTransaction" ADD CONSTRAINT "FanCoinTransaction_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan"("fanId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FanCoinTransaction" ADD CONSTRAINT "FanCoinTransaction_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "FanPrediction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follower" ADD CONSTRAINT "Follower_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan"("fanId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follower" ADD CONSTRAINT "Follower_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("playerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follower" ADD CONSTRAINT "Follower_targetPlayerId_fkey" FOREIGN KEY ("targetPlayerId") REFERENCES "Player"("playerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follower" ADD CONSTRAINT "Follower_targetFanId_fkey" FOREIGN KEY ("targetFanId") REFERENCES "Fan"("fanId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingDataCollection" ADD CONSTRAINT "MarketingDataCollection_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan"("fanId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingDataCollection" ADD CONSTRAINT "MarketingDataCollection_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("playerId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingDataCollection" ADD CONSTRAINT "MarketingDataCollection_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("employeeId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerRegistrationHistory" ADD CONSTRAINT "PlayerRegistrationHistory_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("playerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerDocument" ADD CONSTRAINT "PlayerDocument_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("playerId") ON DELETE CASCADE ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("tournamentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan"("fanId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("playerId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketTier" ADD CONSTRAINT "TicketTier_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("tournamentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentStaffAssignment" ADD CONSTRAINT "TournamentStaffAssignment_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("tournamentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentStaffAssignment" ADD CONSTRAINT "TournamentStaffAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("employeeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentGuideline" ADD CONSTRAINT "TournamentGuideline_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("tournamentId") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "TournamentRegistration" ADD CONSTRAINT "TournamentRegistration_fanApplicationId_fkey" FOREIGN KEY ("fanApplicationId") REFERENCES "FanTournamentApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FanTournamentApplication" ADD CONSTRAINT "FanTournamentApplication_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan"("fanId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FanTournamentApplication" ADD CONSTRAINT "FanTournamentApplication_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("tournamentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FanTournamentApplication" ADD CONSTRAINT "FanTournamentApplication_homeVenueId_fkey" FOREIGN KEY ("homeVenueId") REFERENCES "Venue"("venueId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FanTournamentApplication" ADD CONSTRAINT "FanTournamentApplication_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("playerId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "FanTournamentApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("tournamentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Raffle" ADD CONSTRAINT "Raffle_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("tournamentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("playerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan"("fanId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("walletId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutRequest" ADD CONSTRAINT "PayoutRequest_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("walletId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutRequest" ADD CONSTRAINT "PayoutRequest_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("playerId") ON DELETE CASCADE ON UPDATE CASCADE;
