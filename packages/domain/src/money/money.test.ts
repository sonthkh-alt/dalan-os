import { describe, expect, it } from 'vitest';
import { applyBps, formatVnd, formatVndCompact, parseVnd, roundAmount, vatIncludedIn, vatOn } from './money.js';
import { allocateProportional, splitEqual } from './allocate.js';

describe('money', () => {
  it('applyBps tính phần trăm và làm tròn tới đồng', () => {
    expect(applyBps(1_000_000, 1000)).toBe(100_000);
    expect(applyBps(945_000, 500)).toBe(47_250);
    expect(applyBps(333, 3333)).toBe(111);
  });

  it('vatIncludedIn tách thuế trong giá đã gồm VAT', () => {
    expect(vatIncludedIn(1_080_000, 800)).toBe(80_000);
    expect(vatIncludedIn(945_000, 800)).toBe(70_000);
    expect(vatIncludedIn(1_100_000, 1000)).toBe(100_000);
  });

  it('vatOn cộng thuế trên giá chưa gồm VAT', () => {
    expect(vatOn(1_000_000, 800)).toBe(80_000);
  });

  it('roundAmount theo quy tắc cơ sở', () => {
    expect(roundAmount(945_250, 'NONE')).toBe(945_250);
    expect(roundAmount(945_250, 'TO_500')).toBe(945_500);
    expect(roundAmount(945_249, 'TO_500')).toBe(945_000);
    expect(roundAmount(945_499, 'TO_1000')).toBe(945_000);
    expect(roundAmount(945_500, 'TO_1000')).toBe(946_000);
  });

  it('formatVnd và formatVndCompact dùng chuẩn tiếng Việt', () => {
    expect(formatVnd(1_234_000).replace(/ /g, ' ')).toBe('1.234.000 ₫');
    expect(formatVndCompact(1_234_000)).toBe('1,2tr');
    expect(formatVndCompact(80_000)).toBe('80k');
    expect(formatVndCompact(305_000_000)).toBe('305tr');
    expect(formatVndCompact(1_500_000_000)).toBe('1,5tỷ');
  });

  it('parseVnd chấp nhận dấu chấm, phẩy, ký hiệu', () => {
    expect(parseVnd('1.234.000 ₫')).toBe(1_234_000);
    expect(parseVnd('1,234,000')).toBe(1_234_000);
    expect(parseVnd('abc')).toBeNull();
  });

  it('splitEqual chia đều và tổng bằng đúng số gốc', () => {
    expect(splitEqual(100_000, 3)).toEqual([33_334, 33_333, 33_333]);
    expect(splitEqual(945_000, 4)).toEqual([236_250, 236_250, 236_250, 236_250]);
  });

  it('allocateProportional giữ tổng và xử lý trọng số 0', () => {
    expect(allocateProportional(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocateProportional(1000, [0, 0])).toEqual([1000, 0]);
    const parts = allocateProportional(945_000, [350_000, 550_000, 100_000]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(945_000);
  });

  it('từ chối số không an toàn', () => {
    expect(() => applyBps(1.5, 100)).toThrow(RangeError);
  });
});
