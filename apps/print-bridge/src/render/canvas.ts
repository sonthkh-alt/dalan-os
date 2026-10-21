import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas, GlobalFonts, type SKRSContext2D } from '@napi-rs/canvas';
import { APP_ROOT } from '../config.js';
import { logger } from '../logger.js';
import type { Block, TextSize } from './blocks.js';
import { packMonochrome, trimBottom, type PackedBitmap } from './bitmap.js';
import { wrapText } from './layout.js';
import { qrMatrix } from './qr.js';

const log = logger('render');

/** Bề rộng in theo khổ giấy (203 dpi): 58 mm → 384 điểm, 80 mm → 576 điểm. */
export function dotsForPaper(paperWidthMm: number): number {
  return paperWidthMm <= 58 ? 384 : 576;
}

const PREFERRED_FONTS = ['Segoe UI', 'Arial', 'Roboto', 'Noto Sans', 'DejaVu Sans', 'Liberation Sans', 'Helvetica', 'sans-serif'];
let resolvedFamily: string | null = null;

/** Chọn font có hỗ trợ tiếng Việt: ưu tiên font trong assets/fonts, rồi font hệ thống. */
export function setupFonts(preferred?: string): string {
  if (resolvedFamily) return resolvedFamily;
  const assetsDir = join(APP_ROOT, 'assets', 'fonts');
  if (existsSync(assetsDir)) {
    for (const file of readdirSync(assetsDir)) {
      if (/\.(ttf|otf|ttc)$/i.test(file)) {
        try {
          GlobalFonts.registerFromPath(join(assetsDir, file));
          log.info(`Đã đăng ký font ${file}`);
        } catch (err) {
          log.warn(`Không đăng ký được font ${file}: ${String(err)}`);
        }
      }
    }
  }
  const families = new Set(GlobalFonts.families.map((f) => f.family));
  const candidates = [preferred, ...PREFERRED_FONTS].filter((f): f is string => !!f);
  resolvedFamily = candidates.find((f) => families.has(f)) ?? 'sans-serif';
  log.info(`Font in: ${resolvedFamily}`);
  return resolvedFamily;
}

interface Theme {
  width: number;
  margin: number;
  family: string;
  sizes: Record<TextSize, number>;
  lineHeight: number;
}

function themeFor(width: number, family: string): Theme {
  const scale = width / 576;
  const base: Record<TextSize, number> = { xs: 19, sm: 22, md: 26, lg: 32, xl: 42, xxl: 54 };
  const sizes = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, Math.round(v * Math.max(scale, 0.72))])) as Record<TextSize, number>;
  return { width, margin: Math.round(10 * scale) + 2, family, sizes, lineHeight: 1.22 };
}

function font(theme: Theme, size: TextSize, bold = false, italic = false): string {
  return `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${theme.sizes[size]}px "${theme.family}", sans-serif`;
}

export interface Rendered {
  width: number;
  height: number;
  png: Buffer;
  bitmap: PackedBitmap;
}

/**
 * Vẽ danh sách khối thành ảnh đơn sắc. Chiến lược: đo chiều cao trên canvas tạm, rồi vẽ thật.
 */
export function renderBlocks(blocks: Block[], paperWidthMm: number, fontFamily?: string): Rendered {
  const width = dotsForPaper(paperWidthMm);
  const theme = themeFor(width, setupFonts(fontFamily));
  const probe = createCanvas(width, 64).getContext('2d');
  const height = Math.max(32, Math.ceil(paint(probe, theme, blocks, false)) + theme.margin);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#000';
  paint(ctx, theme, blocks, true);
  const image = ctx.getImageData(0, 0, width, height);
  const bitmap = trimBottom(packMonochrome(image.data, width, height), 16);
  return { width, height: bitmap.height, png: canvas.toBuffer('image/png'), bitmap };
}

/** Vẽ (hoặc chỉ đo khi draw=false) và trả về tổng chiều cao. */
function paint(ctx: SKRSContext2D, theme: Theme, blocks: Block[], draw: boolean): number {
  let y = theme.margin / 2;
  const contentWidth = theme.width - theme.margin * 2;
  const measure = (t: string) => ctx.measureText(t).width;
  ctx.textBaseline = 'top';

  const drawLine = (t: string, x: number, lineY: number, align: 'left' | 'center' | 'right', maxWidth: number) => {
    if (!draw) return;
    const w = measure(t);
    const startX = align === 'center' ? x + (maxWidth - w) / 2 : align === 'right' ? x + maxWidth - w : x;
    ctx.fillText(t, startX, lineY);
  };

  for (const block of blocks) {
    switch (block.type) {
      case 'space':
        y += block.height;
        break;
      case 'hr': {
        const h = block.thick ? 4 : 2;
        if (draw) {
          if (block.dashed) {
            for (let x = theme.margin; x < theme.width - theme.margin; x += 12) ctx.fillRect(x, y + 4, 6, h);
          } else {
            ctx.fillRect(theme.margin, y + 4, contentWidth, h);
          }
        }
        y += 12 + h;
        break;
      }
      case 'text': {
        const size = block.size ?? 'md';
        ctx.font = font(theme, size, block.bold, block.italic);
        const indent = (block.indent ?? 0) * theme.sizes.md;
        const maxWidth = contentWidth - indent;
        const lines = wrapText(block.text, maxWidth, measure);
        const lh = Math.round(theme.sizes[size] * theme.lineHeight);
        if (block.inverse) {
          const boxH = lines.length * lh + 8;
          if (draw) {
            ctx.fillRect(theme.margin + indent, y, maxWidth, boxH);
            ctx.fillStyle = '#fff';
          }
          lines.forEach((l, i) => drawLine(l, theme.margin + indent, y + 4 + i * lh, block.align ?? 'left', maxWidth));
          if (draw) ctx.fillStyle = '#000';
          y += boxH + 4;
        } else {
          lines.forEach((l, i) => drawLine(l, theme.margin + indent, y + i * lh, block.align ?? 'left', maxWidth));
          y += lines.length * lh;
        }
        break;
      }
      case 'banner': {
        const size = block.size ?? 'xl';
        ctx.font = font(theme, size, true);
        const lh = Math.round(theme.sizes[size] * theme.lineHeight);
        const lines = wrapText(block.text, contentWidth - 16, measure);
        const boxH = lines.length * lh + 16;
        if (draw) {
          ctx.fillRect(theme.margin, y, contentWidth, boxH);
          ctx.fillStyle = '#fff';
        }
        lines.forEach((l, i) => drawLine(l, theme.margin + 8, y + 8 + i * lh, 'center', contentWidth - 16));
        if (draw) ctx.fillStyle = '#000';
        y += boxH + 6;
        break;
      }
      case 'row': {
        const size = block.size ?? 'md';
        const indent = (block.indent ?? 0) * theme.sizes.md;
        ctx.font = font(theme, size, block.rightBold ?? block.bold);
        const rightW = measure(block.right);
        ctx.font = font(theme, size, block.bold);
        const gap = theme.sizes.md;
        const leftMax = Math.max(40, contentWidth - indent - rightW - gap);
        const lines = wrapText(block.left, leftMax, measure);
        const lh = Math.round(theme.sizes[size] * theme.lineHeight);
        lines.forEach((l, i) => drawLine(l, theme.margin + indent, y + i * lh, 'left', leftMax));
        ctx.font = font(theme, size, block.rightBold ?? block.bold);
        drawLine(block.right, theme.margin, y, 'right', contentWidth);
        y += Math.max(1, lines.length) * lh;
        break;
      }
      case 'cols': {
        const size = block.size ?? 'sm';
        const lh = Math.round(theme.sizes[size] * theme.lineHeight);
        const totalWeight = block.cells.reduce((s, c) => s + c.width, 0);
        let x = theme.margin;
        let maxLines = 1;
        const prepared = block.cells.map((c) => {
          const w = (contentWidth * c.width) / totalWeight;
          ctx.font = font(theme, size, c.bold ?? block.bold);
          const lines = wrapText(c.text, w - 4, measure);
          maxLines = Math.max(maxLines, lines.length);
          const cell = { x, w, lines, align: c.align ?? 'left', bold: c.bold ?? block.bold };
          x += w;
          return cell;
        });
        for (const cell of prepared) {
          ctx.font = font(theme, size, cell.bold);
          cell.lines.forEach((l, i) => drawLine(l, cell.x, y + i * lh, cell.align, cell.w - 4));
        }
        y += maxLines * lh;
        break;
      }
      case 'qr': {
        const matrix = qrMatrix(block.data);
        const modulePx = block.modulePx ?? Math.max(4, Math.floor((contentWidth * 0.55) / matrix.size));
        const sizePx = matrix.size * modulePx;
        const startX = Math.round((theme.width - sizePx) / 2);
        if (draw) {
          for (let r = 0; r < matrix.size; r++) {
            for (let c = 0; c < matrix.size; c++) {
              if (matrix.isDark(r, c)) ctx.fillRect(startX + c * modulePx, y + r * modulePx, modulePx, modulePx);
            }
          }
        }
        y += sizePx + 6;
        if (block.caption) {
          ctx.font = font(theme, 'sm', false);
          const lh = Math.round(theme.sizes.sm * theme.lineHeight);
          const lines = wrapText(block.caption, contentWidth, measure);
          lines.forEach((l, i) => drawLine(l, theme.margin, y + i * lh, 'center', contentWidth));
          y += lines.length * lh;
        }
        break;
      }
    }
  }
  return y + theme.margin / 2;
}
