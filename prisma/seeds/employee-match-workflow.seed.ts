import 'dotenv/config';
import {
  EmployeeRole,
  EmployeeState,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as bcrypt from 'bcrypt';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const TOURNAMENT_ID = 'employee-match-workflow-demo';
const DEMO_PASSWORD = 'password123';

const operators = [
  {
    employeeId: 'emp-workflow-operator-001',
    showEmployeeId: 'WORKFLOW-OPS-001',
    name: 'Workflow Test Operator One',
    email: 'workflow.ops.one@tape.test',
    phoneNumber: '+8801700000201',
  },
  {
    employeeId: 'emp-workflow-operator-002',
    showEmployeeId: 'WORKFLOW-OPS-002',
    name: 'Workflow Test Operator Two',
    email: 'workflow.ops.two@tape.test',
    phoneNumber: '+8801700000202',
  },
] as const;

const manager = {
  employeeId: 'emp-workflow-manager-001',
  showEmployeeId: 'WORKFLOW-MANAGER-001',
  name: 'Workflow Test Manager',
  email: 'workflow.manager@tape.test',
  phoneNumber: '+8801700000203',
} as const;

const players = [
  {
    playerId: 'workflow-demo-player-01',
    showPlayerId: 'WORKFLOW-PLAYER-001',
    firstName: 'Workflow Player',
    lastName: 'One',
    gamerTag: 'WorkflowPlayer01',
    email: 'workflow.player.01@tape.test',
    phoneNumber: '+8801700000211',
  },
  {
    playerId: 'workflow-demo-player-02',
    showPlayerId: 'WORKFLOW-PLAYER-002',
    firstName: 'Workflow Player',
    lastName: 'Two',
    gamerTag: 'WorkflowPlayer02',
    email: 'workflow.player.02@tape.test',
    phoneNumber: '+8801700000212',
  },
  {
    playerId: 'workflow-demo-player-03',
    showPlayerId: 'WORKFLOW-PLAYER-003',
    firstName: 'Workflow Player',
    lastName: 'Three',
    gamerTag: 'WorkflowPlayer03',
    email: 'workflow.player.03@tape.test',
    phoneNumber: '+8801700000213',
  },
  {
    playerId: 'workflow-demo-player-04',
    showPlayerId: 'WORKFLOW-PLAYER-004',
    firstName: 'Workflow Player',
    lastName: 'Four',
    gamerTag: 'WorkflowPlayer04',
    email: 'workflow.player.04@tape.test',
    phoneNumber: '+8801700000214',
  },
] as const;

async function upsertEmployee(
  employee: (typeof operators)[number] | typeof manager,
  role: EmployeeRole,
  password: string,
) {
  return prisma.employee.upsert({
    where: { email: employee.email },
    update: {
      name: employee.name,
      role,
      state: EmployeeState.ACTIVE,
      isDeleted: false,
      password,
    },
    create: {
      ...employee,
      role,
      state: EmployeeState.ACTIVE,
      password,
      document: [],
      qrCode: [],
    },
  });
}

async function main() {
  const password = await bcrypt.hash(DEMO_PASSWORD, 10);

  const tournament = await prisma.tournament.findUnique({
    where: { tournamentId: TOURNAMENT_ID },
    select: { tournamentId: true, schedule: true },
  });

  const scheduledAt = new Date(Date.now() + 60 * 60 * 1000);
  const matchIds = ['workflow-demo-match-1', 'workflow-demo-match-2'];
  const seedMatches = matchIds.map((id, index) => {
    const playerOne = players[index * 2];
    const playerTwo = players[index * 2 + 1];
    const matchTime = new Date(scheduledAt.getTime() + index * 60 * 60 * 1000);
    const date = matchTime.toISOString().slice(0, 10);
    const time = matchTime.toISOString().slice(11, 16);

    return {
      id,
      matchNumber: index + 1,
      round: 'Workflow Test Round',
      stage: 'GROUP_STAGE',
      player1Id: playerOne.playerId,
      player1Name: playerOne.gamerTag,
      player2Id: playerTwo.playerId,
      player2Name: playerTwo.gamerTag,
      score1: null,
      score2: null,
      status: 'SCHEDULED',
      date,
      time,
      scheduledDate: date,
      startTime: time,
      venueName: 'Workflow Test Arena',
      screenName: `Test Screen ${index + 1}`,
    };
  });

  const schedule = (tournament?.schedule || {}) as Record<string, any>;
  const structure = schedule.structure || {};
  const currentMatches: any[] = Array.isArray(structure.matches)
    ? structure.matches
    : Array.isArray(schedule.matches)
      ? schedule.matches
      : [];
  const currentById = new Map(
    currentMatches.map((match) => [String(match.id), match]),
  );
  const mergedMatches = [...currentMatches];

  for (const seededMatch of seedMatches) {
    const existing = currentById.get(seededMatch.id);
    if (existing) continue; // Reruns preserve match progress and scores.
    mergedMatches.push(seededMatch);
    currentById.set(seededMatch.id, seededMatch);
  }

  const tournamentData = {
    name: 'Employee Match Workflow Test Cup',
    gameTitle: 'EA SPORTS FC 26',
    gameType: 'FOOTBALL' as const,
    tournamentFormat: 'LEAGUE' as const,
    numberOfTeams: 4,
    entryFee: 0,
    currency: 'USD' as const,
    paymentWindow: 24,
    prizeRule: 'FIXED_AMOUNT' as const,
    percentage: null,
    houseRake: null,
    couponCreation: false,
    registrationCutOffMode: 'MANUAL' as const,
    startDate: scheduledAt,
    deadline: scheduledAt,
    capacity: 4,
    dailyStart: '12:00',
    dailyEnd: '18:00',
    matchDuration: 30,
    turnoverDuration: 5,
    lunchBreakTime: null,
    lunchDuration: null,
    buffer: 0,
    frequencyStatus: 'DAILY' as const,
    frequencyArray: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    rules: ['Development-only workflow fixtures. No cash payments or prizes.'],
    tsAndTc: [],
    schedulingMode: 'MANUAL' as const,
    schedule: {
      ...schedule,
      structure: { ...structure, matches: mergedMatches },
      matches: mergedMatches,
    } as Prisma.InputJsonValue,
    status: 'IN_PROGRESS' as const,
    registrationOpen: false,
    isDeleted: false,
  };

  if (tournament) {
    await prisma.tournament.update({
      where: { tournamentId: TOURNAMENT_ID },
      data: { schedule: tournamentData.schedule },
    });
  } else {
    await prisma.tournament.create({
      data: { tournamentId: TOURNAMENT_ID, ...tournamentData },
    });
  }

  for (const operator of operators) {
    await upsertEmployee(operator, EmployeeRole.EMPLOYEE, password);
  }
  await upsertEmployee(manager, EmployeeRole.MANAGER, password);

  for (const player of players) {
    await prisma.player.upsert({
      where: { playerId: player.playerId },
      update: {
        firstName: player.firstName,
        lastName: player.lastName,
        gamerTag: player.gamerTag,
        isDeleted: false,
      },
      create: {
        ...player,
        password,
        status: 'ACTIVE',
      },
    });

    const qrCodeString = `PLAYER:${TOURNAMENT_ID}:${player.playerId}`;
    await prisma.tournamentRegistration.upsert({
      where: {
        tournamentId_playerId: {
          tournamentId: TOURNAMENT_ID,
          playerId: player.playerId,
        },
      },
      update: {
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        qrCodeString,
      },
      create: {
        tournamentId: TOURNAMENT_ID,
        playerId: player.playerId,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        qrCodeString,
      },
    });
  }

  // Deliberately create no staff assignments. Assign both matches from the manager/admin UI.
  const assignmentCount = await prisma.tournamentStaffAssignment.count({
    where: { tournamentId: TOURNAMENT_ID },
  });
  console.log('Employee match workflow demo data is ready.');
  console.log(`Tournament ID: ${TOURNAMENT_ID}`);
  console.log(`Fixtures: ${matchIds.join(', ')}`);
  console.log(`Existing assignments preserved: ${assignmentCount}`);
  console.log('New fixture assignments: none; assign them in Manager/Admin > Tournament > Match Assignments.');
  console.log(`Manager login: ${manager.email} / ${DEMO_PASSWORD}`);
  console.log(`Employee logins: ${operators.map((item) => item.email).join(', ')} / ${DEMO_PASSWORD}`);
  console.log('Player QR tokens:');
  for (const player of players) {
    console.log(`- PLAYER:${TOURNAMENT_ID}:${player.playerId}`);
  }
}

main()
  .catch((error) => {
    console.error('Employee match workflow demo seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
