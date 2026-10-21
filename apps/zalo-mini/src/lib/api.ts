/** Lớp gọi API dùng chung với web khách: gắn token phiên bàn hoặc token thành viên, chuẩn hóa lỗi, tự làm mới token. */
import { useCustomer } from './customer-store';

export const API_BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000').replace(
  /\/$/,
  '',
);
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
  /** true: gắn token thành viên đang đăng nhập (tự làm mới khi hết hạn) */
  auth?: boolean;
  /** Đường dẫn tuyệt đối (ví dụ /q/:token nằm ngoài /api/v1) */
  absolute?: boolean;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

async function rawRequest<T>(
  path: string,
  options: ApiOptions,
  accessToken: string | null,
): Promise<T> {
  const url = options.absolute ? `${API_BASE}${path}` : `${API_V1}${path}`;
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.guestToken) headers['x-guest-token'] = options.guestToken;
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
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
    throw new ApiError(
      0,
      'NETWORK',
      'Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.',
      err,
    );
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
    const body = (data ?? {}) as { code?: string; message?: string | string[]; details?: unknown };
    const message = Array.isArray(body.message)
      ? body.message.join(', ')
      : (body.message ?? res.statusText);
    throw new ApiError(res.status, body.code ?? `HTTP_${res.status}`, message, body.details);
  }
  return data as T;
}

let refreshing: Promise<string | null> | null = null;

/** Làm mới access token bằng refresh token (xoay vòng); trả null nếu phiên đã hết. */
async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken, setTokens, signOut } = useCustomer.getState();
  if (!refreshToken) return null;
  refreshing ??= rawRequest<{ accessToken: string; refreshToken: string }>(
    '/auth/refresh',
    { body: { refreshToken } },
    null,
  )
    .then((r) => {
      setTokens(r.accessToken, r.refreshToken);
      return r.accessToken;
    })
    .catch(() => {
      signOut();
      return null;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const token = options.auth ? useCustomer.getState().accessToken : null;
  try {
    return await rawRequest<T>(path, options, token);
  } catch (err) {
    if (options.auth && token && err instanceof ApiError && err.status === 401) {
      const fresh = await refreshAccessToken();
      if (fresh) return rawRequest<T>(path, options, fresh);
    }
    throw err;
  }
}

/** Endpoint chưa có trên API (404/405/501) — hiển thị thông báo nhẹ thay vì lỗi. */
export function isMissingEndpoint(err: unknown): boolean {
  return (
    err instanceof ApiError && (err.status === 404 || err.status === 405 || err.status === 501)
  );
}

export function errorMessage(err: unknown, fallback = 'Có lỗi xảy ra, vui lòng thử lại'): string {
  if (err instanceof ApiError) return err.message || fallback;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
