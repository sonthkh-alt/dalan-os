import { assertAmount } from './money.js';

/**
 * Chia một số tiền thành n phần nguyên bằng nhau nhất có thể, tổng đúng bằng amount.
 * Phần dư (tối đa n-1 đồng) dồn vào các phần đầu.
 */
export function splitEqual(amount: number, parts: number): number[] {
  assertAmount(amount);
  if (!Number.isInteger(parts) || parts <= 0) throw new RangeError('parts phải là số nguyên dương');
  const base = Math.floor(amount / parts);
  const remainder = amount - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < remainder ? 1 : 0));
}

/**
 * Phân bổ amount theo trọng số (phương pháp số dư lớn nhất), tổng đúng bằng amount.
 * Trọng số 0 nhận 0. Nếu tổng trọng số bằng 0, phần tử đầu nhận toàn bộ.
 */
export function allocateProportional(amount: number, weights: number[]): number[] {
  assertAmount(amount);
  if (weights.length === 0) return [];
  const totalWeight = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
  if (totalWeight === 0) {
    return weights.map((_, i) => (i === 0 ? amount : 0));
  }
  const raw = weights.map((w) => (amount * Math.max(0, w)) / totalWeight);
  const floors = raw.map((v) => Math.floor(v));
  let remainder = amount - floors.reduce((s, v) => s + v, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floors[i] = (floors[i] ?? 0) + 1;
    remainder -= 1;
  }
  return floors;
}
