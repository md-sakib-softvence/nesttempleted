import 'dotenv/config';
import { PrismaClient, Currency, FrequencyStatus, PrizeRule, RegistrationCutOffMode, SchedulingMode, TournamentFormat, TournamentGameType, TournamentStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const futureDate = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

const demoTournaments = [
  {
    tournamentId: 'e1111111-1111-4111-8111-111111111111',
    name: 'DEMO | Football | FC 26 Registration',
    gameTitle: 'EA SPORTS FC 26',
    gameType: TournamentGameType.FOOTBALL,
    tournamentFormat: TournamentFormat.SINGLE_ELIMINATION,
    numberOfTeams: 16,
    capacity: 16,
    venueName: 'Football Demo Arena',
    venueAddress: 'Demo Hall 1, Tape Esports Center',
  },
  {
    tournamentId: 'e2222222-2222-4222-8222-222222222222',
    name: 'DEMO | Football | eFootball 2026 Registration',
    gameTitle: 'eFootball 2026',
    gameType: TournamentGameType.FOOTBALL,
    tournamentFormat: TournamentFormat.LEAGUE,
    numberOfTeams: 12,
    capacity: 12,
    venueName: 'eFootball Demo Arena',
    venueAddress: 'Demo Hall 2, Tape Esports Center',
  },
  {
    tournamentId: 'e3333333-3333-4333-8333-333333333333',
    name: 'DEMO | Other | Tekken 8 Registration',
    gameTitle: 'Tekken 8',
    gameType: TournamentGameType.OTHER,
    tournamentFormat: TournamentFormat.DOUBLE_ELIMINATION,
    numberOfTeams: 16,
    capacity: 16,
    venueName: 'Fighting Games Demo Arena',
    venueAddress: 'Demo Hall 3, Tape Esports Center',
  },
  {
    tournamentId: 'e4444444-4444-4444-8444-444444444444',
    name: 'DEMO | Other | Valorant Registration',
    gameTitle: 'Valorant',
    gameType: TournamentGameType.OTHER,
    tournamentFormat: TournamentFormat.SINGLE_ELIMINATION,
    numberOfTeams: 8,
    capacity: 8,
    venueName: 'Tactical Games Demo Arena',
    venueAddress: 'Demo Hall 4, Tape Esports Center',
  },
].map((demo) => ({
  ...demo,
  entryFee: 0,
  currency: Currency.NGN,
  paymentWindow: 24,
  prizeRule: PrizeRule.PERCENTAGE,
  percentage: 100,
  houseRake: 0,
  couponCreation: false,
  registrationCutOffMode: RegistrationCutOffMode.CAPACITY,
  startDate: futureDate(14),
  deadline: futureDate(7),
  dailyStart: '10:00',
  dailyEnd: '18:00',
  matchDuration: 30,
  turnoverDuration: 10,
  lunchBreakTime: '13:00',
  lunchDuration: 45,
  buffer: 0,
  frequencyStatus: FrequencyStatus.WEEKLY,
  frequencyArray: ['Saturday', 'Sunday'],
  schedulingMode: SchedulingMode.MANUAL,
  status: TournamentStatus.REGISTRATION_OPEN,
  registrationOpen: true,
  requireJerseySize: false,
  rules: ['Demo tournament for previewing Football vs Other registration.'],
  tsAndTc: ['This is a free demo tournament.'],
}));

async function main() {
  for (const { venueName, venueAddress, ...demo } of demoTournaments) {
    const existing = await prisma.tournament.findUnique({
      where: { tournamentId: demo.tournamentId },
      select: { tournamentId: true, venues: { select: { venueId: true }, take: 1 } },
    });

    if (existing) {
      await prisma.tournament.update({
        where: { tournamentId: demo.tournamentId },
        data: {
          ...demo,
          ...(existing.venues.length === 0
            ? { venues: { create: { name: venueName, address: venueAddress } } }
            : {}),
        },
      });
    } else {
      await prisma.tournament.create({
        data: {
          ...demo,
          venues: { create: { name: venueName, address: venueAddress } },
        },
      });
    }

    console.log(`Seeded ${demo.gameType}: ${demo.name}`);
  }
}

main()
  .catch((error) => {
    console.error('Could not seed registration demo tournaments.', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
