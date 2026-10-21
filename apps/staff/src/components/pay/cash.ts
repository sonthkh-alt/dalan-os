/** Tiện ích thu tiền mặt VND: gợi ý mệnh giá khách hay đưa và tính tiền thừa. */

/** Bước làm tròn lên khách hay đưa: 50 nghìn, 100 nghìn, 500 nghìn. */
export const ROUND_STEPS = [50_000, 100_000, 500_000] as const;
/** Tờ tiền lớn thường gặp. */
export const COMMON_NOTES = [200_000, 500_000, 1_000_000, 2_000_000] as const;

/**
 * Gợi ý số tiền khách đưa: đúng số tiền, làm tròn lên 50k/100k/500k, và các tờ lớn hơn số phải thu.
 * Không trùng, tăng dần, tối đa `limit` gợi ý.
 */
export function quickTenders(due: number, limit = 6): number[] {
  if (!(due > 0)) return [];
  const set = new Set<number>([due]);
  for (const step of ROUND_STEPS) set.add(Math.ceil(due / step) * step);
  for (const note of COMMON_NOTES) if (note > due) set.add(note);
  return [...set].sort((a, b) => a - b).slice(0, limit);
}

/** Số tiền ghi nhận và tiền thừa khi khách đưa `tendered` cho khoản `due`. */
export function cashOutcome(tendered: number, due: number): { amount: number; change: number; short: number } {
  const t = Math.max(0, Math.round(tendered || 0));
  const amount = Math.min(t, Math.max(0, due));
  return { amount, change: Math.max(0, t - due), short: Math.max(0, due - t) };
}
