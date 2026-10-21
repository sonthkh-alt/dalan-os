import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 không tự nạp .env. Ưu tiên .env ở gốc monorepo, sau đó .env cục bộ của gói.
for (const candidate of ['../../.env', './.env']) {
  const path = fileURLToPath(new URL(candidate, import.meta.url));
  if (existsSync(path)) {
    loadEnv({ path, override: false });
  }
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
