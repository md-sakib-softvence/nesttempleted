import { PrismaClient } from '@prisma/client';
import * as jwt from 'jsonwebtoken';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

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

  const accessToken = jwt.sign(payload, secret, { expiresIn: '10s' });
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
