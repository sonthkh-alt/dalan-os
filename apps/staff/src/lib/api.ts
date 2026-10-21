'use client';

import { useAuth } from './auth-store';
import { uuid } from './utils';

/** Thêm https:// khi biến môi trường chỉ chứa tên máy chủ (Render Blueprint chỉ cung cấp host). */
export function toPublicUrl(value: string | undefined, fallback: string): string {
  const v = (value ?? '').trim() || fallback;
  return (/^https?:\/\//i.test(v) ? v : `https://${v}`).replace(/\/$/, '');
}

export const API_URL = toPublicUrl(process.env.NEXT_PUBLIC_API_URL, 'http://localhost:4000');
export const API_BASE = `${API_URL}/api/v1`;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly traceId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
  /** Lỗi mạng (không tới được máy chủ). */
  get isNetwork(): boolean {
    return this.status === 0;
  }
}

export interface RequestOptions {
  /** Khóa chống trùng; true = tự sinh. Mặc định true với lệnh ghi. */
  idempotencyKey?: string | boolean;
  headers?: Record<string, string>;
  /** Không gắn Bearer (đăng nhập). */
  anonymous?: boolean;
  signal?: AbortSignal;
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const { refreshToken } = useAuth.getState();
  if (!refreshToken) return false;
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) {
          useAuth.getState().logout();
          return false;
        }
        const json = (await res.json()) as { accessToken: string; refreshToken: string };
        useAuth.getState().setTokens(json);
        return true;
      } catch {
        return false;
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

function humanize(status: number, code: string, message: string): string {
  if (status === 0) return 'Không kết nối được máy chủ. Kiểm tra mạng.';
  if (status === 401 && (code === 'UNAUTHORIZED' || !code)) return message || 'Phiên đăng nhập hết hạn, vui lòng đăng nhập lại';
  if (status === 403) return message || 'Bạn không có quyền thực hiện thao tác này';
  if (status === 429) return 'Thao tác quá nhanh, vui lòng thử lại sau giây lát';
  if (status >= 500) return 'Máy chủ gặp lỗi, vui lòng thử lại';
  return message || 'Có lỗi xảy ra';
}

/** Gọi API: Bearer tự động, refresh token khi 401, Idempotency-Key cho lệnh ghi, lỗi chuẩn ApiError. */
export async function api<T = unknown>(method: string, path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  const headers: Record<string, string> = { accept: 'application/json', ...options.headers };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (WRITE_METHODS.has(method) && options.idempotencyKey !== false) {
    headers['idempotency-key'] = typeof options.idempotencyKey === 'string' ? options.idempotencyKey : uuid();
  }

  const doFetch = async (): Promise<Response> => {
    const token = useAuth.getState().accessToken;
    if (token && !options.anonymous) headers.authorization = `Bearer ${token}`;
    return fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: options.signal });
  };

  let res: Response;
  try {
    res = await doFetch();
    if (res.status === 401 && !options.anonymous && (await refreshTokens())) {
      res = await doFetch();
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK', humanize(0, 'NETWORK', ''));
  }

  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }
  if (!res.ok) {
    const e = (json ?? {}) as { code?: string; message?: string; details?: unknown; traceId?: string };
    if (res.status === 401 && e.code === 'UNAUTHORIZED' && !options.anonymous && !useAuth.getState().refreshToken) {
      useAuth.getState().logout();
    }
    throw new ApiError(res.status, e.code ?? 'HTTP_ERROR', humanize(res.status, e.code ?? '', e.message ?? ''), e.details, e.traceId);
  }
  return json as T;
}

export const get = <T>(path: string, options?: RequestOptions) => api<T>('GET', path, undefined, options);
export const post = <T>(path: string, body?: unknown, options?: RequestOptions) => api<T>('POST', path, body, options);
export const patch = <T>(path: string, body?: unknown, options?: RequestOptions) => api<T>('PATCH', path, body, options);
export const put = <T>(path: string, body?: unknown, options?: RequestOptions) => api<T>('PUT', path, body, options);
export const del = <T>(path: string, options?: RequestOptions) => api<T>('DELETE', path, undefined, options);

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Có lỗi xảy ra';
}

/** API yêu cầu PIN quản lý (hủy món vượt hạn mức, giảm giá vượt hạn mức). */
export function needsApproval(err: unknown): boolean {
  return err instanceof ApiError && err.code === 'APPROVAL_REQUIRED';
}
