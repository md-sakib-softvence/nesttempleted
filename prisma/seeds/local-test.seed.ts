import 'dotenv/config';
import {
  Currency,
  FrequencyStatus,
  PlayerStatus,
  Prisma,
  PrismaClient,
  PrizeRule,
  SchedulingMode,
  TournamentFormat,
  TournamentGameType,
  TournamentRegistrationStatus,
  TournamentStatus,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is not configured.');

const databaseHost = new URL(databaseUrl).hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(databaseHost)) {
  throw new Error(
    `Local test seed refused to run against non-local database host: ${databaseHost}`,
  );
}

const pool = new pg.Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const playerEmail = 'player1@gmail.com';

async function uniquePlayerValue(
  field: 'gamerTag' | 'username',
  baseValue: string,
) {
  let candidate = baseValue;
  let suffix = 2;

  while (
    await prisma.player.findFirst({
      where: {
        email: { not: playerEmail },
        [field]: { equals: candidate, mode: 'insensitive' },
      },
      select: { playerId: true },
    })
  ) {
    candidate = `${baseValue}_${suffix}`;
    suffix += 1;
  }

  return candidate;
}

async function uniquePlayerPhone() {
  for (let suffix = 1; ; suffix += 1) {
    const candidate = `+880199900${String(suffix).padStart(4, '0')}`;
    const matches = await prisma.$queryRaw<Array<{ playerId: string }>>(
      Prisma.sql`
        SELECT "playerId"
        FROM "Player"
        WHERE email <> ${playerEmail}
          AND regexp_replace("phoneNumber", '[^0-9]', '', 'g') = ${candidate.replace(/\D/g, '')}
        LIMIT 1
      `,
    );
    if (matches.length === 0) return candidate;
  }
}

const tournamentSeeds = [
  {
    tournamentId: 'a1000000-0000-4000-8000-000000000001',
    name: 'LOCAL TEST | FC 26 Open Cup',
    gameTitle: 'EA SPORTS FC 26',
    gameType: TournamentGameType.FOOTBALL,
    tournamentFormat: TournamentFormat.SINGLE_ELIMINATION,
    status: TournamentStatus.REGISTRATION_OPEN,
    registrationOpen: true,
  },
  {
    tournamentId: 'a1000000-0000-4000-8000-000000000002',
    name: 'LOCAL TEST | eFootball League',
    gameTitle: 'eFootball',
    gameType: TournamentGameType.FOOTBALL,
    tournamentFormat: TournamentFormat.LEAGUE,
    status: TournamentStatus.UPCOMING,
    registrationOpen: false,
  },
  {
    tournamentId: 'a1000000-0000-4000-8000-000000000003',
    name: 'LOCAL TEST | Tekken 8 Showdown',
    gameTitle: 'Tekken 8',
    gameType: TournamentGameType.OTHER,
    tournamentFormat: TournamentFormat.DOUBLE_ELIMINATION,
    status: TournamentStatus.UPCOMING,
    registrationOpen: true,
  },
].map((tournament) => ({
  ...tournament,
  numberOfTeams: 8,
  entryFee: 0,
  currency: Currency.NGN,
  paymentWindow: 24,
  prizeRule: PrizeRule.FIXED_AMOUNT,
  startDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  capacity: 8,
  dailyStart: '10:00',
  dailyEnd: '18:00',
  matchDuration: 30,
  turnoverDuration: 10,
  buffer: 5,
  frequencyStatus: FrequencyStatus.WEEKLY,
  frequencyArray: ['Saturday', 'Sunday'],
  schedulingMode: SchedulingMode.MANUAL,
  rules: ['Local development test tournament.'],
  tsAndTc: ['For local testing only.'],
}));

async function main() {
  const gamerTag = await uniquePlayerValue('gamerTag', 'LOCAL_PLAYER_1');
  const username = await uniquePlayerValue('username', 'player1_local_test');
  const phoneNumber = await uniquePlayerPhone();
  const password = await bcrypt.hash('123456789', 10);
  const player = await prisma.player.upsert({
    where: { email: playerEmail },
    update: {
      firstName: 'Player',
      lastName: 'One',
      gamerTag,
      username,
      phoneNumber,
      password,
      status: PlayerStatus.ACTIVE,
      isDeleted: false,
    },
    create: {
      showPlayerId: 'LOCAL-TEST-PLAYER-001',
      email: playerEmail,
      password,
      firstName: 'Player',
      lastName: 'One',
      gamerTag,
      username,
      phoneNumber,
      status: PlayerStatus.ACTIVE,
    },
  });

  for (const tournament of tournamentSeeds) {
    await prisma.tournament.upsert({
      where: { tournamentId: tournament.tournamentId },
      update: tournament,
      create: tournament,
    });
    console.log(`Seeded tournament: ${tournament.name}`);
  }

  await prisma.tournamentRegistration.upsert({
    where: {
      tournamentId_playerId: {
        tournamentId: tournamentSeeds[0].tournamentId,
        playerId: player.playerId,
      },
    },
    update: {
      status: TournamentRegistrationStatus.CONFIRMED,
      paymentStatus: 'PAID',
      qrCodeString: `LOCAL-TEST:${tournamentSeeds[0].tournamentId}:${player.playerId}`,
    },
    create: {
      tournamentId: tournamentSeeds[0].tournamentId,
      playerId: player.playerId,
      status: TournamentRegistrationStatus.CONFIRMED,
      paymentStatus: 'PAID',
      qrCodeString: `LOCAL-TEST:${tournamentSeeds[0].tournamentId}:${player.playerId}`,
    },
  });

  console.log(`Seeded player: ${player.email} (${player.playerId})`);
  console.log(`Unique gamerTag: ${player.gamerTag}`);
  console.log(`Unique username: ${player.username}`);
  console.log(`Unique phone number: ${player.phoneNumber}`);
  console.log('Player password: 123456789');
  console.log(`Registered player for: ${tournamentSeeds[0].name}`);
}

main()
  .catch((error) => {
    console.error('Local test seed failed.', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
