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
    `Local self-scheduling seed refused non-local database host: ${databaseHost}`,
  );
}

const pool = new pg.Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const TOURNAMENT_ID = 'b1000000-0000-4000-8000-000000000001';
const TOURNAMENT_NAME = 'LOCAL TEST | Player Self-Scheduling | FC 26';
const VENUE_ID = 'b1000000-0000-4000-8000-000000000011';
const SCREEN_IDS = [
  'b1000000-0000-4000-8000-000000000012',
  'b1000000-0000-4000-8000-000000000013',
] as const;
const SEED_PLAYER = {
  email: 'selfschedule.player4@tape.test',
  password: 'LocalTest#2026!',
  playerId: 'b2000000-0000-4000-8000-000000000004',
  showPlayerId: 'LOCAL-SELF-SCHEDULE-004',
  firstName: 'Local Test',
  lastName: 'Player Four',
  baseGamerTag: 'SELF_SCHED_04',
  phoneNumber: '+8801800000404',
};

const localDate = (date: Date) => date.toISOString().slice(0, 10);

const main = async () => {
  const existingTournament = await prisma.tournament.findUnique({
    where: { tournamentId: TOURNAMENT_ID },
    select: { tournamentId: true, name: true },
  });
  if (existingTournament) {
    console.log(
      `Already seeded; leaving existing test data untouched: ${existingTournament.name} (${existingTournament.tournamentId})`,
    );
    return;
  }

  const nameCollision = await prisma.tournament.findFirst({
    where: { name: TOURNAMENT_NAME, isDeleted: false },
    select: { tournamentId: true },
  });
  if (nameCollision) {
    throw new Error(
      `A tournament named "${TOURNAMENT_NAME}" already exists with another ID. No data was changed.`,
    );
  }

  const existingPlayers = await prisma.player.findMany({
    where: {
      email: {
        in: [
          'player1@gmail.com',
          'local.player@tape.test',
          'playeradder@gmail.com',
        ],
      },
      isDeleted: false,
      status: PlayerStatus.ACTIVE,
    },
    select: {
      playerId: true,
      email: true,
      firstName: true,
      lastName: true,
      gamerTag: true,
    },
  });
  const playerByEmail = new Map(existingPlayers.map((player) => [player.email, player]));
  const requiredEmails = [
    'player1@gmail.com',
    'local.player@tape.test',
    'playeradder@gmail.com',
  ];
  const missingEmails = requiredEmails.filter((email) => !playerByEmail.has(email));
  if (missingEmails.length) {
    throw new Error(
      `Required existing local player account(s) were not found: ${missingEmails.join(', ')}. Run the normal local-test seed first.`,
    );
  }

  const guestEmail = await prisma.player.findUnique({
    where: { email: SEED_PLAYER.email },
    select: { playerId: true, status: true, isDeleted: true },
  });
  if (guestEmail && (guestEmail.playerId !== SEED_PLAYER.playerId || guestEmail.isDeleted)) {
    throw new Error(
      `The reserved seed email ${SEED_PLAYER.email} is already attached to another or deleted player. No data was changed.`,
    );
  }
  const guestId = await prisma.player.findUnique({
    where: { playerId: SEED_PLAYER.playerId },
    select: { email: true },
  });
  if (guestId && guestId.email !== SEED_PLAYER.email) {
    throw new Error('The reserved local test player ID is already in use.');
  }

  const existingTag = await prisma.player.findFirst({
    where: { gamerTag: { equals: SEED_PLAYER.baseGamerTag, mode: 'insensitive' } },
    select: { playerId: true },
  });
  if (existingTag && existingTag.playerId !== SEED_PLAYER.playerId) {
    throw new Error(
      `The gamer tag ${SEED_PLAYER.baseGamerTag} is already in use. No data was changed.`,
    );
  }

  const guestPasswordHash = await bcrypt.hash(SEED_PLAYER.password, 10);
  const now = new Date();
  const startDate = new Date(now);
  startDate.setUTCDate(startDate.getUTCDate() + 3);
  startDate.setUTCHours(10, 0, 0, 0);
  const deadline = new Date(startDate);
  deadline.setUTCDate(deadline.getUTCDate() - 1);
  const openedAt = now.toISOString();
  const eventDates = [0, 1, 2].map((offset) => {
    const date = new Date(startDate);
    date.setUTCDate(date.getUTCDate() + offset);
    return localDate(date);
  });
  const frequencyArray = [...new Set(eventDates.map((date) =>
    new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(
      new Date(`${date}T00:00:00.000Z`),
    ),
  ))];
  const timeslots: string[] = [];
  for (let minutes = 10 * 60; minutes + 30 <= 18 * 60; minutes += 45) {
    timeslots.push(
      `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
    );
  }

  const selectedPlayers = [
    playerByEmail.get('player1@gmail.com')!,
    playerByEmail.get('local.player@tape.test')!,
    playerByEmail.get('playeradder@gmail.com')!,
  ];

  await prisma.$transaction(async (tx) => {
    const guest = guestEmail
      ? await tx.player.findUniqueOrThrow({ where: { playerId: SEED_PLAYER.playerId } })
      : await tx.player.create({
          data: {
            playerId: SEED_PLAYER.playerId,
            showPlayerId: SEED_PLAYER.showPlayerId,
            email: SEED_PLAYER.email,
            password: guestPasswordHash,
            firstName: SEED_PLAYER.firstName,
            lastName: SEED_PLAYER.lastName,
            gamerTag: SEED_PLAYER.baseGamerTag,
            username: 'selfschedule_player4',
            phoneNumber: SEED_PLAYER.phoneNumber,
            status: PlayerStatus.ACTIVE,
          },
        });

    const players = [
      ...selectedPlayers,
      {
        playerId: guest.playerId,
        email: guest.email,
        firstName: guest.firstName,
        lastName: guest.lastName,
        gamerTag: guest.gamerTag,
      },
    ];
    const playerName = (player: (typeof players)[number]) =>
      player.gamerTag || `${player.firstName} ${player.lastName}`.trim();
    const matchOneId = `${TOURNAMENT_ID}:match:1`;
    const matchTwoId = `${TOURNAMENT_ID}:match:2`;
    const finalMatchId = `${TOURNAMENT_ID}:match:3`;
    const matches = [
      {
        id: matchOneId,
        tournamentId: TOURNAMENT_ID,
        round: 'Semifinal',
        bracketSection: 'WINNERS',
        matchNumber: 1,
        participant1Ref: { type: 'TOURNAMENT_SLOT', value: '1' },
        participant2Ref: { type: 'TOURNAMENT_SLOT', value: '2' },
        player1Id: players[0].playerId,
        player1Name: playerName(players[0]),
        player2Id: players[1].playerId,
        player2Name: playerName(players[1]),
        score1: null,
        score2: null,
        status: 'SCHEDULED',
        isSchedulable: true,
        isAutoAdvance: false,
        conditional: false,
        selfSchedulingOpenedAt: openedAt,
        schedulingPhase: 'SELF_SCHEDULING_OPEN',
      },
      {
        id: matchTwoId,
        tournamentId: TOURNAMENT_ID,
        round: 'Semifinal',
        bracketSection: 'WINNERS',
        matchNumber: 2,
        participant1Ref: { type: 'TOURNAMENT_SLOT', value: '3' },
        participant2Ref: { type: 'TOURNAMENT_SLOT', value: '4' },
        player1Id: players[2].playerId,
        player1Name: playerName(players[2]),
        player2Id: players[3].playerId,
        player2Name: playerName(players[3]),
        score1: null,
        score2: null,
        status: 'SCHEDULED',
        isSchedulable: true,
        isAutoAdvance: false,
        conditional: false,
        selfSchedulingOpenedAt: openedAt,
        schedulingPhase: 'SELF_SCHEDULING_OPEN',
      },
      {
        id: finalMatchId,
        tournamentId: TOURNAMENT_ID,
        round: 'Final',
        bracketSection: 'FINAL',
        matchNumber: 3,
        participant1Ref: { type: 'MATCH_WINNER', value: matchOneId },
        participant2Ref: { type: 'MATCH_WINNER', value: matchTwoId },
        score1: null,
        score2: null,
        status: 'SCHEDULED',
        isSchedulable: false,
        isAutoAdvance: false,
        conditional: true,
        conditionType: 'WINNERS_OF',
      },
    ];

    const calendar = [
      {
        venueId: VENUE_ID,
        venueName: 'Tape Local Esports Arena',
        screens: SCREEN_IDS.map((screenId, index) => ({
          screenId,
          screenName: index === 0 ? 'FC Console 01' : 'FC Console 02',
          days: eventDates.map((date) => ({
            date,
            schedulingPolicy: { isWindowOpen: true, windowOpenTime: '', windowCloseTime: '' },
            timeslots: timeslots.map((time) => ({
              time,
              game: null,
              canonicalMatchId: null,
            })),
          })),
        })),
      },
    ];

    const schedule = {
      capacity: {
        matchTimeMinutes: 30,
        operatingMinutes: 480,
        slotsPerScreenPerDay: timeslots.length,
        totalScreens: SCREEN_IDS.length,
        totalDailySlots: timeslots.length * SCREEN_IDS.length,
        totalMatches: matches.length,
        totalPlayingDaysNeeded: 1,
        eventDates,
      },
      structure: {
        slots: players.map((player, index) => ({
          id: `${TOURNAMENT_ID}:slot:${index + 1}`,
          tournamentId: TOURNAMENT_ID,
          slotNumber: index + 1,
          status: 'ASSIGNED',
          participantId: player.playerId,
          participantName: playerName(player),
        })),
        seeds: players.map((player, index) => ({
          seedNumber: index + 1,
          participantId: player.playerId,
          slotNumber: index + 1,
          source: 'REGISTRATION_ORDER',
        })),
        groups: [],
        matches,
        summary: {
          structuralNodes: 7,
          groupStageMatches: 0,
          knockoutMatches: 3,
          winnersBracketMatches: 2,
          losersBracketMatches: 0,
          finalMatches: 1,
          schedulableMatches: 2,
          conditionalMatches: 1,
          autoAdvanceCount: 0,
          totalCompetitionMatches: 3,
          guaranteedMatchCount: 2,
          conditionalMatchCount: 1,
          maximumPossibleMatchCount: 3,
        },
      },
      calendar,
      version: 1,
      generatedAt: now.toISOString(),
    } satisfies Prisma.InputJsonValue;

    await tx.tournament.create({
      data: {
        tournamentId: TOURNAMENT_ID,
        name: TOURNAMENT_NAME,
        gameTitle: 'EA SPORTS FC 26',
        gameType: TournamentGameType.FOOTBALL,
        tournamentFormat: TournamentFormat.SINGLE_ELIMINATION,
        numberOfTeams: 4,
        entryFee: 0,
        currency: Currency.NGN,
        paymentWindow: 24,
        prizeRule: PrizeRule.FIXED_AMOUNT,
        percentage: 100,
        houseRake: 0,
        couponCreation: false,
        registrationCutOffMode: 'CAPACITY',
        startDate,
        deadline,
        capacity: 4,
        dailyStart: '10:00',
        dailyEnd: '18:00',
        matchDuration: 30,
        turnoverDuration: 15,
        buffer: 10,
        frequencyStatus: FrequencyStatus.DAILY,
        frequencyArray,
        rules: [
          'Local test fixture: a match is booked once by either participant.',
          'Arrive 15 minutes before the confirmed match time.',
        ],
        tsAndTc: ['No real entry fee or prize payout is attached to this local test.'],
        schedulingMode: SchedulingMode.PLAYER_SELF,
        status: TournamentStatus.UPCOMING,
        registrationOpen: false,
        schedulingPaused: false,
        schedule,
        venues: {
          create: {
            venueId: VENUE_ID,
            name: 'Tape Local Esports Arena',
            address: 'Local development venue',
            screens: {
              create: SCREEN_IDS.map((screenId, index) => ({
                screenId,
                screenName: index === 0 ? 'FC Console 01' : 'FC Console 02',
              })),
            },
          },
        },
      },
    });

    await tx.tournamentRegistration.createMany({
      data: players.map((player, index) => ({
        tournamentId: TOURNAMENT_ID,
        playerId: player.playerId,
        homeVenueId: VENUE_ID,
        status: TournamentRegistrationStatus.CONFIRMED,
        paymentStatus: 'PAID',
        assignedSlot: index + 1,
        qrCodeString: `LOCAL-SELF-SCHEDULE:${TOURNAMENT_ID}:${player.playerId}`,
      })),
    });

    console.log(`Created ${TOURNAMENT_NAME} (${TOURNAMENT_ID})`);
    console.log(`Registered players: ${players.map((player) => player.email).join(', ')}`);
    console.log(`Opening time: ${openedAt}; event dates: ${eventDates.join(', ')}`);
    console.log(`Venue/screens: Tape Local Esports Arena (${SCREEN_IDS.length} screens)`);
    console.log('Bookable matches: two semifinals. The final stays conditional until both results are recorded.');
    console.log(`New test login: ${SEED_PLAYER.email} / ${SEED_PLAYER.password}`);
  });
};

main()
  .catch((error) => {
    console.error('Could not seed local Player Self-Scheduling data.', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
