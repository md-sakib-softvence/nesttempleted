import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

/** Idempotent overview/prize data for the seeded Valorant tournament. */
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

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
  });

  if (!tournament) {
    throw new Error('Valorant tournament was not found. Run the normal Prisma seed first.');
  }

  const payouts = [
    { id: 'overview-demo-prize-1', category: '1st Place', amount: 192 },
    { id: 'overview-demo-prize-2', category: '2nd Place', amount: 80 },
    { id: 'overview-demo-prize-3', category: '3rd Place', amount: 48 },
  ];

  for (const payout of payouts) {
    await prisma.manageEventPrize.upsert({
      where: { manageEventPrizeId: payout.id },
      update: {
        tournamentId: tournament.tournamentId,
        prizeCategory: payout.category,
        amount: payout.amount,
      },
      create: {
        manageEventPrizeId: payout.id,
        tournamentId: tournament.tournamentId,
        prizeCategory: payout.category,
        amount: payout.amount,
      },
    });
  }

  console.log(`Seeded overview prize payouts for ${tournament.name}`);
  console.log(`Tournament ID: ${tournament.tournamentId}`);
  console.log(`Payout rows: ${payouts.length}`);
};

main()
  .catch((error) => {
    console.error('Could not seed overview demo.', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
