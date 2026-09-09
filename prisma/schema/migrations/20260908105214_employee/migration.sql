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
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "Status" AS ENUM ('ACTIVE', 'TRIAL', 'SUSPEND');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('ALERT', 'REPORT', 'INFORMATION');

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

-- CreateIndex
CREATE INDEX "ActivityLog_status_idx" ON "ActivityLog"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_showEmployeeId_key" ON "Employee"("showEmployeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_email_key" ON "Employee"("email");

-- CreateIndex
CREATE INDEX "Notification_status_idx" ON "Notification"("status");
