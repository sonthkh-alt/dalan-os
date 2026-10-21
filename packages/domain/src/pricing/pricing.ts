import { assertAmount, roundHalfAwayFromZero } from '../money/money.js';

export type PricingMode = 'FIXED' | 'VARIANT' | 'WEIGHT' | 'MARKET' | 'OPEN';

export interface ModifierSelection {
  groupCode: string;
  groupName: string;
  optionCode: string;
  optionName: string;
  priceDelta: number;
}

export interface LinePricingInput {
  pricingMode: PricingMode;
  /** Giá cơ bản (FIXED) hoặc giá trên kg (WEIGHT). */
  basePrice: number | null;
  /** Giá biến thể đã chọn (VARIANT). */
  variantPrice?: number | null;
  /** Giá nhân viên nhập (MARKET, OPEN). */
  enteredPrice?: number | null;
  /** Số lượng (số suất) hoặc trọng lượng kg với WEIGHT, tối đa 3 chữ số thập phân. */
  quantity: number;
  modifiers?: ModifierSelection[];
}

export interface LinePricing {
  unitPrice: number;
  quantity: number;
  modifiersPerUnit: number;
  modifiersTotal: number;
  lineTotal: number;
}

/** Làm tròn số lượng về 3 chữ số thập phân (kg) hoặc số nguyên với món đếm. */
export function normalizeQuantity(quantity: number, allowFraction: boolean): number {
  if (!Number.isFinite(quantity) || quantity <= 0) throw new RangeError('quantity phải lớn hơn 0');
  if (!allowFraction) {
    if (!Number.isInteger(quantity)) throw new RangeError('quantity phải là số nguyên với món đếm suất');
    return quantity;
  }
  return Math.round(quantity * 1000) / 1000;
}

/** Tính tiền một dòng món theo chế độ giá. Mọi kết quả là số nguyên đồng. */
export function computeLinePricing(input: LinePricingInput): LinePricing {
  const modifiers = input.modifiers ?? [];
  const modifiersPerUnit = modifiers.reduce((sum, m) => sum + assertAmount(m.priceDelta, 'priceDelta'), 0);

  let unitPrice: number;
  switch (input.pricingMode) {
    case 'FIXED':
      unitPrice = requirePrice(input.basePrice, 'basePrice');
      break;
    case 'VARIANT':
      unitPrice = requirePrice(input.variantPrice, 'variantPrice');
      break;
    case 'WEIGHT':
      unitPrice = requirePrice(input.basePrice, 'basePrice (giá/kg)');
      break;
    case 'MARKET':
    case 'OPEN':
      unitPrice = requirePrice(input.enteredPrice, 'enteredPrice');
      break;
  }

  const allowFraction = input.pricingMode === 'WEIGHT';
  const quantity = normalizeQuantity(input.quantity, allowFraction);
  const modifiersTotal = roundHalfAwayFromZero(modifiersPerUnit * quantity);
  const lineTotal = roundHalfAwayFromZero(unitPrice * quantity) + modifiersTotal;
  return { unitPrice, quantity, modifiersPerUnit, modifiersTotal, lineTotal };
}

function requirePrice(value: number | null | undefined, label: string): number {
  if (value === null || value === undefined) throw new RangeError(`Thiếu ${label}`);
  assertAmount(value, label);
  if (value < 0) throw new RangeError(`${label} không được âm`);
  return value;
}

export interface ModifierGroupRule {
  code: string;
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  optionCodes: string[];
}

/** Kiểm tra lựa chọn tùy chọn hợp lệ theo luật nhóm; trả về danh sách lỗi (rỗng nếu hợp lệ). */
export function validateModifierSelection(
  groups: ModifierGroupRule[],
  selections: Pick<ModifierSelection, 'groupCode' | 'optionCode'>[],
): string[] {
  const errors: string[] = [];
  for (const group of groups) {
    const chosen = selections.filter((s) => s.groupCode === group.code);
    for (const s of chosen) {
      if (!group.optionCodes.includes(s.optionCode)) {
        errors.push(`Tùy chọn ${s.optionCode} không thuộc nhóm ${group.code}`);
      }
    }
    const min = group.isRequired ? Math.max(1, group.minSelect) : group.minSelect;
    if (chosen.length < min) errors.push(`Nhóm ${group.code} cần chọn ít nhất ${min}`);
    if (group.maxSelect > 0 && chosen.length > group.maxSelect) {
      errors.push(`Nhóm ${group.code} chỉ được chọn tối đa ${group.maxSelect}`);
    }
  }
  const knownGroups = new Set(groups.map((g) => g.code));
  for (const s of selections) {
    if (!knownGroups.has(s.groupCode)) errors.push(`Nhóm ${s.groupCode} không áp dụng cho món này`);
  }
  return errors;
}
