import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from './logger.js';
import type { PrintJobDto } from './types.js';

const log = logger('queue');

export type EntryState = 'queued' | 'printed' | 'failed';

export interface QueueEntry {
  job: PrintJobDto;
  state: EntryState;
  attempts: number;
  /** Thời điểm sớm nhất thử lại (ms epoch) */
  nextAttemptAt: number;
  lastError?: string;
  addedAt: number;
  printedAt?: number;
  /** Cần báo kết quả về API (job từ API); job khẩn cấp cục bộ thì không */
  ackRequired: boolean;
}

/**
 * Hàng đợi in bền vững: ghi JSON ra đĩa sau mỗi thay đổi (ghi tệp tạm rồi đổi tên để không hỏng khi mất điện).
 * Trạng thái: queued (chờ in) → printed/failed (chờ báo API) → xóa khi API nhận.
 */
export class PrintQueue {
  private entries = new Map<string, QueueEntry>();
  private readonly file: string;
  private readonly historyFile: string;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.file = join(dataDir, 'queue.json');
    this.historyFile = join(dataDir, 'history.jsonl');
    this.load();
  }

  private load(): void {
    if (!existsSync(this.file)) return;
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as QueueEntry[];
      for (const e of raw) this.entries.set(e.job.id, e);
      log.info(`Nạp ${this.entries.size} job từ hàng đợi trên đĩa`);
    } catch (err) {
      log.error(`Không đọc được hàng đợi, bỏ qua: ${String(err)}`);
    }
  }

  private save(): void {
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify([...this.entries.values()], null, 1), 'utf8');
    renameSync(tmp, this.file);
  }

  /** Thêm job nếu chưa có; trả về true khi mới. */
  add(job: PrintJobDto, ackRequired = true): boolean {
    if (this.entries.has(job.id)) return false;
    this.entries.set(job.id, { job, state: 'queued', attempts: 0, nextAttemptAt: 0, addedAt: Date.now(), ackRequired });
    this.save();
    return true;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  /** Job tiếp theo cần in (theo thứ tự thêm vào, đã tới giờ thử lại). */
  nextToPrint(now = Date.now()): QueueEntry | undefined {
    return [...this.entries.values()]
      .filter((e) => e.state === 'queued' && e.nextAttemptAt <= now)
      .sort((a, b) => a.addedAt - b.addedAt)[0];
  }

  /** Các job đã in hoặc thất bại nhưng chưa báo được về API. */
  pendingAcks(): QueueEntry[] {
    return [...this.entries.values()].filter((e) => e.ackRequired && e.state !== 'queued');
  }

  markPrinted(id: string): void {
    const e = this.entries.get(id);
    if (!e) return;
    e.state = 'printed';
    e.printedAt = Date.now();
    e.lastError = undefined;
    this.history({ id, kind: e.job.kind, printerId: e.job.printerId, result: 'printed', at: e.printedAt, attempts: e.attempts });
    if (!e.ackRequired) this.entries.delete(id);
    this.save();
  }

  /** Ghi nhận lần in lỗi; lùi lịch thử lại theo cấp số; sau MAX lần thì chuyển failed. */
  markAttemptFailed(id: string, error: string, maxAttempts: number): void {
    const e = this.entries.get(id);
    if (!e) return;
    e.attempts += 1;
    e.lastError = error;
    if (e.attempts >= maxAttempts) {
      e.state = 'failed';
      this.history({ id, kind: e.job.kind, printerId: e.job.printerId, result: 'failed', at: Date.now(), attempts: e.attempts, error });
      if (!e.ackRequired) this.entries.delete(id);
    } else {
      const backoff = Math.min(60_000, 2_000 * 2 ** (e.attempts - 1));
      e.nextAttemptAt = Date.now() + backoff;
    }
    this.save();
  }

  remove(id: string): void {
    if (this.entries.delete(id)) this.save();
  }

  /** In lại một job đã in (từ trang trạng thái). */
  requeue(id: string): boolean {
    const e = this.entries.get(id);
    if (!e) return false;
    e.state = 'queued';
    e.attempts = 0;
    e.nextAttemptAt = 0;
    this.save();
    return true;
  }

  snapshot() {
    const list = [...this.entries.values()];
    return {
      size: list.length,
      queued: list.filter((e) => e.state === 'queued').length,
      pendingAck: this.pendingAcks().length,
      entries: list.map((e) => ({ id: e.job.id, kind: e.job.kind, printer: e.job.printer?.code ?? e.job.printerId, state: e.state, attempts: e.attempts, lastError: e.lastError, addedAt: new Date(e.addedAt).toISOString() })),
    };
  }

  private history(row: Record<string, unknown>): void {
    try {
      appendFileSync(this.historyFile, `${JSON.stringify(row)}\n`, 'utf8');
    } catch {
      /* nhật ký không quan trọng */
    }
  }
}
