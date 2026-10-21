import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Nạp .env ở gốc monorepo (dev) trước khi import bất kỳ module nào đọc process.env
for (const candidate of ['../../../.env', '../../.env', '../.env']) {
  const path = fileURLToPath(new URL(candidate, import.meta.url));
  if (existsSync(path)) {
    loadEnv({ path, override: false });
    break;
  }
}

const { bootstrap } = await import('./bootstrap.js');
await bootstrap();
