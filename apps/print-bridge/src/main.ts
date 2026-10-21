import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ApiClient } from './api.js';
import { loadConfig } from './config.js';
import { startLocalServer } from './local-server.js';
import { logger, setLogLevel } from './logger.js';
import { renderJob } from './printer.js';
import { PrintQueue } from './queue.js';
import { connectRealtime } from './realtime.js';
import { setupFonts } from './render/canvas.js';
import { send, sendSimulator } from './transports/index.js';
import type { PrintJobDto, PrinterDto } from './types.js';

const config = loadConfig();
setLogLevel(config.LOG_LEVEL);
const log = logger('main');

mkdirSync(config.DATA_DIR, { recursive: true });
const printersFile = join(config.DATA_DIR, 'printers.json');
const queue = new PrintQueue(config.DATA_DIR);
const api = config.DEVICE_TOKEN ? new ApiClient(config.API_URL, config.DEVICE_TOKEN) : null;

let printers: PrinterDto[] = loadCachedPrinters();
let apiOnline = false;
let lastPullAt: string | null = null;
let lastPullError: string | null = null;
let working = false;
let pullRequested = false;

function loadCachedPrinters(): PrinterDto[] {
  try {
    return existsSync(printersFile) ? (JSON.parse(readFileSync(printersFile, 'utf8')) as PrinterDto[]) : [];
  } catch {
    return [];
  }
}

async function refreshPrinters(): Promise<void> {
  if (!api) return;
  try {
    printers = await api.printers();
    writeFileSync(printersFile, JSON.stringify(printers, null, 1), 'utf8');
    log.info(`Máy in của cơ sở: ${printers.map((p) => `${p.code}@${p.address ?? '?'}`).join(', ') || '(chưa có)'}`);
  } catch (err) {
    log.warn(`Không tải được danh sách máy in, dùng bản cache (${printers.length}): ${String(err)}`);
  }
}

/** Kéo job mới từ API và đưa vào hàng đợi bền vững. */
async function pull(): Promise<void> {
  if (!api) return;
  try {
    const jobs = await api.pullJobs();
    apiOnline = true;
    lastPullAt = new Date().toISOString();
    lastPullError = null;
    let added = 0;
    for (const job of jobs) if (queue.add(job)) added++;
    if (added > 0) log.info(`Nhận ${added} lệnh in mới (hàng đợi: ${queue.snapshot().queued})`);
  } catch (err) {
    apiOnline = false;
    lastPullError = err instanceof Error ? err.message : String(err);
    log.warn(`Kéo lệnh in lỗi: ${lastPullError}`);
  }
  void work();
}

function printerFor(job: PrintJobDto): PrinterDto | undefined {
  return job.printer ?? printers.find((p) => p.id === job.printerId);
}

/** Xử lý tuần tự hàng đợi: render → gửi máy in (hoặc mô phỏng) → báo API. */
async function work(): Promise<void> {
  if (working) return;
  working = true;
  try {
    for (;;) {
      const entry = queue.nextToPrint();
      if (!entry) break;
      const job = entry.job;
      const printer = printerFor(job);
      if (!printer) {
        queue.markAttemptFailed(job.id, `Không biết máy in ${job.printerId}`, config.MAX_PRINT_ATTEMPTS);
        continue;
      }
      try {
        const rendered = renderJob(job, printer, config.FONT_FAMILY);
        const result = config.SIMULATOR_DIR
          ? sendSimulator(config.SIMULATOR_DIR, job.id, job.kind, rendered.escpos, rendered.png, job.payload)
          : await send(printer, rendered.escpos, { timeoutMs: config.PRINTER_TIMEOUT_MS, retries: config.PRINTER_RETRIES });
        if (result.ok) {
          log.info(`Đã in ${job.kind} → ${printer.code}${result.file ? ` (${result.file})` : ''}`);
          queue.markPrinted(job.id);
        } else {
          queue.markAttemptFailed(job.id, result.error ?? 'Lỗi không rõ', config.MAX_PRINT_ATTEMPTS);
          log.warn(`In ${job.kind} → ${printer.code} thất bại: ${result.error}`);
          // Máy in lỗi: dừng vòng này, chờ lịch thử lại để không quay vòng liên tục
          break;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error(`Render ${job.kind} lỗi: ${message}`);
        queue.markAttemptFailed(job.id, `Render: ${message}`, config.MAX_PRINT_ATTEMPTS);
      }
    }
    await flushAcks();
  } finally {
    working = false;
    if (pullRequested) {
      pullRequested = false;
      void pull();
    }
  }
}

/** Báo kết quả các job đã in/thất bại; giữ lại nếu API chưa nhận được. */
async function flushAcks(): Promise<void> {
  if (!api) return;
  for (const entry of queue.pendingAcks()) {
    try {
      await api.ack(entry.job.id, entry.state === 'printed' ? 'PRINTED' : 'FAILED', entry.lastError);
      queue.remove(entry.job.id);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 404) {
        queue.remove(entry.job.id);
      } else {
        log.debug(`Chưa báo được kết quả job ${entry.job.id}: ${String(err)}`);
        break;
      }
    }
  }
}

function requestPull(): void {
  if (working) pullRequested = true;
  else void pull();
}

function status(): Record<string, unknown> {
  return {
    apiUrl: config.API_URL,
    mode: config.SIMULATOR_DIR ? `mô phỏng → ${config.SIMULATOR_DIR}` : 'máy in thật',
    deviceConfigured: !!api,
    apiOnline,
    lastPullAt,
    lastPullError,
    printers: printers.map((p) => ({ code: p.code, name: p.name, connection: p.connection, address: p.address, paperWidthMm: p.paperWidthMm })),
    queue: queue.snapshot(),
  };
}

async function main(): Promise<void> {
  log.info(`Cầu in DaLan OS khởi động (API ${config.API_URL}, dữ liệu ${config.DATA_DIR})`);
  setupFonts(config.FONT_FAMILY);
  if (!api) log.warn('Chưa cấu hình DEVICE_TOKEN: chỉ chạy chế độ cục bộ (in khẩn cấp qua HTTP, không đồng bộ API)');

  startLocalServer(config.LOCAL_PORT, {
    printers: () => printers,
    enqueueLocal: (job) => {
      queue.add(job, false);
      void work();
    },
    status,
    requeue: (id) => queue.requeue(id),
  });

  await refreshPrinters();
  setInterval(() => void refreshPrinters(), config.PRINTERS_REFRESH_MS).unref();

  if (api && config.DEVICE_TOKEN) {
    connectRealtime(config.API_URL, config.DEVICE_TOKEN, { onPrintJob: requestPull, onConnected: requestPull });
    setInterval(requestPull, config.POLL_INTERVAL_MS);
    await pull();
  } else {
    void work();
  }

  const shutdown = () => {
    log.info('Dừng cầu in, hàng đợi đã lưu trên đĩa');
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  log.error(`Khởi động thất bại: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  process.exit(1);
});
