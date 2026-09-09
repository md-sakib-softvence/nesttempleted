import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient, AdminRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as bcrypt from 'bcrypt';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new PrismaPg(pool);
    super({ adapter });
  }

  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    await this.seedSuperAdmin();
  }

  private async seedSuperAdmin() {
    this.logger.log('🌱 Checking for super admin...');

    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || 'superadmin@example.com';
    const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || 'password123';
    
    try {
      const existingSuperAdmin = await this.admin.findFirst({
        where: { role: AdminRole.SUPER_ADMIN },
      });

      if (!existingSuperAdmin) {
        const hashedPassword = await bcrypt.hash(superAdminPassword, Number(process.env.BCRYPT_SALT_ROUNDS) || 10);
        const superAdmin = await this.admin.create({
          data: {
            email: superAdminEmail,
            password: hashedPassword,
            name: 'Super Admin',
            role: AdminRole.SUPER_ADMIN,
          },
        });
        this.logger.log(`✅ Created super admin: ${superAdmin.email}`);
      } else {
        this.logger.log('✅ Super admin already exists, skipping seed.');
      }
    } catch (error) {
      this.logger.error('Failed to seed super admin', error);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
