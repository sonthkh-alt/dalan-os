import { applyBps, assertAmount } from '../money/money.js';

export interface EarnRule {
  /** Số đồng cho 1 điểm, ví dụ 10 000. */
  vndPerPoint: number;
  /** Hệ số theo hạng, 10 000 = 1x, 15 000 = 1.5x. */
  multiplierBps?: number;
}

/** Điểm tích được từ số tiền thanh toán (làm tròn xuống). */
export function earnPoints(paidAmount: number, rule: EarnRule): number {
  assertAmount(paidAmount);
  if (rule.vndPerPoint <= 0) throw new RangeError('vndPerPoint phải dương');
  const base = Math.floor(paidAmount / rule.vndPerPoint);
  return Math.floor(applyBps(base, rule.multiplierBps ?? 10_000));
}

export interface RedeemRule {
  /** Giá trị 1 điểm khi đổi, ví dụ 1 000đ. */
  vndPerPoint: number;
  /** Tối đa bao nhiêu phần trăm bill được trả bằng điểm (bps). */
  maxBillShareBps?: number;
}

/** Số điểm có thể dùng và số tiền giảm tương ứng cho một bill. */
export function redeemablePoints(
  balance: number,
  billTotal: number,
  rule: RedeemRule,
): { points: number; amount: number } {
  assertAmount(billTotal);
  if (balance <= 0 || billTotal <= 0) return { points: 0, amount: 0 };
  const cap = rule.maxBillShareBps ? applyBps(billTotal, rule.maxBillShareBps) : billTotal;
  const maxPointsByCap = Math.floor(cap / rule.vndPerPoint);
  const points = Math.max(0, Math.min(balance, maxPointsByCap));
  return { points, amount: points * rule.vndPerPoint };
}

export interface TierRule {
  code: string;
  minSpend12m: number;
}

/** Xác định hạng theo chi tiêu 12 tháng (hạng có ngưỡng cao nhất mà khách đạt). */
export function resolveTier(spend12m: number, tiers: TierRule[]): string | null {
  const sorted = [...tiers].sort((a, b) => b.minSpend12m - a.minSpend12m);
  return sorted.find((t) => spend12m >= t.minSpend12m)?.code ?? null;
}
