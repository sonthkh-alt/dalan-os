/**
 * Tiền tệ VND: số nguyên đồng, không phần lẻ. Phần trăm biểu diễn bằng basis points (bps):
 * 10 000 bps = 100%, 1 000 bps = 10%, 800 bps = 8%.
 */

export const BPS_DENOMINATOR = 10_000;

export type RoundingMode = 'NONE' | 'TO_500' | 'TO_1000';

/** Đảm bảo số tiền là số nguyên an toàn (tránh sai số số thực và tràn). */
export function assertAmount(amount: number, label = 'amount'): number {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError(`${label} phải là số nguyên an toàn (nhận ${amount})`);
  }
  return amount;
}

/** Nhân số tiền với tỷ lệ bps, làm tròn tới đồng (half away from zero). */
export function applyBps(amount: number, bps: number): number {
  assertAmount(amount);
  if (!Number.isInteger(bps)) throw new RangeError(`bps phải là số nguyên (nhận ${bps})`);
  return roundHalfAwayFromZero((amount * bps) / BPS_DENOMINATOR);
}

/** Phần thuế nằm trong giá đã gồm thuế: gross * r / (1 + r). */
export function vatIncludedIn(grossAmount: number, vatBps: number): number {
  assertAmount(grossAmount);
  if (vatBps <= 0) return 0;
  return roundHalfAwayFromZero((grossAmount * vatBps) / (BPS_DENOMINATOR + vatBps));
}

/** Thuế cộng thêm trên giá chưa gồm thuế. */
export function vatOn(netAmount: number, vatBps: number): number {
  return applyBps(netAmount, vatBps);
}

export function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/** Làm tròn tổng theo quy tắc cấu hình của cơ sở. */
export function roundAmount(amount: number, mode: RoundingMode): number {
  assertAmount(amount);
  switch (mode) {
    case 'NONE':
      return amount;
    case 'TO_500':
      return roundToMultiple(amount, 500);
    case 'TO_1000':
      return roundToMultiple(amount, 1000);
  }
}

function roundToMultiple(amount: number, multiple: number): number {
  return roundHalfAwayFromZero(amount / multiple) * multiple;
}

const vndFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });

/** "1.234.000 ₫" */
export function formatVnd(amount: number): string {
  return vndFormatter.format(amount);
}

/** "1.234.000" (không ký hiệu, dùng trên bill in nhiệt). */
export function formatNumberVi(amount: number): string {
  return numberFormatter.format(amount);
}

/** "80k", "1,2tr", "1,5tỷ" cho giao diện gọn. */
export function formatVndCompact(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}${trimDecimal(abs / 1_000_000_000)}tỷ`;
  if (abs >= 1_000_000) return `${sign}${trimDecimal(abs / 1_000_000)}tr`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}k`;
  return `${sign}${abs}`;
}

function trimDecimal(value: number): string {
  return (Math.round(value * 10) / 10).toString().replace('.', ',');
}

/** Phân tích chuỗi tiền Việt ("1.234.000", "1,234,000 đ", "1234000") thành số nguyên đồng. */
export function parseVnd(input: string): number | null {
  const digits = input.replace(/[^\d-]/g, '');
  if (!digits || digits === '-') return null;
  const value = Number(digits);
  return Number.isSafeInteger(value) ? value : null;
}
