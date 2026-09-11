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
