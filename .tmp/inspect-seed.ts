import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
async function main() {
  const [tournaments, players] = await Promise.all([
    prisma.tournament.findMany({ where: { isDeleted: false }, select: { name: true, status: true } }),
    prisma.player.findMany({ where: { isDeleted: false }, select: { email: true, gamerTag: true } }),
  ]);
  console.log(JSON.stringify({ tournaments, players }, null, 2));
}
main().finally(async () => { await prisma.$disconnect(); await pool.end(); });
