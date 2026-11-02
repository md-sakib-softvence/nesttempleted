import * as dotenv from 'dotenv';
dotenv.config({ path: './.env' });

import { PrismaClient, EmployeeRole, EmployeeState } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as bcrypt from 'bcrypt';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const email = process.env.SECURITY_GUARD_EMAIL || 'security@tape.com';
  const password = process.env.SECURITY_GUARD_PASSWORD || 'GuardScan#2026!';
  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await prisma.employee.findUnique({ where: { email } });

  const employee = await prisma.employee.upsert({
    where: { email },
    update: {
      name: 'Initial Security Guard',
      role: EmployeeRole.SECURITY,
      state: EmployeeState.ACTIVE,
      phoneNumber: '+8801700000001',
      password: passwordHash,
      isDeleted: false,
    },
    create: {
      showEmployeeId: `GUARD-${Date.now()}`,
      name: 'Initial Security Guard',
      role: EmployeeRole.SECURITY,
      state: EmployeeState.ACTIVE,
      email,
      phoneNumber: '+8801700000001',
      password: passwordHash,
    },
  });

  console.log(
    `${existing ? 'Updated' : 'Created'} active security guard: ${employee.email} (${employee.showEmployeeId})`,
  );
}

main()
  .catch((error) => {
    console.error('Security guard seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
