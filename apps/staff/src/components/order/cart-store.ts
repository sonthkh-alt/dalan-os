'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BranchMenuItemView } from '@dalan/contracts';
import { computeLinePricing, type PricingMode } from '@dalan/domain';

/** Dòng trong giỏ nháp (chưa gửi bếp), lưu cục bộ theo phiên để không mất khi đổi màn hình. */
export interface CartLine {
  key: string;
  itemId: string;
  name: string;
  unit: string;
  pricingMode: PricingMode;
  basePrice: number | null;
  variantId?: string;
  variantName?: string;
  variantPrice?: number;
  modifiers: { groupId: string; groupCode: string; groupName: string; optionId: string; optionCode: string; optionName: string; priceDelta: number }[];
  quantity: number;
  enteredPrice?: number;
  customName?: string;
  note?: string;
  course: number;
  seatNo?: number;
}

export function cartLineTotal(line: CartLine): number {
  try {
    return computeLinePricing({ pricingMode: line.pricingMode, basePrice: line.basePrice, variantPrice: line.variantPrice ?? null, enteredPrice: line.enteredPrice ?? null, quantity: line.quantity, modifiers: line.modifiers.map((m) => ({ groupCode: m.groupCode, groupName: m.groupName, optionCode: m.optionCode, optionName: m.optionName, priceDelta: m.priceDelta })) }).lineTotal;
  } catch {
    return 0;
  }
}

export function cartLineLabel(line: CartLine): string {
  const parts = [line.customName ?? line.name];
  if (line.variantName) parts.push(`(${line.variantName})`);
  return parts.join(' ');
}

interface CartState {
  carts: Record<string, CartLine[]>;
  add: (sessionId: string, line: CartLine) => void;
  update: (sessionId: string, key: string, patch: Partial<CartLine>) => void;
  remove: (sessionId: string, key: string) => void;
  clear: (sessionId: string) => void;
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      carts: {},
      add: (sessionId, line) =>
        set((s) => {
          const list = s.carts[sessionId] ?? [];
          // Gộp dòng giống hệt (cùng món, biến thể, tùy chọn, ghi chú, đợt) với món đếm suất
          const same = list.find((l) => l.itemId === line.itemId && l.variantId === line.variantId && l.note === line.note && l.course === line.course && l.pricingMode !== 'WEIGHT' && l.pricingMode !== 'MARKET' && l.pricingMode !== 'OPEN' && JSON.stringify(l.modifiers.map((m) => m.optionId)) === JSON.stringify(line.modifiers.map((m) => m.optionId)));
          const next = same ? list.map((l) => (l.key === same.key ? { ...l, quantity: l.quantity + line.quantity } : l)) : [...list, line];
          return { carts: { ...s.carts, [sessionId]: next } };
        }),
      update: (sessionId, key, patch) => set((s) => ({ carts: { ...s.carts, [sessionId]: (s.carts[sessionId] ?? []).map((l) => (l.key === key ? { ...l, ...patch } : l)) } })),
      remove: (sessionId, key) => set((s) => ({ carts: { ...s.carts, [sessionId]: (s.carts[sessionId] ?? []).filter((l) => l.key !== key) } })),
      clear: (sessionId) =>
        set((s) => {
          const carts = { ...s.carts };
          delete carts[sessionId];
          return { carts };
        }),
    }),
    { name: 'dalan-staff-cart' },
  ),
);

export function toOrderLine(line: CartLine) {
  return {
    itemId: line.itemId,
    variantId: line.variantId,
    quantity: line.quantity,
    enteredPrice: line.enteredPrice,
    customName: line.customName,
    modifiers: line.modifiers.map((m) => ({ groupId: m.groupId, optionId: m.optionId })),
    note: line.note,
    course: line.course,
    seatNo: line.seatNo,
  };
}

export function defaultLineFor(item: BranchMenuItemView, course = 1): CartLine {
  const variant = item.variants.find((v) => v.isDefault) ?? item.variants[0];
  return {
    key: `${item.id}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    itemId: item.id,
    name: item.name,
    unit: item.unit,
    pricingMode: item.pricingMode as PricingMode,
    basePrice: item.price,
    variantId: item.pricingMode === 'VARIANT' ? variant?.id : undefined,
    variantName: item.pricingMode === 'VARIANT' ? variant?.name : undefined,
    variantPrice: item.pricingMode === 'VARIANT' ? variant?.price : undefined,
    modifiers: item.modifierGroups.flatMap((g) => {
      const d = g.options.find((o) => o.isDefault);
      return g.isRequired && d ? [{ groupId: g.id, groupCode: g.code, groupName: g.name, optionId: d.id, optionCode: d.code, optionName: d.name, priceDelta: d.priceDelta }] : [];
    }),
    quantity: item.pricingMode === 'WEIGHT' ? 1 : 1,
    course,
  };
}

/** Món cần hộp cấu hình trước khi thêm (biến thể, tùy chọn, cân, giá thời điểm). */
export function needsConfig(item: BranchMenuItemView): boolean {
  return item.pricingMode !== 'FIXED' || item.modifierGroups.length > 0;
}
