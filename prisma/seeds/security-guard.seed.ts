import * as dotenv from 'dotenv';
dotenv.config({ path: './.env', quiet: true });
import { PrismaClient, EmployeeRole, EmployeeState } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as bcrypt from 'bcrypt';

/** Explicit account setup only. No fabricated login, name, phone or password. */
async function main() {
  const email = process.env.SECURITY_GUARD_EMAIL?.trim();
  const password = process.env.SECURITY_GUARD_PASSWORD;
  const name = process.env.SECURITY_GUARD_NAME?.trim();
  const phoneNumber = process.env.SECURITY_GUARD_PHONE?.trim();
  if (!email || !password || !name || !phoneNumber) {
    throw new Error(
      'Configure SECURITY_GUARD_EMAIL, SECURITY_GUARD_PASSWORD, SECURITY_GUARD_NAME and SECURITY_GUARD_PHONE.',
    );
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const existing = await prisma.employee.findUnique({ where: { email } });
    if (existing) {
      console.log('Account already exists; bootstrap made no changes.');
      return;
    }
    await prisma.employee.create({
      data: {
        showEmployeeId: `GUARD-${Date.now()}`,
        name,
        role: EmployeeRole.SECURITY,
        state: EmployeeState.ACTIVE,
        email,
        phoneNumber,
        password: await bcrypt.hash(password, 10),
      },
    });
    console.log('Configured security guard account created.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(() => {
  console.error(
    'Security account bootstrap failed. Check required environment values and database availability.',
  );
  process.exitCode = 1;
});
