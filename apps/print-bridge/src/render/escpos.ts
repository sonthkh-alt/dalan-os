import type { PackedBitmap } from './bitmap.js';

/** Bộ mã hóa ESC/POS tối giản: khởi tạo, in ảnh raster, xuống dòng, cắt giấy, mở két. */

export const ESC = 0x1b;
export const GS = 0x1d;

export const CMD = {
  init: () => Uint8Array.from([ESC, 0x40]),
  alignLeft: () => Uint8Array.from([ESC, 0x61, 0x00]),
  alignCenter: () => Uint8Array.from([ESC, 0x61, 0x01]),
  /** Đẩy n dòng */
  feed: (n = 3) => Uint8Array.from([ESC, 0x64, Math.max(0, Math.min(255, n))]),
  /** Cắt giấy (một phần, có đẩy giấy): GS V 66 n */
  cut: (partial = true) => Uint8Array.from([GS, 0x56, partial ? 0x42 : 0x41, 0x00]),
  /** Mở két tiền qua cổng DK (ESC p m t1 t2) */
  openDrawer: () => Uint8Array.from([ESC, 0x70, 0x00, 0x19, 0xfa]),
  /** Chuông (nếu máy hỗ trợ): ESC B n t */
  beep: (times = 2) => Uint8Array.from([ESC, 0x42, times, 0x02]),
};

/**
 * In ảnh raster: GS v 0 m xL xH yL yH d1...dk. Chia thành các khối tối đa `chunkRows` hàng để máy in
 * có bộ đệm nhỏ không bị tràn.
 */
export function rasterCommands(bitmap: PackedBitmap, chunkRows = 512): Uint8Array[] {
  if (bitmap.widthBytes > 0xffff || chunkRows < 1) throw new RangeError('Kích thước bitmap không hợp lệ');
  const parts: Uint8Array[] = [];
  for (let y = 0; y < bitmap.height; y += chunkRows) {
    const rows = Math.min(chunkRows, bitmap.height - y);
    const header = Uint8Array.from([GS, 0x76, 0x30, 0x00, bitmap.widthBytes & 0xff, (bitmap.widthBytes >> 8) & 0xff, rows & 0xff, (rows >> 8) & 0xff]);
    const body = bitmap.data.subarray(y * bitmap.widthBytes, (y + rows) * bitmap.widthBytes);
    parts.push(concat([header, body]));
  }
  return parts;
}

export function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export interface PrintBufferOptions {
  cut?: boolean;
  openDrawer?: boolean;
  beep?: boolean;
  feedLines?: number;
}

/** Ghép toàn bộ lệnh cho một lần in. */
export function buildPrintBuffer(bitmap: PackedBitmap, options: PrintBufferOptions = {}): Uint8Array {
  const parts: Uint8Array[] = [CMD.init(), CMD.alignLeft(), ...rasterCommands(bitmap)];
  parts.push(CMD.feed(options.feedLines ?? 3));
  if (options.beep) parts.push(CMD.beep());
  if (options.cut !== false) parts.push(CMD.cut(true));
  if (options.openDrawer) parts.push(CMD.openDrawer());
  return concat(parts);
}
