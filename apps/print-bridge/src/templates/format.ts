import { formatNumberVi } from '@dalan/domain';
import type { ModifierSnapshot } from '../types.js';

const TZ = 'Asia/Ho_Chi_Minh';
const timeFmt = new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dateTimeFmt = new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dateFmt = new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
const qtyFmt = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 });

/** 1.234.000 (không ký hiệu, dùng trên bill) */
export const money = (n: number | null | undefined): string => formatNumberVi(Math.round(Number(n ?? 0)));
/** 1.234.000đ */
export const moneyD = (n: number | null | undefined): string => `${money(n)}đ`;
export const qty = (n: number | null | undefined): string => qtyFmt.format(Number(n ?? 0));
export const time = (iso: string | null | undefined): string => (iso ? timeFmt.format(new Date(iso)) : '');
export const dateTime = (iso: string | null | undefined): string => (iso ? dateTimeFmt.format(new Date(iso)) : '');
export const date = (iso: string | null | undefined): string => (iso ? dateFmt.format(new Date(iso)) : '');
export const percent = (bps: number): string => `${(bps / 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%`;

/** Chuỗi tùy chọn: "Rang me, Ít cay" từ snapshot hoặc mảng chuỗi. */
export function modifiersText(mods: unknown): string {
  if (!Array.isArray(mods)) return '';
  return mods
    .map((m) => (typeof m === 'string' ? m : (m as ModifierSnapshot)?.optionName ?? ''))
    .filter((s) => s.length > 0)
    .join(', ');
}

export const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Tiền mặt',
  BANK_TRANSFER: 'Chuyển khoản',
  CARD_TERMINAL: 'Thẻ',
  VNPAY: 'VNPay',
  MOMO: 'MoMo',
  ZALOPAY: 'ZaloPay',
  APPLE_PAY: 'Apple Pay',
  GOOGLE_PAY: 'Google Pay',
  VOUCHER: 'Voucher',
  POINTS: 'Điểm thành viên',
  DEPOSIT: 'Tiền đặt cọc',
  CREDIT: 'Công nợ',
};

export const SUB_METHOD_LABELS: Record<string, string> = {
  APPLE_PAY: 'Apple Pay',
  GOOGLE_PAY: 'Google Pay',
  SAMSUNG_PAY: 'Samsung Pay',
  CONTACTLESS: 'Không tiếp xúc',
  CHIP: 'Chip',
  SWIPE: 'Quẹt thẻ',
};

export const VOID_REASONS: Record<string, string> = {
  GUEST_CHANGED_MIND: 'Khách đổi ý',
  OUT_OF_STOCK: 'Bếp hết món',
  WRONG_ORDER: 'Gọi nhầm',
  QUALITY_COMPLAINT: 'Khách phàn nàn chất lượng',
  OTHER: 'Lý do khác',
};

export const DISCOUNT_LABELS: Record<string, string> = {
  PERCENT: 'Giảm giá',
  AMOUNT: 'Giảm giá',
  VOUCHER: 'Voucher',
  POINTS: 'Đổi điểm',
  PROMOTION: 'Khuyến mãi',
  GOODWILL: 'Giảm thiện chí',
};

export function paymentLabel(method: string, subMethod?: string | null): string {
  const base = PAYMENT_LABELS[method] ?? method;
  return subMethod && SUB_METHOD_LABELS[subMethod] ? `${base} (${SUB_METHOD_LABELS[subMethod]})` : base;
}
