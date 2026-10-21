import { describe, expect, it } from 'vitest';
import { cartCount, cartLineTotal, cartTotal, type CartLine } from './cart-store';

const base: Omit<CartLine, 'key' | 'quantity' | 'pricingMode' | 'basePrice'> = {
  itemId: 'i1',
  name: 'Nem Dạ Lan',
  nameEn: null,
  unit: 'cái',
  variantId: null,
  variantName: null,
  variantPrice: null,
  modifiers: [],
  note: '',
};

describe('giỏ hàng khách', () => {
  it('tính tiền dòng cố định, biến thể, theo cân và tùy chọn', () => {
    expect(cartLineTotal({ ...base, pricingMode: 'FIXED', basePrice: 25_000, quantity: 4 })).toBe(100_000);
    expect(cartLineTotal({ ...base, pricingMode: 'VARIANT', basePrice: null, variantPrice: 550_000, quantity: 1 })).toBe(550_000);
    expect(cartLineTotal({ ...base, pricingMode: 'WEIGHT', basePrice: 1_195_000, quantity: 1.2 })).toBe(1_434_000);
    expect(
      cartLineTotal({ ...base, pricingMode: 'FIXED', basePrice: 30_000, quantity: 2, modifiers: [{ groupId: 'g', groupName: 'Cỡ', optionId: 'o', optionName: 'Lớn', priceDelta: 10_000 }] }),
    ).toBe(80_000);
    expect(cartLineTotal({ ...base, pricingMode: 'MARKET', basePrice: null, quantity: 1 })).toBe(0);
  });
  it('tổng giỏ và số món', () => {
    const lines: CartLine[] = [
      { ...base, key: 'a', pricingMode: 'FIXED', basePrice: 25_000, quantity: 4 },
      { ...base, key: 'b', pricingMode: 'WEIGHT', basePrice: 1_000_000, quantity: 0.5 },
    ];
    expect(cartTotal(lines)).toBe(600_000);
    expect(cartCount(lines)).toBe(5);
  });
});
