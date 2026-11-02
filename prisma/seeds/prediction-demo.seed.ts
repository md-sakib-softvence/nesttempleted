import 'dotenv/config';
import { PrismaClient, Prisma, FanStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as bcrypt from 'bcrypt';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const DEMO_TOURNAMENT_ID = 'prediction-demo-cup';
const DEMO_FAN_EMAIL = 'prediction.tester@tape.com';
const DEMO_FAN_PASSWORD = 'password123';
const DEMO_COINS = 1200;

async function main() {
  const password = await bcrypt.hash(DEMO_FAN_PASSWORD, 10);
  const fanExisting = await prisma.fan.findUnique({ where: { email: DEMO_FAN_EMAIL } });
  const fan = fanExisting
    ? await prisma.fan.update({
        where: { fanId: fanExisting.fanId },
        data: { status: FanStatus.ACTIVE, isDeleted: false, password },
      })
    : await prisma.fan.create({
        data: {
          showFanId: 'FAN-PREDICTION-TEST',
          firstName: 'Prediction',
          surname: 'Tester',
          email: DEMO_FAN_EMAIL,
          phoneNumber: '+8801700000099',
          password,
          gender: 'Other',
          ageRange: '18-24',
          status: FanStatus.ACTIVE,
          coins: 0,
          favoriteGame: 'EA SPORTS FC 26',
          gamerTag: 'PredictionTester',
        },
      });

  const shortfall = Math.max(0, DEMO_COINS - fan.coins);
  const updatedFan = shortfall
    ? await prisma.$transaction(async (tx) => {
        const credited = await tx.fan.update({
          where: { fanId: fan.fanId },
          data: { coins: { increment: shortfall } },
          select: { coins: true },
        });
        await tx.fanCoinTransaction.create({
          data: {
            fanId: fan.fanId,
            type: 'SEED_CREDIT',
            amount: shortfall,
            balanceAfter: credited.coins,
            description: 'Development prediction demo starting balance',
          },
        });
        return credited;
      })
    : { coins: fan.coins };

  const demoPlayers = [
    ['pred-demo-player-01', 'PRED-DEMO-001', 'pred-demo-01@tape.test', 'Demo Player 01'],
    ['pred-demo-player-02', 'PRED-DEMO-002', 'pred-demo-02@tape.test', 'Demo Player 02'],
    ['pred-demo-player-03', 'PRED-DEMO-003', 'pred-demo-03@tape.test', 'Demo Player 03'],
    ['pred-demo-player-04', 'PRED-DEMO-004', 'pred-demo-04@tape.test', 'Demo Player 04'],
    ['pred-demo-player-05', 'PRED-DEMO-005', 'pred-demo-05@tape.test', 'Demo Player 05'],
    ['pred-demo-player-06', 'PRED-DEMO-006', 'pred-demo-06@tape.test', 'Demo Player 06'],
    ['pred-demo-player-07', 'PRED-DEMO-007', 'pred-demo-07@tape.test', 'Demo Player 07'],
    ['pred-demo-player-08', 'PRED-DEMO-008', 'pred-demo-08@tape.test', 'Demo Player 08'],
  ] as const;
  const playerPassword = await bcrypt.hash('password123', 10);
  const players: Array<{ playerId: string; gamerTag: string | null; firstName: string }> = [];
  for (const [playerId, showPlayerId, email, gamerTag] of demoPlayers) {
    const [firstName, lastName] = gamerTag.split(' ');
    players.push(await prisma.player.upsert({
      where: { playerId },
      update: { gamerTag, firstName, lastName, isDeleted: false },
      create: {
        playerId,
        showPlayerId,
        email,
        password: playerPassword,
        gamerTag,
        firstName,
        lastName,
        phoneNumber: `+88017000000${String(players.length + 10).padStart(2, '0')}`,
        status: 'ACTIVE',
      },
    }));
  }

  const scheduledAt = new Date(Date.now() + 60 * 60 * 1000);
  const matches = Array.from({ length: 4 }, (_, index) => {
    const player1 = players[index * 2];
    const player2 = players[index * 2 + 1];
    return {
      id: `prediction-demo-match-${index + 1}`,
      matchNumber: index + 1,
      round: 'Demo Round 1',
      stage: 'GROUP_STAGE',
      player1Id: player1.playerId,
      player1Name: player1.gamerTag || player1.firstName,
      player2Id: player2.playerId,
      player2Name: player2.gamerTag || player2.firstName,
      score1: null,
      score2: null,
      status: 'SCHEDULED',
      scheduledDate: scheduledAt.toISOString().slice(0, 10),
      startTime: `${String(12 + index).padStart(2, '0')}:00`,
    };
  });

  const demoTournamentData = {
    name: 'Prediction Testing Cup (Demo Seed)',
    gameTitle: 'EA SPORTS FC 26',
    gameType: 'FOOTBALL' as const,
    tournamentFormat: 'LEAGUE' as const,
    numberOfTeams: 8,
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
    capacity: 8,
    dailyStart: '12:00',
    dailyEnd: '18:00',
    matchDuration: 30,
    turnoverDuration: 5,
    lunchBreakTime: null,
    lunchDuration: null,
    buffer: 0,
    frequencyStatus: 'DAILY' as const,
    frequencyArray: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    rules: ['Development-only prediction test fixtures. No cash or prizes.'],
    tsAndTc: [],
    schedulingMode: 'MANUAL' as const,
    schedule: { matches } as Prisma.InputJsonValue,
    status: 'IN_PROGRESS' as const,
    registrationOpen: false,
    isDeleted: false,
  };

  const existingDemoTournament = await prisma.tournament.findUnique({
    where: { tournamentId: DEMO_TOURNAMENT_ID },
    select: { tournamentId: true },
  });
  const existingPredictionCount = existingDemoTournament
    ? await prisma.fanPrediction.count({ where: { tournamentId: DEMO_TOURNAMENT_ID } })
    : 0;

  if (existingDemoTournament && existingPredictionCount > 0) {
    console.log('Existing predictions found; preserving the demo match results and schedule.');
  } else {
    await prisma.tournament.upsert({
      where: { tournamentId: DEMO_TOURNAMENT_ID },
      update: demoTournamentData,
      create: { tournamentId: DEMO_TOURNAMENT_ID, ...demoTournamentData },
    });
  }

  // Keep the seeded match participants eligible for the real employee QR check-in flow.
  for (const player of players) {
    const qrCodeString = `PLAYER:${DEMO_TOURNAMENT_ID}:${player.playerId}`;
    await prisma.tournamentRegistration.upsert({
      where: {
        tournamentId_playerId: {
          tournamentId: DEMO_TOURNAMENT_ID,
          playerId: player.playerId,
        },
      },
      update: {
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        qrCodeString,
      },
      create: {
        tournamentId: DEMO_TOURNAMENT_ID,
        playerId: player.playerId,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        qrCodeString,
      },
    });
  }

  console.log('Prediction demo seed is ready.');
  console.log(`Fan login: ${DEMO_FAN_EMAIL} / ${DEMO_FAN_PASSWORD}`);
  console.log(`Fan coins: ${updatedFan.coins}`);
  console.log(`Tournament: ${DEMO_TOURNAMENT_ID} (${matches.length} open fixtures)`);
}

main()
  .catch((error) => {
    console.error('Prediction demo seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
