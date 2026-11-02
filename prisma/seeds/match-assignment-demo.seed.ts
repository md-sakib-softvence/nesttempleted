import 'dotenv/config';
import { EmployeeRole, EmployeeState, Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as bcrypt from 'bcrypt';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const TOURNAMENT_ID = 'prediction-demo-cup';
const DEMO_EMPLOYEES = [
  {
    employeeId: 'emp-match-ops-001',
    showEmployeeId: 'MATCH-OPS-001',
    name: 'Demo Match Operator One',
    email: 'match.ops.one@tape.test',
    phoneNumber: '+8801700000101',
  },
  {
    employeeId: 'emp-match-ops-002',
    showEmployeeId: 'MATCH-OPS-002',
    name: 'Demo Match Operator Two',
    email: 'match.ops.two@tape.test',
    phoneNumber: '+8801700000102',
  },
] as const;
const DEMO_MANAGER = {
  employeeId: 'emp-match-manager-001',
  showEmployeeId: 'MATCH-MANAGER-001',
  name: 'Demo Tournament Manager',
  email: 'match.manager@tape.test',
  phoneNumber: '+8801700000103',
} as const;

async function main() {
  const tournament = await prisma.tournament.findUnique({
    where: { tournamentId: TOURNAMENT_ID },
    select: { tournamentId: true, schedule: true },
  });
  if (!tournament) {
    throw new Error(
      `Tournament ${TOURNAMENT_ID} not found. Run the prediction demo seed first.`,
    );
  }

  const password = await bcrypt.hash('password123', 10);
  const employees: Array<{ employeeId: string; email: string }> = [];
  for (const demoEmployee of DEMO_EMPLOYEES) {
    const employee = await prisma.employee.upsert({
      where: { email: demoEmployee.email },
      update: {
        name: demoEmployee.name,
        role: EmployeeRole.EMPLOYEE,
        state: EmployeeState.ACTIVE,
        isDeleted: false,
      },
      create: {
        ...demoEmployee,
        role: EmployeeRole.EMPLOYEE,
        state: EmployeeState.ACTIVE,
        password,
        document: [],
        qrCode: [],
      },
      select: { employeeId: true, email: true },
    });
    employees.push(employee);
  }

  const manager = await prisma.employee.upsert({
    where: { email: DEMO_MANAGER.email },
    update: {
      name: DEMO_MANAGER.name,
      role: EmployeeRole.MANAGER,
      state: EmployeeState.ACTIVE,
      isDeleted: false,
    },
    create: {
      ...DEMO_MANAGER,
      role: EmployeeRole.MANAGER,
      state: EmployeeState.ACTIVE,
      password,
      document: [],
      qrCode: [],
    },
    select: { employeeId: true, email: true },
  });

  const now = new Date();
  const demoMatches = Array.from({ length: 4 }, (_, index) => {
    const number = index + 1;
    const scheduledAt = new Date(now.getTime() + (index + 1) * 60 * 60 * 1000);
    const date = scheduledAt.toISOString().slice(0, 10);
    const time = scheduledAt.toISOString().slice(11, 16);
    const playerOne = number * 2 - 1;
    const playerTwo = number * 2;
    return {
      id: `prediction-demo-match-${number}`,
      matchNumber: number,
      round: 'Demo Round 1',
      stage: 'GROUP_STAGE',
      player1Id: `pred-demo-player-${String(playerOne).padStart(2, '0')}`,
      player1Name: `Demo Player ${String(playerOne).padStart(2, '0')}`,
      player2Id: `pred-demo-player-${String(playerTwo).padStart(2, '0')}`,
      player2Name: `Demo Player ${String(playerTwo).padStart(2, '0')}`,
      score1: null,
      score2: null,
      status: 'SCHEDULED',
      date,
      time,
      scheduledDate: date,
      startTime: time,
      venueName: 'Tape Esports Demo Arena',
      screenName: `Main Screen ${number}`,
    };
  });

  const schedule = (tournament.schedule || {}) as Record<string, any>;
  const structure = schedule.structure || {};
  const currentMatches: any[] = Array.isArray(structure.matches)
    ? structure.matches
    : Array.isArray(schedule.matches)
      ? schedule.matches
      : [];
  const currentById = new Map(currentMatches.map((match) => [String(match.id), match]));
  const mergedMatches = [...currentMatches];

  for (const seededMatch of demoMatches) {
    const existing = currentById.get(seededMatch.id);
    const merged = existing
      ? {
          ...seededMatch,
          ...existing,
          date: existing.date || existing.scheduledDate || seededMatch.date,
          time: existing.time || existing.startTime || seededMatch.time,
          venueName: existing.venueName || seededMatch.venueName,
          screenName: existing.screenName || seededMatch.screenName,
        }
      : seededMatch;
    if (existing) {
      const position = mergedMatches.findIndex((match) => String(match.id) === seededMatch.id);
      mergedMatches[position] = merged;
    } else {
      mergedMatches.push(merged);
      currentById.set(seededMatch.id, merged);
    }
  }

  await prisma.tournament.update({
    where: { tournamentId: TOURNAMENT_ID },
    data: {
      schedule: {
        ...schedule,
        structure: { ...structure, matches: mergedMatches },
        matches: mergedMatches,
      } as Prisma.InputJsonValue,
    },
  });

  // Seed two visible assignments and leave the other fixtures unassigned for testing.
  for (let index = 0; index < 2; index++) {
    await prisma.tournamentStaffAssignment.upsert({
      where: {
        tournamentId_matchId: {
          tournamentId: TOURNAMENT_ID,
          matchId: `prediction-demo-match-${index + 1}`,
        },
      },
      update: { employeeId: employees[index].employeeId },
      create: {
        tournamentId: TOURNAMENT_ID,
        matchId: `prediction-demo-match-${index + 1}`,
        employeeId: employees[index].employeeId,
      },
    });
  }

  console.log('Match assignment demo data is ready.');
  console.log(`Tournament: ${TOURNAMENT_ID} (${mergedMatches.length} scheduled matches)`);
  console.log('Seeded assignments: 2 assigned, 2 left unassigned.');
  console.log('Demo employees (password for both: password123):');
  for (const employee of employees) console.log(`- ${employee.email}`);
  console.log(`Demo manager: ${manager.email} (password: password123)`);
}

main()
  .catch((error) => {
    console.error('Match assignment demo seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
