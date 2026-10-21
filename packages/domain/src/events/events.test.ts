import { describe, expect, it } from 'vitest';
import { banquetKitchenQuantities, buildDepositSchedule, computeEventTotals } from './events.js';

describe('tiệc', () => {
  it('ví dụ nghiệm thu J4: 80 mâm × 3,5tr + dịch vụ 25tr = 305tr; cọc 30% và 40%', () => {
    const totals = computeEventTotals({
      menus: [{ pricePerTable: 3_500_000, tables: 80 }],
      services: [{ unitPrice: 25_000_000, quantity: 1 }],
      vatBps: 800,
      priceIncludesVat: true,
    });
    expect(totals.total).toBe(305_000_000);
    const schedule = buildDepositSchedule(totals.total, [
      { label: 'Cọc đợt 1 khi ký', percentBps: 3000, dueDate: '2026-11-01' },
      { label: 'Cọc đợt 2 trước 7 ngày', percentBps: 4000, dueDate: '2026-12-10' },
    ]);
    expect(schedule.map((s) => s.amount)).toEqual([91_500_000, 122_000_000, 91_500_000]);
    expect(schedule[2]?.label).toBe('Thanh toán còn lại');
  });

  it('phát sinh ngày tiệc: 4 mâm và 30 bia', () => {
    const totals = computeEventTotals({
      menus: [{ pricePerTable: 3_500_000, tables: 80 }],
      services: [{ unitPrice: 25_000_000, quantity: 1 }],
      adjustments: [{ amount: 4 * 3_500_000 }, { amount: 30 * 25_000 }],
      vatBps: 800,
      priceIncludesVat: true,
    });
    expect(totals.total).toBe(305_000_000 + 14_000_000 + 750_000);
  });

  it('định lượng bếp theo mâm gồm dự phòng', () => {
    const q = banquetKitchenQuantities(
      [
        { name: 'Gà quay', quantityPerTable: 1 },
        { name: 'Xôi', quantityPerTable: 0.5, unit: 'đĩa' },
      ],
      80,
      4,
    );
    expect(q[0]?.quantity).toBe(84);
    expect(q[1]?.quantity).toBe(42);
  });
});
