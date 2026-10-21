import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import { map, type Observable } from 'rxjs';

/**
 * Chuyển BigInt (tiền tệ) và Decimal (số lượng) từ Prisma sang number trong JSON trả về.
 * VND nguyên dưới 9×10^15 nên number an toàn.
 */
const SECRET_KEYS = new Set(['pinHash', 'passwordHash', 'tokenHash', 'codeHash']);

export function serializeDbValues<T>(value: T): T {
  return convert(value) as T;
}

function convert(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(convert);
  if (typeof value === 'object') {
    // Prisma.Decimal (decimal.js): tên lớp có thể bị đổi khi đóng gói ("Decimal2"),
    // nên nhận diện theo hình dạng: có toNumber() và các trường s, e, d.
    const maybeDecimal = value as { toNumber?: () => number; s?: unknown; e?: unknown; d?: unknown };
    if (typeof maybeDecimal.toNumber === 'function' && 's' in maybeDecimal && 'e' in maybeDecimal && 'd' in maybeDecimal) {
      return maybeDecimal.toNumber();
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // Lớp chặn cuối: không bao giờ trả mã băm bí mật ra ngoài, kể cả khi một truy vấn quên `select`.
      if (SECRET_KEYS.has(k)) continue;
      out[k] = convert(v);
    }
    return out;
  }
  return value;
}

@Injectable()
export class BigIntInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => serializeDbValues(data)));
  }
}
