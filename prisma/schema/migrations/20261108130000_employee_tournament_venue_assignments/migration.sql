CREATE TABLE "EmployeeTournamentAssignment" (
  "id" TEXT NOT NULL,
  "assignmentKey" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "venueId" TEXT,
  "screenId" TEXT,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmployeeTournamentAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmployeeTournamentAssignment_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("employeeId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EmployeeTournamentAssignment_tournamentId_fkey"
    FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("tournamentId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EmployeeTournamentAssignment_venueId_fkey"
    FOREIGN KEY ("venueId") REFERENCES "Venue"("venueId") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "EmployeeTournamentAssignment_screenId_fkey"
    FOREIGN KEY ("screenId") REFERENCES "Screen"("screenId") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "EmployeeTournamentAssignment_assignmentKey_key"
  ON "EmployeeTournamentAssignment"("assignmentKey");
CREATE INDEX "EmployeeTournamentAssignment_employeeId_tournamentId_idx"
  ON "EmployeeTournamentAssignment"("employeeId", "tournamentId");
CREATE INDEX "EmployeeTournamentAssignment_tournamentId_idx"
  ON "EmployeeTournamentAssignment"("tournamentId");
