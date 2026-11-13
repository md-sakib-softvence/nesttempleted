import * as dotenv from 'dotenv';
dotenv.config({ path: './.env', quiet: true });
import { PrismaClient, AdminRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as bcrypt from 'bcrypt';

/** Bootstrap a configured administrator; never insert sample application data. */
async function main() {
  const email = process.env.SUPER_ADMIN_EMAIL?.trim();
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!email && !password) {
    console.log(
      'Admin bootstrap skipped: configure SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD to create an administrator.',
    );
    return;
  }
  if (!email || !password) {
    throw new Error(
      'Admin bootstrap requires both SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD.',
    );
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const existing = await prisma.admin.findFirst({
      where: { role: AdminRole.SUPER_ADMIN },
    });
    if (existing) {
      console.log('Administrator already exists; bootstrap made no changes.');
      return;
    }
    await prisma.admin.create({
      data: {
        email,
        password: await bcrypt.hash(password, 10),
        name: process.env.SUPER_ADMIN_NAME?.trim() || 'Super Admin',
        role: AdminRole.SUPER_ADMIN,
      },
    });
    console.log('Configured administrator created.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(() => {
  console.error(
    'Admin bootstrap failed. Check configuration and database availability.',
  );
  process.exitCode = 1;
});
