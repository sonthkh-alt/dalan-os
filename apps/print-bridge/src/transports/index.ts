import { mkdirSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { logger } from '../logger.js';
import type { PrinterDto } from '../types.js';

const log = logger('transport');

export interface SendOptions {
  timeoutMs: number;
  retries: number;
}

export interface SendResult {
  ok: boolean;
  error?: string;
  /** Đường dẫn tệp mô phỏng nếu có */
  file?: string;
}

/** Phân tích "192.168.1.201" hoặc "192.168.1.201:9100" */
export function parseNetworkAddress(address: string): { host: string; port: number } {
  const m = /^\s*([^:\s]+)(?::(\d{1,5}))?\s*$/.exec(address);
  if (!m || !m[1]) throw new Error(`Địa chỉ máy in không hợp lệ: ${address}`);
  return { host: m[1], port: m[2] ? Number(m[2]) : 9100 };
}

function sendTcpOnce(host: string, port: number, data: Uint8Array, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      err ? reject(err) : resolve();
    };
    socket.setTimeout(timeoutMs, () => finish(new Error(`Hết thời gian chờ ${host}:${port}`)));
    socket.once('error', (err) => finish(err));
    socket.once('connect', () => {
      socket.write(Buffer.from(data), (err) => {
        if (err) return finish(err);
        // Đợi máy in nhận hết dữ liệu rồi đóng
        socket.end(() => finish());
      });
    });
  });
}

/** Gửi qua LAN (cổng 9100 RAW), thử lại có lùi thời gian. */
export async function sendNetwork(printer: PrinterDto, data: Uint8Array, options: SendOptions): Promise<SendResult> {
  if (!printer.address) return { ok: false, error: `Máy in ${printer.code} chưa có địa chỉ IP` };
  const { host, port } = parseNetworkAddress(printer.address);
  let lastError = '';
  for (let attempt = 1; attempt <= options.retries; attempt++) {
    try {
      await sendTcpOnce(host, port, data, options.timeoutMs);
      return { ok: true };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      log.warn(`Gửi ${printer.code} (${host}:${port}) lần ${attempt}/${options.retries} lỗi: ${lastError}`);
      if (attempt < options.retries) await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  return { ok: false, error: lastError };
}

/** USB: chỉ hỗ trợ khi hệ điều hành cho phép ghi thẳng vào thiết bị (Linux /dev/usb/lp0, Windows cổng chia sẻ dạng tệp). */
export async function sendUsb(printer: PrinterDto, data: Uint8Array): Promise<SendResult> {
  const address = printer.address ?? '';
  const looksLikePath = /^(\/dev\/|\\\\|[A-Za-z]:\\)/.test(address);
  if (!looksLikePath) {
    return { ok: false, error: `Máy in USB ${printer.code}: cần địa chỉ dạng đường dẫn thiết bị (ví dụ \\\\PC\\TenMayInChiaSe hoặc /dev/usb/lp0); hãy chia sẻ máy in trên Windows hoặc dùng LAN` };
  }
  try {
    writeFileSync(address, Buffer.from(data));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Ghi USB ${address} lỗi: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Mô phỏng: lưu ESC/POS (.bin), ảnh (.png) và payload (.json) để nghiệm thu không cần máy in. */
export function sendSimulator(dir: string, jobId: string, kind: string, data: Uint8Array, png: Buffer, payload: unknown): SendResult {
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = join(dir, `${stamp}_${kind}_${jobId.slice(0, 8)}`);
  writeFileSync(`${base}.bin`, Buffer.from(data));
  writeFileSync(`${base}.png`, png);
  writeFileSync(`${base}.json`, JSON.stringify(payload, null, 2), 'utf8');
  return { ok: true, file: `${base}.png` };
}

export async function send(printer: PrinterDto, data: Uint8Array, options: SendOptions): Promise<SendResult> {
  switch (printer.connection) {
    case 'NETWORK':
      return sendNetwork(printer, data, options);
    case 'USB':
      return sendUsb(printer, data);
    default:
      return { ok: false, error: `Kết nối ${printer.connection} chưa hỗ trợ (dùng LAN hoặc USB)` };
  }
}
