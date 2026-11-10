CREATE TABLE "PasswordResetCode" (
    "passwordResetCodeId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "requestedRole" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetCode_pkey" PRIMARY KEY ("passwordResetCodeId")
);

CREATE INDEX "PasswordResetCode_email_createdAt_idx"
    ON "PasswordResetCode"("email", "createdAt");

CREATE INDEX "PasswordResetCode_expiresAt_idx"
    ON "PasswordResetCode"("expiresAt");
