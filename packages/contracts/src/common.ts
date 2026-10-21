import { z } from 'zod';

export const idSchema = z.uuid();
export const amountSchema = z.number().int().min(0);
export const bpsSchema = z.number().int().min(0).max(10_000);
export const quantitySchema = z.number().positive().max(100_000);
export const localeSchema = z.enum(['vi', 'en']);
export const phoneSchema = z.string().min(8).max(20);
export const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
export const hhmmSchema = z.string().regex(/^\d{2}:\d{2}$/, 'HH:mm');

export const scheduleSchema = z.object({
  days: z.array(z.number().int().min(1).max(7)).optional(),
  from: hhmmSchema.optional(),
  to: hhmmSchema.optional(),
});
export type Schedule = z.infer<typeof scheduleSchema>;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

type StripDefault<T> = T extends z.ZodDefault<infer Inner> ? StripDefault<Inner> : T;
type PatchShape<S extends z.ZodRawShape> = { [K in keyof S]: z.ZodOptional<StripDefault<S[K]>> };

/**
 * Schema cho PATCH (sửa một phần) từ schema tạo mới: mọi trường thành tùy chọn và BỎ giá trị mặc định.
 *
 * Không dùng `.partial()` cho mục đích này: với Zod 4, `.partial()` vẫn áp `.default()`, nên một PATCH
 * chỉ gửi `{ price }` sẽ âm thầm ghi đè các trường có mặc định (ví dụ đặt lại `tags = []`,
 * `marketingConsent = false`, `posX = 0`). Trường không gửi phải được giữ nguyên.
 */
export function patchSchema<S extends z.ZodRawShape>(schema: z.ZodObject<S>): z.ZodObject<PatchShape<S>> {
  const shape: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(schema.shape)) {
    let inner = field as z.ZodType;
    while (inner instanceof z.ZodDefault) inner = inner.unwrap() as z.ZodType;
    shape[key] = inner.optional();
  }
  return z.object(shape) as unknown as z.ZodObject<PatchShape<S>>;
}

export const apiErrorSchema = z.object({
  statusCode: z.number(),
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
  traceId: z.string().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
