-- Structured rules, terms, and policy content for tournaments.
CREATE TYPE "TournamentGuidelineSection" AS ENUM ('RULES', 'TERMS', 'POLICY');

CREATE TYPE "TournamentGuidelineType" AS ENUM ('TEXT', 'FILE', 'LINK');

CREATE TYPE "TournamentGuidelineAudience" AS ENUM ('PLAYER', 'SPECTATOR', 'ALL');

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

CREATE UNIQUE INDEX "TournamentGuideline_tournamentId_section_key_key"
    ON "TournamentGuideline"("tournamentId", "section", "key");

CREATE INDEX "TournamentGuideline_tournamentId_section_isPublished_sortOrder_idx"
    ON "TournamentGuideline"("tournamentId", "section", "isPublished", "sortOrder");

ALTER TABLE "TournamentGuideline"
    ADD CONSTRAINT "TournamentGuideline_tournamentId_fkey"
    FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("tournamentId")
    ON DELETE CASCADE ON UPDATE CASCADE;
