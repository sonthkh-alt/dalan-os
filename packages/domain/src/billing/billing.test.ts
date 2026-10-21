import { describe, expect, it } from 'vitest';
import { cashChange, computeBill, settlement } from './billing.js';
import { reconcileEmpties } from './empties.js';

describe('computeBill', () => {
  it('ví dụ nghiệm thu E4: 1.000.000, giảm 10%, phí phục vụ 5%, VAT 8% gồm trong giá', () => {
    const r = computeBill({
      lines: [
        { id: 'a', amount: 600_000, vatRateBps: 800 },
        { id: 'b', amount: 400_000, vatRateBps: 800 },
      ],
      discounts: [{ kind: 'PERCENT', valueBps: 1000, reason: 'Khách quen' }],
      serviceChargeBps: 500,
      defaultVatBps: 800,
      priceIncludesVat: true,
    });
    expect(r.subtotal).toBe(1_000_000);
    expect(r.billDiscountTotal).toBe(100_000);
    expect(r.serviceChargeAmount).toBe(45_000);
    expect(r.total).toBe(945_000);
    expect(r.vatAmount).toBe(70_000);
    expect(r.lineAllocations.map((l) => l.discountAmount)).toEqual([60_000, 40_000]);
  });

  it('giá chưa gồm VAT cộng thuế vào tổng, nhiều mức thuế', () => {
    const r = computeBill({
      lines: [
        { id: 'food', amount: 1_000_000, vatRateBps: 800 },
        { id: 'wine', amount: 500_000, vatRateBps: 1000 },
      ],
      defaultVatBps: 800,
      priceIncludesVat: false,
    });
    expect(r.taxBreakdown).toEqual([
      { rateBps: 800, taxable: 1_000_000, vat: 80_000 },
      { rateBps: 1000, taxable: 500_000, vat: 50_000 },
    ]);
    expect(r.total).toBe(1_630_000);
  });

  it('giảm giá số tiền bị chặn bởi phần còn lại và giảm dòng được trừ trước', () => {
    const r = computeBill({
      lines: [{ id: 'a', amount: 200_000, discountAmount: 50_000, vatRateBps: 800 }],
      discounts: [{ kind: 'VOUCHER', amount: 500_000 }],
      defaultVatBps: 800,
      priceIncludesVat: true,
    });
    expect(r.lineDiscountTotal).toBe(50_000);
    expect(r.billDiscountTotal).toBe(150_000);
    expect(r.total).toBe(0);
  });

  it('phụ thu phòng VIP khi chưa đạt mức tối thiểu', () => {
    const r = computeBill({
      lines: [{ id: 'a', amount: 3_000_000, vatRateBps: 800 }],
      minSpend: 5_000_000,
      defaultVatBps: 800,
      priceIncludesVat: true,
    });
    expect(r.minSpendSurcharge).toBe(2_000_000);
    expect(r.total).toBe(5_000_000);
  });

  it('làm tròn chỉ áp dụng trên tổng', () => {
    const r = computeBill({
      lines: [{ id: 'a', amount: 123_456, vatRateBps: 800 }],
      defaultVatBps: 800,
      priceIncludesVat: true,
      rounding: 'TO_1000',
    });
    expect(r.totalBeforeRounding).toBe(123_456);
    expect(r.total).toBe(123_000);
    expect(r.roundingAdjustment).toBe(-456);
  });

  it('từ chối giảm giá dòng vượt tiền dòng', () => {
    expect(() =>
      computeBill({
        lines: [{ id: 'a', amount: 100, discountAmount: 200, vatRateBps: 800 }],
        defaultVatBps: 800,
        priceIncludesVat: true,
      }),
    ).toThrow();
  });
});

describe('settlement và tiền mặt', () => {
  it('tính đã thu, còn thu, trạng thái', () => {
    const s = settlement(945_000, [
      { amount: 500_000, status: 'SUCCEEDED' },
      { amount: 445_000, status: 'PENDING' },
    ]);
    expect(s).toEqual({ paid: 500_000, due: 445_000, isPaid: false });
    expect(settlement(945_000, [{ amount: 945_000, status: 'SUCCEEDED' }]).isPaid).toBe(true);
    expect(settlement(100, [{ amount: 100, status: 'PARTIALLY_REFUNDED', refundedAmount: 30 }]).paid).toBe(70);
  });
  it('tiền thừa', () => {
    expect(cashChange(945_000, 1_000_000)).toBe(55_000);
    expect(() => cashChange(945_000, 900_000)).toThrow();
  });
});

describe('đếm vỏ', () => {
  it('ví dụ E4: gọi 10 bia, đếm 12 vỏ → thêm 2', () => {
    expect(reconcileEmpties([{ itemId: 'tiger', orderedQty: 10, countedQty: 12 }])).toEqual([
      { itemId: 'tiger', delta: 2 },
    ]);
    expect(reconcileEmpties([{ itemId: 'tiger', orderedQty: 10, countedQty: 10 }])).toEqual([]);
    expect(reconcileEmpties([{ itemId: 'nuoc', orderedQty: 5, countedQty: 3 }])).toEqual([{ itemId: 'nuoc', delta: -2 }]);
  });
});
