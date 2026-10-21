/** Logic thuần cho két tiền: mệnh giá VND, tổng đếm, chênh lệch so với dự kiến. */

/** Mệnh giá tiền Việt Nam đang lưu hành (đồng). */
export const VND_DENOMS = [500_000, 200_000, 100_000, 50_000, 20_000, 10_000, 5_000, 2_000, 1_000] as const;

export function sumDenoms(counts: Record<number, number>): number {
  return VND_DENOMS.reduce((s, d) => s + d * Math.max(0, Math.floor(counts[d] ?? 0)), 0);
}

export type VarianceTone = 'match' | 'over' | 'short';

/** Chênh lệch = tiền đếm − tiền dự kiến. Dương: thừa, âm: thiếu. */
export function cashVariance(counted: number, expected: number): { amount: number; tone: VarianceTone } {
  const amount = Math.round(counted - expected);
  return { amount, tone: amount === 0 ? 'match' : amount > 0 ? 'over' : 'short' };
}
