import { center, hr, qr, row, space, text, type Block } from '../render/blocks.js';
import type { BillPayload, DepositReceiptPayload } from '../types.js';
import { dateTime, DISCOUNT_LABELS, modifiersText, money, moneyD, paymentLabel, percent, qty, time } from './format.js';

/** Bill tạm tính hoặc hóa đơn thanh toán. */
export function bill(p: BillPayload): Block[] {
  const isFinal = p.kind === 'BILL_FINAL';
  const t = p.totals;
  const blocks: Block[] = [
    center(p.branch.header || p.branch.name, 'lg', true),
    ...(p.branch.address ? [center(p.branch.address, 'xs')] : []),
    ...(p.branch.phone ? [center(`ĐT: ${p.branch.phone}${p.branch.taxCode ? `  -  MST: ${p.branch.taxCode}` : ''}`, 'xs')] : []),
    space(6),
    center(isFinal ? 'HÓA ĐƠN THANH TOÁN' : 'PHIẾU TẠM TÍNH', 'xl', true),
    space(4),
    row('Mã', p.bill.code, { size: 'sm', rightBold: true }),
    row('Bàn', p.bill.tableNames || 'Mang về', { size: 'sm', rightBold: true }),
    row('Số khách', String(p.bill.guestCount), { size: 'sm' }),
    row('Giờ vào', dateTime(p.bill.openedAt), { size: 'sm' }),
    row(isFinal ? 'Thanh toán' : 'In lúc', dateTime(isFinal ? (p.bill.closedAt ?? new Date().toISOString()) : new Date().toISOString()), { size: 'sm' }),
  ];
  if (p.bill.printedBy) blocks.push(row('Thu ngân', p.bill.printedBy, { size: 'sm' }));
  if (!isFinal && p.bill.printedCount > 1) blocks.push(row('In lần', String(p.bill.printedCount), { size: 'sm' }));
  blocks.push(hr(false, true));

  for (const line of p.lines) {
    blocks.push(row(line.name, money(line.amount), { size: 'md', rightBold: true }));
    const mods = modifiersText(line.modifiers);
    const detail = `${qty(line.quantity)} ${line.unit} × ${money(line.unitPrice)}${mods ? `  •  ${mods}` : ''}`;
    blocks.push(text(detail, { size: 'xs', indent: 1 }));
  }
  blocks.push(hr(true));

  blocks.push(row('Tổng tiền hàng', money(t.subtotal), { size: 'md' }));
  if (t.lineDiscount > 0) blocks.push(row('Giảm giá món', `-${money(t.lineDiscount)}`, { size: 'sm' }));
  for (const d of p.discounts) {
    if (d.amount <= 0) continue;
    blocks.push(row(`${DISCOUNT_LABELS[d.kind] ?? 'Giảm'}${d.reason ? ` (${d.reason})` : ''}`, `-${money(d.amount)}`, { size: 'sm' }));
  }
  if (t.serviceCharge > 0) blocks.push(row(`Phí phục vụ ${percent(t.serviceChargeBps)}`, money(t.serviceCharge), { size: 'sm' }));
  if (t.vat > 0) blocks.push(row(t.priceIncludesVat ? 'Trong đó VAT' : 'VAT', money(t.vat), { size: 'sm' }));
  if (t.rounding !== 0) blocks.push(row('Làm tròn', (t.rounding > 0 ? '+' : '') + money(t.rounding), { size: 'sm' }));
  blocks.push(space(4), row('TỔNG CỘNG', money(t.total), { size: 'xl', bold: true }), space(4));

  if (p.payments.length) {
    blocks.push(hr(true));
    for (const pay of p.payments) {
      blocks.push(row(paymentLabel(pay.method, pay.subMethod), money(pay.amount), { size: 'md' }));
      if (pay.tendered && pay.tendered !== pay.amount) {
        blocks.push(row('Tiền khách đưa', money(pay.tendered), { size: 'sm', indent: 1 }));
        blocks.push(row('Tiền thừa', money(pay.change), { size: 'sm', indent: 1, rightBold: true }));
      }
    }
  }
  if (!isFinal || t.due > 0) {
    blocks.push(row('CÒN PHẢI THU', money(t.due), { size: 'lg', bold: true }));
  }

  if (p.vietqr && (t.due > 0 || !isFinal)) {
    blocks.push(hr(true), center('Quét mã để chuyển khoản', 'sm', true), qr(p.vietqr.payload));
    if (p.vietqr.accountName) blocks.push(center(p.vietqr.accountName, 'sm', true));
    if (p.vietqr.accountNo) blocks.push(center(`STK ${p.vietqr.accountNo}${p.vietqr.bankBin ? ` (BIN ${p.vietqr.bankBin})` : ''}`, 'xs'));
    blocks.push(center(`Số tiền ${moneyD(p.vietqr.amount)}  •  Nội dung: ${p.vietqr.purpose}`, 'xs'));
  }

  if (p.eInvoice && (p.eInvoice.lookupCode || p.eInvoice.lookupUrl)) {
    blocks.push(hr(true), center('HÓA ĐƠN ĐIỆN TỬ', 'sm', true));
    if (p.eInvoice.invoiceNo) blocks.push(center(`Số HĐ: ${p.eInvoice.invoiceNo}`, 'xs'));
    if (p.eInvoice.lookupCode) blocks.push(center(`Mã tra cứu: ${p.eInvoice.lookupCode}`, 'xs', true));
    if (p.eInvoice.lookupUrl) blocks.push(qr(p.eInvoice.lookupUrl, p.eInvoice.lookupUrl, 3));
  } else if (isFinal) {
    blocks.push(hr(true), center('Quý khách cần hóa đơn VAT vui lòng cung cấp thông tin tại quầy', 'xs'));
  }

  blocks.push(hr(true), center(p.branch.footer || 'Cảm ơn quý khách. Hẹn gặp lại!', 'sm', true), center(`In lúc ${time(new Date().toISOString())}`, 'xs'));
  return blocks;
}

/** Phiếu thu tiền đặt cọc (đặt bàn, tiệc). */
export function depositReceipt(p: DepositReceiptPayload): Block[] {
  return [
    center(p.branch?.name ?? 'Nhà hàng Dạ Lan', 'lg', true),
    ...(p.branch?.address ? [center(p.branch.address, 'xs')] : []),
    space(6),
    center('PHIẾU THU TIỀN ĐẶT CỌC', 'xl', true),
    space(4),
    row('Số phiếu', p.receipt.code, { size: 'sm', rightBold: true }),
    row('Ngày', dateTime(p.receipt.at), { size: 'sm' }),
    row('Khách hàng', p.customer.name, { size: 'sm', rightBold: true }),
    ...(p.customer.phone ? [row('Điện thoại', p.customer.phone, { size: 'sm' })] : []),
    row(p.reference.type, p.reference.code, { size: 'sm' }),
    ...(p.reference.eventDate ? [row('Ngày tổ chức', p.reference.eventDate, { size: 'sm' })] : []),
    ...(p.reference.description ? [text(p.reference.description, { size: 'xs', indent: 1 })] : []),
    hr(true),
    row('Số tiền', money(p.amount), { size: 'xl', bold: true }),
    row('Hình thức', paymentLabel(p.method), { size: 'sm' }),
    ...(p.note ? [text(`Ghi chú: ${p.note}`, { size: 'xs' })] : []),
    ...(p.receipt.receivedBy ? [row('Người thu', p.receipt.receivedBy, { size: 'sm' })] : []),
    hr(true),
    center('Vui lòng giữ phiếu để đối chiếu khi thanh toán', 'xs'),
  ];
}
