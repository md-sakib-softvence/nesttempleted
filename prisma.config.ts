import 'dotenv/config';
import { defineConfig } from '@prisma/config';

export default defineConfig({
  schema: './prisma/schema',
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    // @ts-ignore - Prisma 7 CLI requires this, but the type definition may be lagging
    seed: 'ts-node prisma/seeds/index.ts',
  },
});
