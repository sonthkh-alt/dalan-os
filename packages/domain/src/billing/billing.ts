import { applyBps, assertAmount, roundAmount, vatIncludedIn, vatOn, type RoundingMode } from '../money/money.js';
import { allocateProportional } from '../money/allocate.js';

export interface BillLineInput {
  id: string;
  /** Tiền dòng (phần được tính vào bill này), đã gồm tùy chọn. */
  amount: number;
  /** Giảm giá ở mức dòng (đã tính sẵn), không âm, không vượt amount. */
  discountAmount?: number;
  vatRateBps: number;
}

export type BillDiscountInput =
  | { kind: 'PERCENT'; valueBps: number; reason?: string }
  | { kind: 'AMOUNT' | 'VOUCHER' | 'POINTS' | 'PROMOTION' | 'GOODWILL'; amount: number; reason?: string };

export interface BillOptions {
  lines: BillLineInput[];
  discounts?: BillDiscountInput[];
  serviceChargeBps?: number;
  /** Thuế suất áp cho phí phục vụ và phụ thu (mặc định thuế suất cơ sở). */
  defaultVatBps: number;
  priceIncludesVat: boolean;
  rounding?: RoundingMode;
  /** Mức chi tiêu tối thiểu (phòng VIP); phần thiếu thành phụ thu. */
  minSpend?: number | null;
}

export interface TaxBreakdownRow {
  rateBps: number;
  taxable: number;
  vat: number;
}

export interface BillTotals {
  subtotal: number;
  lineDiscountTotal: number;
  billDiscountTotal: number;
  appliedDiscounts: { kind: BillDiscountInput['kind']; amount: number; reason?: string }[];
  minSpendSurcharge: number;
  serviceChargeBps: number;
  serviceChargeAmount: number;
  vatAmount: number;
  taxBreakdown: TaxBreakdownRow[];
  /** Tổng trước làm tròn. */
  totalBeforeRounding: number;
  roundingAdjustment: number;
  total: number;
  /** Phân bổ giảm giá bill xuống từng dòng (để ghi BillLine.discountAmount). */
  lineAllocations: { id: string; discountAmount: number; vatAmount: number }[];
}

/**
 * Tính bill theo thứ tự: tổng hàng → giảm dòng → giảm bill → phụ thu tối thiểu → phí phục vụ →
 * VAT (gồm hoặc chưa gồm) → làm tròn trên tổng. Toàn bộ bằng số nguyên đồng.
 */
export function computeBill(options: BillOptions): BillTotals {
  const lines = options.lines;
  for (const l of lines) {
    assertAmount(l.amount, `amount dòng ${l.id}`);
    if (l.amount < 0) throw new RangeError(`Tiền dòng ${l.id} không được âm`);
    const d = l.discountAmount ?? 0;
    assertAmount(d, `discount dòng ${l.id}`);
    if (d < 0 || d > l.amount) throw new RangeError(`Giảm giá dòng ${l.id} không hợp lệ`);
  }

  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const lineDiscountTotal = lines.reduce((s, l) => s + (l.discountAmount ?? 0), 0);
  const afterLineDiscount = subtotal - lineDiscountTotal;

  // Giảm giá bill: phần trăm tính trên số sau giảm dòng; số tiền bị chặn bởi phần còn lại.
  let remaining = afterLineDiscount;
  const appliedDiscounts: BillTotals['appliedDiscounts'] = [];
  for (const d of options.discounts ?? []) {
    let amount: number;
    if (d.kind === 'PERCENT') {
      if (d.valueBps < 0 || d.valueBps > 10_000) throw new RangeError('Phần trăm giảm phải trong 0-100%');
      amount = applyBps(afterLineDiscount, d.valueBps);
    } else {
      assertAmount(d.amount, 'discount');
      if (d.amount < 0) throw new RangeError('Số tiền giảm không được âm');
      amount = d.amount;
    }
    amount = Math.min(amount, remaining);
    remaining -= amount;
    appliedDiscounts.push({ kind: d.kind, amount, reason: d.reason });
  }
  const billDiscountTotal = afterLineDiscount - remaining;
  const net = remaining;

  const minSpend = options.minSpend ?? 0;
  const minSpendSurcharge = minSpend > net ? minSpend - net : 0;
  const netWithSurcharge = net + minSpendSurcharge;

  const serviceChargeBps = options.serviceChargeBps ?? 0;
  const serviceChargeAmount = applyBps(netWithSurcharge, serviceChargeBps);

  // Phân bổ giảm giá bill xuống từng dòng theo tỷ lệ tiền dòng sau giảm dòng.
  const weights = lines.map((l) => l.amount - (l.discountAmount ?? 0));
  const billDiscountPerLine = allocateProportional(billDiscountTotal, weights);

  // Thuế theo từng mức.
  const taxable = new Map<number, number>();
  const lineAllocations: BillTotals['lineAllocations'] = [];
  lines.forEach((l, i) => {
    const lineNet = l.amount - (l.discountAmount ?? 0) - (billDiscountPerLine[i] ?? 0);
    taxable.set(l.vatRateBps, (taxable.get(l.vatRateBps) ?? 0) + lineNet);
    const vatAmount = options.priceIncludesVat ? vatIncludedIn(lineNet, l.vatRateBps) : vatOn(lineNet, l.vatRateBps);
    lineAllocations.push({
      id: l.id,
      discountAmount: (l.discountAmount ?? 0) + (billDiscountPerLine[i] ?? 0),
      vatAmount,
    });
  });
  const extra = minSpendSurcharge + serviceChargeAmount;
  if (extra > 0) taxable.set(options.defaultVatBps, (taxable.get(options.defaultVatBps) ?? 0) + extra);

  const taxBreakdown: TaxBreakdownRow[] = [...taxable.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rateBps, base]) => ({
      rateBps,
      taxable: base,
      vat: options.priceIncludesVat ? vatIncludedIn(base, rateBps) : vatOn(base, rateBps),
    }));
  const vatAmount = taxBreakdown.reduce((s, r) => s + r.vat, 0);

  const totalBeforeRounding = options.priceIncludesVat
    ? netWithSurcharge + serviceChargeAmount
    : netWithSurcharge + serviceChargeAmount + vatAmount;
  const total = roundAmount(totalBeforeRounding, options.rounding ?? 'NONE');

  return {
    subtotal,
    lineDiscountTotal,
    billDiscountTotal,
    appliedDiscounts,
    minSpendSurcharge,
    serviceChargeBps,
    serviceChargeAmount,
    vatAmount,
    taxBreakdown,
    totalBeforeRounding,
    roundingAdjustment: total - totalBeforeRounding,
    total,
    lineAllocations,
  };
}

export interface PaymentLike {
  amount: number;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'CANCELLED';
  refundedAmount?: number;
}

/** Tổng đã thu thành công (trừ hoàn) và số còn phải thu. */
export function settlement(total: number, payments: PaymentLike[]): { paid: number; due: number; isPaid: boolean } {
  const paid = payments
    .filter((p) => p.status === 'SUCCEEDED' || p.status === 'PARTIALLY_REFUNDED')
    .reduce((s, p) => s + p.amount - (p.refundedAmount ?? 0), 0);
  const due = Math.max(0, total - paid);
  return { paid, due, isPaid: due === 0 && total >= 0 };
}

/** Tiền thừa trả khách khi thu tiền mặt. */
export function cashChange(due: number, tendered: number): number {
  assertAmount(due);
  assertAmount(tendered);
  if (tendered < due) throw new RangeError('Tiền khách đưa chưa đủ');
  return tendered - due;
}
