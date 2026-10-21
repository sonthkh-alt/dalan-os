import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

// Ưu tiên .env của cầu in (apps/print-bridge/.env), sau đó .env ở thư mục chạy.
const appRoot = fileURLToPath(new URL('..', import.meta.url));
for (const candidate of [resolve(appRoot, '.env'), resolve(process.cwd(), '.env')]) {
  if (existsSync(candidate)) loadEnv({ path: candidate, override: false });
}

export const configSchema = z.object({
  /** Địa chỉ API DaLan OS, ví dụ https://api.dalan.com.vn */
  API_URL: z.string().url().default('http://localhost:4000'),
  /** Token thiết bị loại PRINT_BRIDGE do quản lý đăng ký (POST /api/v1/auth/devices) */
  DEVICE_TOKEN: z.string().min(10).optional(),
  POLL_INTERVAL_MS: z.coerce.number().int().min(500).default(2000),
  /** Nếu đặt, không gửi tới máy in mà xuất PNG + ESC/POS ra thư mục này (nghiệm thu, không có máy in) */
  SIMULATOR_DIR: z.string().optional(),
  /** Cổng HTTP nội bộ cho chế độ khẩn cấp (thiết bị trong LAN gửi lệnh in thẳng) và trang trạng thái */
  LOCAL_PORT: z.coerce.number().int().min(0).max(65535).default(9100),
  /** Thư mục lưu hàng đợi, cache máy in, nhật ký */
  DATA_DIR: z.string().default(resolve(appRoot, 'data')),
  /** Font ưu tiên (phải có trong hệ thống hoặc assets/fonts) */
  FONT_FAMILY: z.string().optional(),
  PRINTER_TIMEOUT_MS: z.coerce.number().int().min(1000).default(5000),
  PRINTER_RETRIES: z.coerce.number().int().min(1).default(3),
  /** Số lần thử in tối đa trước khi báo FAILED về API */
  MAX_PRINT_ATTEMPTS: z.coerce.number().int().min(1).default(10),
  PRINTERS_REFRESH_MS: z.coerce.number().int().default(5 * 60_000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const result = configSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Cấu hình cầu in không hợp lệ: ${issues}`);
  }
  return result.data;
}

export const APP_ROOT = appRoot;
