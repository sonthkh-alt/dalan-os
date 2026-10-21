import { renderBlocks } from './render/canvas.js';
import { buildPrintBuffer } from './render/escpos.js';
import { templateFor } from './templates/index.js';
import type { PrintJobDto, PrinterDto } from './types.js';

export interface RenderedJob {
  escpos: Uint8Array;
  png: Buffer;
  width: number;
  height: number;
}

/** Từ job → khối → ảnh → ESC/POS. Không chạm mạng; dùng cho in thật, mô phỏng và kiểm thử. */
export function renderJob(job: PrintJobDto, printer: PrinterDto, fontFamily?: string): RenderedJob {
  const tpl = templateFor(job);
  const rendered = renderBlocks(tpl.blocks, printer.paperWidthMm || 80, fontFamily);
  const escpos = buildPrintBuffer(rendered.bitmap, { cut: true, openDrawer: tpl.openDrawer, beep: tpl.beep });
  return { escpos, png: rendered.png, width: rendered.width, height: rendered.height };
}
