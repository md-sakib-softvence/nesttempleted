-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('new_user', 'payment');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "AdminStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "EmployeeRole" AS ENUM ('SECURITY', 'EMPLOYEE', 'MANAGER', 'AMBASSADOR');

-- CreateEnum
CREATE TYPE "EmployeeState" AS ENUM ('ACTIVE', 'INACTIVE', 'TERMINATE');

-- CreateEnum
CREATE TYPE "FanStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BANNED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN', 'SUPER_ADMIN');

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

-- CreateTable
CREATE TABLE "ActivityLog" (
    "activityLogId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ActivityStatus" NOT NULL,
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
    "cashLeader" BOOLEAN NOT NULL DEFAULT false,
    "enablePost" BOOLEAN NOT NULL DEFAULT false,
    "password" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("employeeId")
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
    "topPoint" INTEGER NOT NULL DEFAULT 0,
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
CREATE TABLE "MarketingDataCollection" (
    "marketingDataCollectionId" TEXT NOT NULL,
    "fanId" TEXT,
    "playerId" TEXT,
    "employeeId" TEXT,
    "favoriteGameConsole" TEXT NOT NULL,
    "favoriteFootballGame" TEXT NOT NULL,
    "registerAs" "RegisterAs" NOT NULL,
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
    "area" TEXT,
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
CREATE INDEX "ActivityLog_status_idx" ON "ActivityLog"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_showEmployeeId_key" ON "Employee"("showEmployeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_email_key" ON "Employee"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Fan_showFanId_key" ON "Fan"("showFanId");

-- CreateIndex
CREATE UNIQUE INDEX "Fan_email_key" ON "Fan"("email");

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

-- AddForeignKey
ALTER TABLE "MarketingDataCollection" ADD CONSTRAINT "MarketingDataCollection_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "Fan"("fanId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingDataCollection" ADD CONSTRAINT "MarketingDataCollection_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("playerId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingDataCollection" ADD CONSTRAINT "MarketingDataCollection_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("employeeId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerRegistrationHistory" ADD CONSTRAINT "PlayerRegistrationHistory_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("playerId") ON DELETE RESTRICT ON UPDATE CASCADE;

