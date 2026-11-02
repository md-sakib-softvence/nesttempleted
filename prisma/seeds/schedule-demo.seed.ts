import 'dotenv/config';
import { PrismaClient, Prisma, TournamentRegistrationStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as bcrypt from 'bcrypt';

/**
 * Idempotent local demo seed for the public schedule and bracket views.
 *
 * It intentionally targets the seeded Valorant tournament, adds eight
 * confirmed demo players, and writes a canonical knockout schedule. No rows
 * are deleted, so it is safe to run repeatedly in the development database.
 */
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const playerNames = [
  ['Bracket', 'Alpha'],
  ['Bracket', 'Bravo'],
  ['Bracket', 'Charlie'],
  ['Bracket', 'Delta'],
  ['Bracket', 'Echo'],
  ['Bracket', 'Foxtrot'],
  ['Bracket', 'Golf'],
  ['Bracket', 'Hotel'],
] as const;

const playerId = (index: number) => `schedule-demo-player-${index + 1}`;
const matchId = (key: string) => `schedule-demo-${key}`;

const participant = (id: string, displayName: string) => ({
  type: id.startsWith('schedule-demo-player-') ? 'PLAYER' : 'MATCH_WINNER',
  value: id,
  displayName,
});

const main = async () => {
  const tournament = await prisma.tournament.findFirst({
    where: {
      OR: [
        { name: 'Valorant Champions Invitational 2026' },
        { gameTitle: 'Valorant' },
      ],
      isDeleted: false,
    },
    orderBy: { createdAt: 'asc' },
    include: { venues: { include: { screens: true } } },
  });

  if (!tournament) {
    throw new Error('Valorant tournament was not found. Run the normal Prisma seed first.');
  }

  const password = await bcrypt.hash('password123!', 10);
  const players = [] as Array<{ id: string; gamerTag: string; profilePicture: string | null }>;

  for (let index = 0; index < playerNames.length; index += 1) {
    const [firstName, lastName] = playerNames[index];
    const id = playerId(index);
    const gamerTag = `BRACKET_${String.fromCharCode(65 + index)}`;
    const player = await prisma.player.upsert({
      where: { playerId: id },
      update: { firstName, lastName, gamerTag, password, status: 'ACTIVE' },
      create: {
        playerId: id,
        showPlayerId: `SCH-${String(index + 1).padStart(3, '0')}`,
        email: `schedule-demo-${index + 1}@tape.com`,
        password,
        firstName,
        lastName,
        gamerTag,
        phoneNumber: `+88018000000${String(index + 1).padStart(2, '0')}`,
        status: 'ACTIVE',
      },
    });
    players.push({ id: player.playerId, gamerTag: player.gamerTag || gamerTag, profilePicture: player.profilePicture });

    await prisma.tournamentRegistration.upsert({
      where: {
        tournamentId_playerId: {
          tournamentId: tournament.tournamentId,
          playerId: player.playerId,
        },
      },
      update: {
        status: TournamentRegistrationStatus.CONFIRMED,
        paymentStatus: 'PAID',
        assignedSlot: index + 1,
        qrCodeString: `SCHEDULE-DEMO:${tournament.tournamentId}:${player.playerId}`,
      },
      create: {
        tournamentId: tournament.tournamentId,
        playerId: player.playerId,
        status: TournamentRegistrationStatus.CONFIRMED,
        paymentStatus: 'PAID',
        assignedSlot: index + 1,
        qrCodeString: `SCHEDULE-DEMO:${tournament.tournamentId}:${player.playerId}`,
      },
    });
  }

  const venue = tournament.venues[0];
  const screen = venue?.screens[0];
  const start = new Date(tournament.startDate);
  const date = start.toISOString().slice(0, 10);
  const nextDate = new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const playerMatch = (key: string, round: string, number: number, p1Index: number, p2Index: number, time: string) => ({
    id: matchId(key),
    stage: 'KNOCKOUT',
    bracketSection: 'WINNERS',
    round,
    matchNumber: number,
    participant1Ref: participant(players[p1Index].id, players[p1Index].gamerTag),
    participant2Ref: participant(players[p2Index].id, players[p2Index].gamerTag),
    player1Id: players[p1Index].id,
    player2Id: players[p2Index].id,
    player1Name: players[p1Index].gamerTag,
    player2Name: players[p2Index].gamerTag,
    score1: null,
    score2: null,
    status: 'SCHEDULED',
    scheduledDate: date,
    startTime: time,
    venueId: venue?.venueId || null,
    screenId: screen?.screenId || null,
    isSchedulable: true,
  });

  const progressionMatch = (key: string, round: string, number: number, p1: string, p1Name: string, p2: string, p2Name: string, time: string, scheduledDate: string) => ({
    id: matchId(key),
    stage: 'KNOCKOUT',
    bracketSection: 'WINNERS',
    round,
    matchNumber: number,
    participant1Ref: participant(p1, p1Name),
    participant2Ref: participant(p2, p2Name),
    score1: null,
    score2: null,
    status: 'SCHEDULED',
    scheduledDate,
    startTime: time,
    venueId: venue?.venueId || null,
    screenId: screen?.screenId || null,
    isSchedulable: false,
  });

  const matches = [
    playerMatch('qf-1', 'Quarterfinals', 1, 0, 1, '10:00'),
    playerMatch('qf-2', 'Quarterfinals', 2, 2, 3, '11:00'),
    playerMatch('qf-3', 'Quarterfinals', 3, 4, 5, '12:00'),
    playerMatch('qf-4', 'Quarterfinals', 4, 6, 7, '13:00'),
    progressionMatch('sf-1', 'Semifinals', 5, matchId('qf-1'), 'Winner QF 1', matchId('qf-2'), 'Winner QF 2', '15:00', nextDate),
    progressionMatch('sf-2', 'Semifinals', 6, matchId('qf-3'), 'Winner QF 3', matchId('qf-4'), 'Winner QF 4', '16:00', nextDate),
    progressionMatch('final', 'Grand Final', 7, matchId('sf-1'), 'Winner SF 1', matchId('sf-2'), 'Winner SF 2', '18:00', nextDate),
  ];

  const schedule = {
    version: 1,
    generatedAt: new Date().toISOString(),
    structure: { matches },
    matches,
    calendar: [
      {
        venueId: venue?.venueId || null,
        screens: [
          {
            screenId: screen?.screenId || null,
            days: [
              { date, timeslots: matches.slice(0, 4).map((match: any) => ({ time: match.startTime, game: match })) },
              { date: nextDate, timeslots: matches.slice(4).map((match: any) => ({ time: match.startTime, game: match })) },
            ],
          },
        ],
      },
    ],
  };

  await prisma.tournament.update({
    where: { tournamentId: tournament.tournamentId },
    data: {
      schedule: schedule as unknown as Prisma.InputJsonValue,
      status: 'UPCOMING',
      registrationOpen: true,
    },
  });

  console.log(`Seeded schedule demo for ${tournament.name}`);
  console.log(`Tournament ID: ${tournament.tournamentId}`);
  console.log(`Confirmed demo players: ${players.length}`);
  console.log(`Canonical matches: ${matches.length}`);
};

main()
  .catch((error) => {
    console.error('Could not seed schedule demo.', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
