import { banner, center, hr, row, space, text, type Block } from '../render/blocks.js';
import type { KitchenTicketPayload, KitchenVoidPayload, LabelPayload } from '../types.js';
import { dateTime, modifiersText, qty, time, VOID_REASONS } from './format.js';

/** Phiếu bếp: trạm và bàn chữ to, số lượng đậm, tùy chọn và ghi chú in đậm thụt vào. */
export function kitchenTicket(p: KitchenTicketPayload): Block[] {
  const blocks: Block[] = [
    banner(p.stationName ?? p.stationCode, 'lg'),
    text(p.tableNames || 'Mang về', { size: 'xxl', bold: true, align: 'center' }),
    row(`Phiếu #${p.ticketSeq}`, time(p.firedAt), { size: 'md', bold: true }),
    row(`Phiên ${p.sessionCode}`, `${p.guestCount} khách`, { size: 'sm' }),
  ];
  if (p.course > 1) blocks.push(text(`ĐỢT ${p.course}`, { size: 'lg', bold: true, align: 'center', inverse: true }));
  blocks.push(hr(false, true));
  for (const line of p.lines) {
    blocks.push(text(`${qty(line.quantity)} ${line.unit}  ${line.name}`, { size: 'xl', bold: true }));
    const mods = modifiersText(line.modifiers);
    if (mods) blocks.push(text(`• ${mods}`, { size: 'lg', bold: true, indent: 1 }));
    if (line.note) blocks.push(text(`Ghi chú: ${line.note}`, { size: 'lg', bold: true, indent: 1 }));
    blocks.push(space(6));
  }
  blocks.push(hr(true), row(p.branchName ?? '', dateTime(p.firedAt), { size: 'xs' }));
  return blocks;
}

/** Phiếu hủy món: nổi bật để bếp dừng ngay. */
export function kitchenVoid(p: KitchenVoidPayload): Block[] {
  return [
    banner('HỦY MÓN', 'xxl'),
    text(p.tableNames || '', { size: 'xl', bold: true, align: 'center' }),
    row(p.stationName ?? '', time(p.at), { size: 'sm' }),
    hr(false, true),
    text(`${qty(p.quantity)} × ${p.name}`, { size: 'xl', bold: true }),
    text(`Lý do: ${VOID_REASONS[p.reason] ?? p.reason}`, { size: 'md', bold: true, indent: 1 }),
    hr(true),
    center(p.sessionCode ? `Phiên ${p.sessionCode}` : '', 'xs'),
  ];
}

/** Nhãn món (dán lên hộp mang về). */
export function label(p: LabelPayload): Block[] {
  const blocks: Block[] = [text(p.name, { size: 'lg', bold: true })];
  const mods = modifiersText(p.modifiers);
  if (mods) blocks.push(text(mods, { size: 'sm', indent: 1 }));
  if (p.note) blocks.push(text(`Ghi chú: ${p.note}`, { size: 'sm', bold: true, indent: 1 }));
  const meta = [p.tableNames, p.index && p.total ? `${p.index}/${p.total}` : null].filter(Boolean).join('  ');
  if (meta) blocks.push(text(meta, { size: 'xs' }));
  return blocks;
}
