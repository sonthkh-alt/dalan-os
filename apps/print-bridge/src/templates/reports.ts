import { center, cols, hr, row, space, text, type Block } from '../render/blocks.js';
import type { ShiftReportPayload, TestPayload } from '../types.js';
import { dateTime, money, PAYMENT_LABELS } from './format.js';

/** Báo cáo kết ca (Z): doanh thu, theo phương thức, tiền mặt, chênh lệch. */
export function shiftReport(p: ShiftReportPayload): Block[] {
  const s = p.shift;
  const counted = s.closingCashCounted ?? null;
  const variance = s.variance ?? (counted !== null ? counted - p.expectedCash : null);
  const blocks: Block[] = [
    center('BÁO CÁO KẾT CA', 'xl', true),
    space(4),
    row('Mở ca', dateTime(s.openedAt), { size: 'sm' }),
    row('Kết ca', dateTime(s.closedAt ?? new Date().toISOString()), { size: 'sm' }),
    ...(p.closedBy ? [row('Người kết ca', p.closedBy, { size: 'sm' })] : []),
    hr(false, true),
    row('Doanh thu', money(p.revenue), { size: 'lg', bold: true }),
    row('Số bill', String(p.billCount), { size: 'sm' }),
    row('Giảm giá', money(p.discounts), { size: 'sm' }),
    row(`Hủy món (${p.voids.count})`, money(p.voids.amount), { size: 'sm' }),
    hr(true),
    cols([{ text: 'Phương thức', width: 3, bold: true }, { text: 'SL', width: 1, align: 'right', bold: true }, { text: 'Số tiền', width: 2, align: 'right', bold: true }], { size: 'sm' }),
  ];
  for (const [method, v] of Object.entries(p.byMethod)) {
    blocks.push(cols([{ text: PAYMENT_LABELS[method] ?? method, width: 3 }, { text: String(v.count), width: 1, align: 'right' }, { text: money(v.amount - v.refunded), width: 2, align: 'right' }], { size: 'sm' }));
  }
  blocks.push(
    hr(true),
    center('TIỀN MẶT', 'md', true),
    row('Đầu ca', money(s.openingCash), { size: 'sm' }),
    row('Thu tiền mặt', money(p.byMethod.CASH?.amount ?? 0), { size: 'sm' }),
    row('Hoàn tiền mặt', neg(p.byMethod.CASH?.refunded ?? 0), { size: 'sm' }),
    row('Phiếu thu', money(p.cashIn), { size: 'sm' }),
    row('Phiếu chi', neg(p.cashOut), { size: 'sm' }),
    row('Phải có trong két', money(p.expectedCash), { size: 'md', bold: true }),
  );
  if (counted !== null) {
    blocks.push(row('Đếm thực tế', money(counted), { size: 'md', bold: true }));
    blocks.push(row('Chênh lệch', (variance ?? 0) > 0 ? `+${money(variance)}` : money(variance), { size: 'lg', bold: true }));
  }
  if (s.notes) blocks.push(text(`Ghi chú: ${s.notes}`, { size: 'xs' }));
  blocks.push(hr(true), center('Ký xác nhận: ________________', 'sm'), space(24));
  return blocks;
}

/** In thử: kiểm tra kết nối và hiển thị tiếng Việt. */
export function testPage(p: TestPayload, printerName?: string): Block[] {
  return [
    text('IN THỬ', { size: 'xl', bold: true, align: 'center', inverse: true }),
    space(6),
    center(p.printer ?? printerName ?? '', 'md', true),
    center(dateTime(p.at), 'sm'),
    hr(true),
    text(p.message, { size: 'md' }),
    space(6),
    text('Tiếng Việt có dấu: Phở bò tái gầu, Gà ri luộc rút xương, Hến Sông Mã xào hành chăm, Đặc sản xứ Thanh.', { size: 'sm' }),
    text('Chữ đậm: Cá diếc kho tộ Dạ Lan', { size: 'md', bold: true }),
    row('Căn phải', '1.234.000', { size: 'md', rightBold: true }),
    hr(false, true),
    center('Nếu đọc được dòng này, máy in hoạt động tốt.', 'xs'),
  ];
}

/** "-1.000" khi dương, "0" khi không có (tránh in "-0"). */
function neg(n: number): string {
  return n > 0 ? `-${money(n)}` : money(0);
}
