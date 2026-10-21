export const EINVOICE_QUEUE = 'einvoice';
export const EINVOICE_MAX_ATTEMPTS = 5;

export interface IssueJobData {
  eInvoiceId: string;
}

/** Chuyển REDIS_URL thành tùy chọn kết nối ioredis cho BullMQ (BullMQ yêu cầu maxRetriesPerRequest = null). */
export function redisConnectionFromUrl(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password || undefined,
    db: u.pathname && u.pathname !== '/' ? Number(u.pathname.slice(1)) : 0,
    maxRetriesPerRequest: null as null,
    enableReadyCheck: false,
  };
}
