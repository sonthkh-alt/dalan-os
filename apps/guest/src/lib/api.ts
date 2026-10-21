/** Lớp gọi API cho app khách: tự gắn token phiên khách hoặc token thành viên, chuẩn hóa lỗi. */

export const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
export const API_V1 = `${API_BASE}/api/v1`;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  guestToken?: string | null;
  accessToken?: string | null;
  /** Đường dẫn tuyệt đối (ví dụ /q/:token nằm ngoài /api/v1) */
  absolute?: boolean;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const url = options.absolute ? `${API_BASE}${path}` : `${API_V1}${path}`;
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.guestToken) headers['x-guest-token'] = options.guestToken;
  if (options.accessToken) headers.authorization = `Bearer ${options.accessToken}`;
  if (options.idempotencyKey) headers['idempotency-key'] = options.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(url, {
      method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
      cache: 'no-store',
    });
  } catch (err) {
    throw new ApiError(0, 'NETWORK', 'Không kết nối được máy chủ', err);
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const body = (data ?? {}) as { code?: string; message?: string; details?: unknown };
    throw new ApiError(res.status, body.code ?? `HTTP_${res.status}`, body.message ?? res.statusText, body.details);
  }
  return data as T;
}

export function isNotFound(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
