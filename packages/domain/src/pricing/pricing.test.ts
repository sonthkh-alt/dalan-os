import { describe, expect, it } from 'vitest';
import { computeLinePricing, validateModifierSelection } from './pricing.js';

describe('pricing', () => {
  it('FIXED nhân số lượng', () => {
    const r = computeLinePricing({ pricingMode: 'FIXED', basePrice: 25_000, quantity: 10 });
    expect(r.lineTotal).toBe(250_000);
  });

  it('VARIANT dùng giá biến thể (Gà ri luộc rút xương cỡ lớn)', () => {
    const r = computeLinePricing({ pricingMode: 'VARIANT', basePrice: null, variantPrice: 550_000, quantity: 1 });
    expect(r.unitPrice).toBe(550_000);
    expect(r.lineTotal).toBe(550_000);
  });

  it('WEIGHT tính theo kg với 3 số lẻ (Cua gạch 1,2 kg rang me)', () => {
    const r = computeLinePricing({
      pricingMode: 'WEIGHT',
      basePrice: 1_195_000,
      quantity: 1.2,
      modifiers: [
        { groupCode: 'CHE_BIEN', groupName: 'Chế biến', optionCode: 'RANG_ME', optionName: 'Rang me', priceDelta: 0 },
      ],
    });
    expect(r.quantity).toBe(1.2);
    expect(r.lineTotal).toBe(1_434_000);
  });

  it('WEIGHT làm tròn tới đồng', () => {
    const r = computeLinePricing({ pricingMode: 'WEIGHT', basePrice: 995_000, quantity: 0.333 });
    expect(r.lineTotal).toBe(331_335);
  });

  it('MARKET yêu cầu giá nhập', () => {
    expect(() => computeLinePricing({ pricingMode: 'MARKET', basePrice: null, quantity: 1 })).toThrow(/enteredPrice/);
    const r = computeLinePricing({ pricingMode: 'MARKET', basePrice: null, enteredPrice: 2_400_000, quantity: 2 });
    expect(r.lineTotal).toBe(4_800_000);
  });

  it('tùy chọn cộng thêm nhân theo số lượng', () => {
    const r = computeLinePricing({
      pricingMode: 'FIXED',
      basePrice: 30_000,
      quantity: 2,
      modifiers: [{ groupCode: 'SIZE', groupName: 'Cỡ', optionCode: 'L', optionName: 'Lớn', priceDelta: 10_000 }],
    });
    expect(r.modifiersTotal).toBe(20_000);
    expect(r.lineTotal).toBe(80_000);
  });

  it('không cho số lượng lẻ với món đếm suất', () => {
    expect(() => computeLinePricing({ pricingMode: 'FIXED', basePrice: 1000, quantity: 1.5 })).toThrow();
  });

  it('validateModifierSelection kiểm tra bắt buộc, tối đa, nhóm lạ', () => {
    const groups = [
      { code: 'CHE_BIEN', isRequired: true, minSelect: 1, maxSelect: 1, optionCodes: ['HAP', 'RANG_ME'] },
      { code: 'THEM', isRequired: false, minSelect: 0, maxSelect: 2, optionCodes: ['A', 'B', 'C'] },
    ];
    expect(validateModifierSelection(groups, [])).toEqual(['Nhóm CHE_BIEN cần chọn ít nhất 1']);
    expect(validateModifierSelection(groups, [{ groupCode: 'CHE_BIEN', optionCode: 'HAP' }])).toEqual([]);
    expect(
      validateModifierSelection(groups, [
        { groupCode: 'CHE_BIEN', optionCode: 'HAP' },
        { groupCode: 'THEM', optionCode: 'A' },
        { groupCode: 'THEM', optionCode: 'B' },
        { groupCode: 'THEM', optionCode: 'C' },
      ]),
    ).toEqual(['Nhóm THEM chỉ được chọn tối đa 2']);
    expect(validateModifierSelection(groups, [{ groupCode: 'CHE_BIEN', optionCode: 'XYZ' }])).toContain(
      'Tùy chọn XYZ không thuộc nhóm CHE_BIEN',
    );
    expect(
      validateModifierSelection(groups, [
        { groupCode: 'CHE_BIEN', optionCode: 'HAP' },
        { groupCode: 'LA', optionCode: 'X' },
      ]),
    ).toContain('Nhóm LA không áp dụng cho món này');
  });
});
