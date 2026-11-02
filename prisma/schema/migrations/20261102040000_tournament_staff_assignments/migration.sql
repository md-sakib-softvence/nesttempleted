CREATE TABLE "TournamentStaffAssignment" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TournamentStaffAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TournamentStaffAssignment_tournamentId_matchId_key"
    ON "TournamentStaffAssignment"("tournamentId", "matchId");
CREATE INDEX "TournamentStaffAssignment_employeeId_tournamentId_idx"
    ON "TournamentStaffAssignment"("employeeId", "tournamentId");

ALTER TABLE "TournamentStaffAssignment"
    ADD CONSTRAINT "TournamentStaffAssignment_tournamentId_fkey"
    FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("tournamentId")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TournamentStaffAssignment"
    ADD CONSTRAINT "TournamentStaffAssignment_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("employeeId")
    ON DELETE RESTRICT ON UPDATE CASCADE;
