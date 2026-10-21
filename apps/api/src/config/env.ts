import { z } from 'zod';

/**
 * URL công khai. Chấp nhận cả tên máy chủ không có scheme (ví dụ Render Blueprint chỉ cung cấp
 * `dalan-api.onrender.com`) và tự thêm `https://`.
 */
const publicUrl = (fallback: string) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() && !/^https?:\/\//i.test(v.trim()) ? `https://${v.trim()}` : v),
    z.string().url().default(fallback),
  );

/** Biến môi trường của API, kiểm tra bằng Zod khi khởi động (NestJS 12 hỗ trợ Standard Schema). */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Render và nhiều nền tảng đặt PORT; API_PORT được ưu tiên nếu có
  API_PORT: z.coerce.number().int().min(1).max(65535).default(Number(process.env.PORT ?? 4000)),
  // Render tự đặt RENDER_EXTERNAL_URL cho mỗi dịch vụ web
  API_PUBLIC_URL: publicUrl(process.env.RENDER_EXTERNAL_URL ?? 'http://localhost:4000'),
  STAFF_APP_URL: publicUrl('http://localhost:3000'),
  GUEST_APP_URL: publicUrl('http://localhost:3001'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://127.0.0.1:6379'),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  GUEST_TOKEN_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().default(15 * 60),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().default(30 * 24 * 3600),
  GUEST_TOKEN_TTL_SECONDS: z.coerce.number().int().default(6 * 3600),
  STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./storage'),
  PAYMENT_PROVIDERS: z.string().default('vietqr,mock'),
  EINVOICE_PROVIDER: z.enum(['mock', 'misa', 'viettel', 'vnpt']).default('mock'),
  MESSAGING_PROVIDER: z.enum(['mock', 'zalo']).default('mock'),
  /** Secret key của Zalo App (developers.zalo.me) — dùng đổi phoneToken của Mini App lấy số điện thoại */
  ZALO_APP_SECRET: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  CORS_ORIGINS: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Cấu hình môi trường không hợp lệ: ${issues}`);
  }
  return result.data;
}

export const ENV = Symbol('ENV');
