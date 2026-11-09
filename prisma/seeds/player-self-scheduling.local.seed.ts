import 'dotenv/config';
import {
  Currency,
  FrequencyStatus,
  PlayerStatus,
  PrismaClient,
  PrizeRule,
  RegistrationCutOffMode,
  SchedulingMode,
  TournamentFormat,
  TournamentGameType,
  TournamentRegistrationStatus,
  TournamentStatus,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import pg from 'pg';
import { CreateTournamentDto } from '../../src/modules/tournament/dto/tournament/create-tournament.dto';
import { TournamentCoreService } from '../../src/modules/tournament/service/tournament-core.service';
import { TournamentScheduleService } from '../../src/modules/tournament/service/tournament-schedule.service';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is not configured.');

const databaseHost = new URL(databaseUrl).hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(databaseHost)) {
  throw new Error(
    `Local Player Schedule seed refused non-local database host: ${databaseHost}`,
  );
}

const pool = new pg.Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const TOURNAMENT_NAME = 'LOCAL TEST | PLAYER SCHEDULE | FC 26';
const LEGACY_FIXTURE_ID = 'b1000000-0000-4000-8000-000000000101';
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
  const existingByName = await prisma.tournament.findFirst({
    where: { name: TOURNAMENT_NAME, isDeleted: false },
    select: { tournamentId: true, name: true },
  });
  if (existingByName && existingByName.tournamentId !== LEGACY_FIXTURE_ID) {
    console.log(
      `Already seeded through the Admin tournament creation flow; leaving it and any test bookings untouched: ${existingByName.name} (${existingByName.tournamentId})`,
    );
    return;
  }

  const legacyIdRecord = await prisma.tournament.findUnique({
    where: { tournamentId: LEGACY_FIXTURE_ID },
    select: { tournamentId: true, name: true },
  });
  if (legacyIdRecord && legacyIdRecord.name !== TOURNAMENT_NAME) {
    throw new Error(
      `Reserved legacy fixture ID is owned by another tournament (${legacyIdRecord.name}); no data was changed.`,
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
  const playerByEmail = new Map(
    existingPlayers.map((player) => [player.email, player]),
  );
  const requiredEmails = [
    'player1@gmail.com',
    'local.player@tape.test',
    'playeradder@gmail.com',
  ];
  const missingEmails = requiredEmails.filter(
    (email) => !playerByEmail.has(email),
  );
  if (missingEmails.length) {
    throw new Error(
      `Required active local player account(s) were not found: ${missingEmails.join(', ')}. Run the normal local-test seed first.`,
    );
  }

  const guestEmail = await prisma.player.findUnique({
    where: { email: SEED_PLAYER.email },
    select: { playerId: true, status: true, isDeleted: true },
  });
  if (
    guestEmail &&
    (guestEmail.playerId !== SEED_PLAYER.playerId ||
      guestEmail.isDeleted ||
      guestEmail.status !== PlayerStatus.ACTIVE)
  ) {
    throw new Error(
      `Reserved test login ${SEED_PLAYER.email} is attached to another, inactive, or deleted player. No data was changed.`,
    );
  }
  const guestId = await prisma.player.findUnique({
    where: { playerId: SEED_PLAYER.playerId },
    select: { email: true },
  });
  if (guestId && guestId.email !== SEED_PLAYER.email) {
    throw new Error('Reserved local test player ID is already in use.');
  }

  const existingTag = await prisma.player.findFirst({
    where: {
      gamerTag: { equals: SEED_PLAYER.baseGamerTag, mode: 'insensitive' },
    },
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
  const eventDates = [0, 1, 2].map((offset) => {
    const date = new Date(startDate);
    date.setUTCDate(date.getUTCDate() + offset);
    return localDate(date);
  });
  const frequencyArray = [
    ...new Set(
      eventDates.map((date) =>
        new Intl.DateTimeFormat('en-US', {
          weekday: 'long',
          timeZone: 'UTC',
        }).format(new Date(`${date}T00:00:00.000Z`)),
      ),
    ),
  ];

  const selectedPlayers = [
    playerByEmail.get('player1@gmail.com')!,
    playerByEmail.get('local.player@tape.test')!,
    playerByEmail.get('playeradder@gmail.com')!,
  ];

  const adminWizardPayload: CreateTournamentDto = {
    name: TOURNAMENT_NAME,
    gameTitle: 'EA SPORTS FC 26',
    gameType: TournamentGameType.FOOTBALL,
    format: 'Single Elimination',
    tournamentFormat: TournamentFormat.SINGLE_ELIMINATION,
    teams: 4,
    numberOfTeams: 4,
    capacity: 4,
    entryFee: 0,
    currency: Currency.NGN,
    paymentWindow: 24,
    prizeRule: PrizeRule.FIXED_AMOUNT,
    percentage: 100,
    houseRake: 0,
    couponCreation: false,
    registrationCutOffMode: RegistrationCutOffMode.CAPACITY,
    startDate: localDate(startDate),
    deadline: localDate(deadline),
    dailyStart: '10:00',
    dailyEnd: '18:00',
    matchDuration: 30,
    turnoverDuration: 15,
    lunchBreakTime: '13:00',
    lunchDuration: 60,
    buffer: 10,
    frequencyStatus: FrequencyStatus.DAILY,
    frequencyArray,
    rules: [
      'A match fixture is created after the competitors are confirmed.',
      'Either competitor may select one open venue, screen, date, and time during the first 24 hours.',
      'If neither competitor books within 24 hours, the system assigns the earliest valid open slot.',
    ],
    tsAndTc: [
      'Local test tournament. No entry fee, payment, or prize credit is attached.',
    ],
    manageEventCosts: [],
    manageEventPrizes: [],
    sponsors: [],
    venues: [
      {
        name: 'Tape Local Esports Arena',
        address: 'Local development venue',
        screens: [{ screenName: 'FC Console 01' }, { screenName: 'FC Console 02' }],
      },
    ],
    schedulingMode: SchedulingMode.PLAYER_SELF,
    schedulingWindowOpen: true,
    status: TournamentStatus.UPCOMING,
    registrationOpen: false,
    playerIds: [
      ...selectedPlayers.map((player) => player.playerId),
      SEED_PLAYER.playerId,
    ],
    thirdPlacePlayoffEnabled: true,
    isDraft: false,
  };

  const created = await prisma.$transaction(async (tx) => {
    if (legacyIdRecord) {
      // Replace only the prior local test fixture created by this seed; related
      // registrations and venue/screens cascade with its tournament record.
      await tx.tournament.delete({
        where: { tournamentId: LEGACY_FIXTURE_ID },
      });
    }

    if (!guestEmail) {
      await tx.player.create({
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
    }

    const core = new TournamentCoreService(
      tx as any,
      new TournamentScheduleService(),
    );
    const tournament = await core.createTournament(adminWizardPayload);
    const rawTournament = await tx.tournament.findUniqueOrThrow({
      where: { tournamentId: tournament.tournamentId },
      include: { venues: { include: { screens: true } } },
    });
    const venueId = rawTournament.venues[0]?.venueId;
    if (!venueId) throw new Error('Admin creation flow returned no venue.');

    const players = [
      ...selectedPlayers,
      {
        playerId: SEED_PLAYER.playerId,
        email: SEED_PLAYER.email,
      },
    ];
    await tx.tournamentRegistration.createMany({
      data: players.map((player, index) => ({
        tournamentId: tournament.tournamentId,
        playerId: player.playerId,
        homeVenueId: venueId,
        status: TournamentRegistrationStatus.CONFIRMED,
        paymentStatus: 'PAID',
        assignedSlot: index + 1,
      })),
    });

    return {
      tournamentId: tournament.tournamentId,
      venueId,
      venueName: rawTournament.venues[0].name,
      screenCount: rawTournament.venues[0].screens.length,
      matches: (rawTournament.schedule as any)?.structure?.matches || [],
      playerEmails: players.map((player) => player.email),
    };
  });

  console.log(`Created through the Admin tournament creation service: ${TOURNAMENT_NAME}`);
  console.log(`Tournament ID: ${created.tournamentId}`);
  console.log(`Mode: PLAYER_SELF; format: SINGLE_ELIMINATION; status: UPCOMING`);
  console.log(`Confirmed local registrations: ${created.playerEmails.join(', ')}`);
  console.log(
    `Generated fixtures: ${created.matches.length} (${created.matches.map((match: any) => match.round).join(', ')})`,
  );
  console.log(
    `Venue/screens: ${created.venueName} (${created.screenCount} screens); event dates: ${eventDates.join(', ')}`,
  );
  console.log(
    'The admin service generated the bracket and schedule grid; resolved fixtures open a 24-hour player booking window, then the worker auto-assigns an available slot.',
  );
  console.log('No entry fee or payment was created.');
  console.log(`Test account: ${SEED_PLAYER.email} / ${SEED_PLAYER.password}`);
};

main()
  .catch((error) => {
    console.error('Could not seed local Player Schedule data.', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
