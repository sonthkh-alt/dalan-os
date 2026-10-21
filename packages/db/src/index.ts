import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

export * from '../generated/prisma/client.js';
export * as Enums from '../generated/prisma/enums.js';

export interface CreatePrismaOptions {
  connectionString?: string;
  /** Số kết nối tối đa trong pool (mặc định 10). */
  max?: number;
  /** Ghi log truy vấn (dev). */
  logQueries?: boolean;
}

/**
 * Tạo PrismaClient dùng driver adapter `pg` (bắt buộc từ Prisma 7).
 * Dùng chung cho API, worker, seed và kiểm thử.
 */
export function createPrismaClient(options: CreatePrismaOptions = {}): PrismaClient {
  const connectionString = options.connectionString ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Thiếu DATABASE_URL: không thể khởi tạo PrismaClient');
  }
  const adapter = new PrismaPg({
    connectionString,
    max: options.max ?? 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  return new PrismaClient({
    adapter,
    log: options.logQueries ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });
}

export type { PrismaClient as DbClient };

export { hashSecret, verifySecret } from './security.js';
