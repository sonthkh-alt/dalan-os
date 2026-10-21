import { describe, expect, it } from 'vitest';
import { earnPoints, redeemablePoints, resolveTier } from './loyalty.js';

describe('tích điểm', () => {
  it('10.000đ = 1 điểm, hạng Vàng 1.5x', () => {
    expect(earnPoints(945_000, { vndPerPoint: 10_000 })).toBe(94);
    expect(earnPoints(945_000, { vndPerPoint: 10_000, multiplierBps: 15_000 })).toBe(141);
  });
  it('đổi điểm giới hạn theo phần trăm bill', () => {
    expect(redeemablePoints(500, 1_000_000, { vndPerPoint: 1_000, maxBillShareBps: 3000 })).toEqual({
      points: 300,
      amount: 300_000,
    });
    expect(redeemablePoints(100, 1_000_000, { vndPerPoint: 1_000 })).toEqual({ points: 100, amount: 100_000 });
  });
  it('xếp hạng', () => {
    const tiers = [
      { code: 'MEMBER', minSpend12m: 0 },
      { code: 'SILVER', minSpend12m: 10_000_000 },
      { code: 'GOLD', minSpend12m: 30_000_000 },
    ];
    expect(resolveTier(5_000_000, tiers)).toBe('MEMBER');
    expect(resolveTier(31_000_000, tiers)).toBe('GOLD');
  });
});
