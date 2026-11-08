import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

/**
 * Idempotent local-only demo fixtures for the signed-in Player Calendar.
 * Writes match schedule JSON only; it does not change payments, wallet balances,
 * or tournament registrations.
 */
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const PLAYER_EMAIL = 'player1@gmail.com';
const OPPONENT_EMAILS = ['local.player@tape.test', 'playeradder@gmail.com'] as const;
const UPCOMING_TOURNAMENT_NAME = 'LOCAL TEST | FC 26 Open Cup';
const COMPLETED_TOURNAMENT_NAME = 'eFootball 2026 Super Clash';
const SEED_PREFIX = 'local-player-calendar-demo-';

const localDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const dateOffset = (days: number) => {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return localDate(value);
};

async function addMatches(tournamentId: string, additions: Record<string, unknown>[]) {
  const tournament = await prisma.tournament.findUniqueOrThrow({
    where: { tournamentId },
    select: { schedule: true },
  });
  const current = (tournament.schedule && typeof tournament.schedule === 'object' && !Array.isArray(tournament.schedule)
    ? tournament.schedule
    : {}) as Record<string, any>;
  const structure = current.structure && typeof current.structure === 'object'
    ? current.structure
    : {};
  const existing = Array.isArray(structure.matches)
    ? structure.matches
    : Array.isArray(current.matches)
      ? current.matches
      : [];
  const byId = new Map(existing.map((match: any) => [String(match.id), match]));
  additions.forEach((match) => byId.set(String(match.id), match));
  const matches = [...byId.values()];

  await prisma.tournament.update({
    where: { tournamentId },
    data: {
      schedule: {
        ...current,
        version: current.version || 1,
        structure: { ...structure, matches },
        matches,
      } as Prisma.InputJsonValue,
    },
  });
  return matches.length;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required.');
  const hostname = new URL(url).hostname;
  if (!['localhost', '127.0.0.1', '::1', 'host.docker.internal'].includes(hostname)) {
    throw new Error(`Refusing to seed a non-local database (${hostname}).`);
  }

  const [player, opponents, upcomingTournament, completedTournament] = await Promise.all([
    prisma.player.findUnique({ where: { email: PLAYER_EMAIL } }),
    prisma.player.findMany({ where: { email: { in: [...OPPONENT_EMAILS] } } }),
    prisma.tournament.findFirst({ where: { name: UPCOMING_TOURNAMENT_NAME, isDeleted: false } }),
    prisma.tournament.findFirst({ where: { name: COMPLETED_TOURNAMENT_NAME, isDeleted: false } }),
  ]);
  if (!player) throw new Error(`Local test player ${PLAYER_EMAIL} was not found.`);
  if (opponents.length !== OPPONENT_EMAILS.length) throw new Error('Expected local demo opponents were not found.');
  if (!upcomingTournament) throw new Error(`Tournament ${UPCOMING_TOURNAMENT_NAME} was not found.`);
  if (!completedTournament) throw new Error(`Tournament ${COMPLETED_TOURNAMENT_NAME} was not found.`);

  const opponentByEmail = new Map(opponents.map((opponent) => [opponent.email, opponent]));
  const firstOpponent = opponentByEmail.get(OPPONENT_EMAILS[0])!;
  const secondOpponent = opponentByEmail.get(OPPONENT_EMAILS[1])!;
  const playerTag = player.gamerTag || `${player.firstName} ${player.lastName}`;
  const display = (person: typeof player) => ({
    playerId: person.playerId,
    gamertag: person.gamerTag || `${person.firstName} ${person.lastName}`,
    fullName: `${person.firstName} ${person.lastName}`,
    profilePicture: person.profilePicture || null,
  });

  const upcomingMatches = [
    {
      id: `${SEED_PREFIX}fc26-01`,
      matchNumber: 901,
      stage: 'DEMO',
      player1Id: player.playerId,
      player2Id: firstOpponent.playerId,
      player1Name: playerTag,
      player2Name: firstOpponent.gamerTag || firstOpponent.email,
      player1: display(player),
      player2: display(firstOpponent),
      score1: null,
      score2: null,
      status: 'SCHEDULED',
      scheduledDate: dateOffset(2),
      startTime: '18:30',
      venueName: 'Local Demo Arena',
      screenName: 'Main Stage',
      demoSeed: SEED_PREFIX,
    },
    {
      id: `${SEED_PREFIX}fc26-02`,
      matchNumber: 902,
      stage: 'DEMO',
      player1Id: player.playerId,
      player2Id: secondOpponent.playerId,
      player1Name: playerTag,
      player2Name: secondOpponent.gamerTag || secondOpponent.email,
      player1: display(player),
      player2: display(secondOpponent),
      score1: null,
      score2: null,
      status: 'SCHEDULED',
      scheduledDate: dateOffset(3),
      startTime: '19:00',
      venueName: 'Local Demo Arena',
      screenName: 'Main Stage',
      demoSeed: SEED_PREFIX,
    },
  ];

  const completedMatch = {
    id: `${SEED_PREFIX}efootball-01`,
    matchNumber: 903,
    stage: 'DEMO',
    player1Id: player.playerId,
    player2Id: firstOpponent.playerId,
    player1Name: playerTag,
    player2Name: firstOpponent.gamerTag || firstOpponent.email,
    player1: display(player),
    player2: display(firstOpponent),
    score1: 3,
    score2: 1,
    winnerId: player.playerId,
    status: 'COMPLETED',
    scheduledDate: dateOffset(-1),
    startTime: '17:00',
    venueName: 'Local Demo Arena',
    screenName: 'Main Stage',
    demoSeed: SEED_PREFIX,
  };

  const [upcomingCount, historyCount] = await Promise.all([
    addMatches(upcomingTournament.tournamentId, upcomingMatches),
    addMatches(completedTournament.tournamentId, [completedMatch]),
  ]);

  console.log('Local player calendar demo fixtures seeded.');
  console.log(`Player: ${PLAYER_EMAIL} (${playerTag})`);
  console.log(`Upcoming: ${upcomingTournament.name} — 2 fixtures (${upcomingCount} total schedule matches)`);
  console.log(`History: ${completedTournament.name} — 1 completed fixture, 3–1 (${historyCount} total schedule matches)`);
}

main()
  .catch((error) => {
    console.error('Could not seed local player calendar fixtures.', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
