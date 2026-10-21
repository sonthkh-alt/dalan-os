/** Mô hình tài liệu in: danh sách khối, độc lập với canvas để mẫu in dễ viết và kiểm thử. */

export type TextSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
export type Align = 'left' | 'center' | 'right';

export type Block =
  | { type: 'text'; text: string; size?: TextSize; bold?: boolean; align?: Align; indent?: number; inverse?: boolean; italic?: boolean }
  | { type: 'row'; left: string; right: string; size?: TextSize; bold?: boolean; indent?: number; rightBold?: boolean }
  | { type: 'cols'; cells: { text: string; width: number; align?: Align; bold?: boolean }[]; size?: TextSize; bold?: boolean }
  | { type: 'hr'; dashed?: boolean; thick?: boolean }
  | { type: 'space'; height: number }
  | { type: 'qr'; data: string; modulePx?: number; caption?: string }
  | { type: 'banner'; text: string; size?: TextSize };

export const text = (t: string, opts: Omit<Extract<Block, { type: 'text' }>, 'type' | 'text'> = {}): Block => ({ type: 'text', text: t, ...opts });
export const row = (left: string, right: string, opts: Omit<Extract<Block, { type: 'row' }>, 'type' | 'left' | 'right'> = {}): Block => ({ type: 'row', left, right, ...opts });
export const cols = (cells: Extract<Block, { type: 'cols' }>['cells'], opts: { size?: TextSize; bold?: boolean } = {}): Block => ({ type: 'cols', cells, ...opts });
export const hr = (dashed = true, thick = false): Block => ({ type: 'hr', dashed, thick });
export const space = (height = 8): Block => ({ type: 'space', height });
export const qr = (data: string, caption?: string, modulePx?: number): Block => ({ type: 'qr', data, caption, modulePx });
export const banner = (t: string, size: TextSize = 'xl'): Block => ({ type: 'banner', text: t, size });
export const center = (t: string, size: TextSize = 'md', bold = false): Block => text(t, { align: 'center', size, bold });
