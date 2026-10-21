import { logger } from './logger.js';
import type { PrintJobDto, PrinterDto } from './types.js';

const log = logger('api');

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Client tối giản tới API DaLan OS, xác thực bằng token thiết bị cầu in. */
export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly deviceToken: string,
    private readonly timeoutMs = 10_000,
  ) {}

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'x-device-token': this.deviceToken,
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await res.text();
      const json = text ? (JSON.parse(text) as unknown) : null;
      if (!res.ok) {
        const message = (json as { message?: string } | null)?.message ?? res.statusText;
        throw new ApiError(res.status, `${method} ${path} → ${res.status}: ${message}`);
      }
      return json as T;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Lấy các job đang chờ của cơ sở (API đánh dấu SENT và tăng attempts). */
  pullJobs(): Promise<PrintJobDto[]> {
    return this.request<PrintJobDto[]>('GET', '/api/v1/print-bridge/jobs');
  }

  ack(jobId: string, status: 'PRINTED' | 'FAILED', error?: string): Promise<unknown> {
    return this.request('POST', `/api/v1/print-bridge/jobs/${jobId}/ack`, { status, error });
  }

  printers(): Promise<PrinterDto[]> {
    return this.request<PrinterDto[]>('GET', '/api/v1/print-bridge/printers');
  }

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(5000) });
      return res.ok;
    } catch (err) {
      log.debug(`health lỗi: ${String(err)}`);
      return false;
    }
  }
}
