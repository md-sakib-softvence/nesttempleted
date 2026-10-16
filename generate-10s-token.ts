import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as jwt from 'jsonwebtoken';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const admin = await prisma.admin.findUnique({
    where: { email: process.env.SUPER_ADMIN_EMAIL || 'superadmin@example.com' }
  });

  if (!admin) {
    console.log('Super admin not found!');
    return;
  }

  const payload = {
    userId: admin.adminId,
    email: admin.email,
    role: admin.role,
  };

  const secret = process.env.JWT_SECRET || 'super_secret_change_in_production';
  const refreshSecret = process.env.JWT_REFRESH_SECRET || 'super_refresh_secret_change_in_production';

  const accessToken = jwt.sign(payload, secret, { expiresIn: '7d' });
  const refreshToken = jwt.sign(payload, refreshSecret, { expiresIn: '30d' });

  console.log('\n--- 10-SECOND ACCESS TOKEN ---');
  console.log(accessToken);
  console.log('\n--- 30-DAY REFRESH TOKEN ---');
  console.log(refreshToken);
  console.log('\n');
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
