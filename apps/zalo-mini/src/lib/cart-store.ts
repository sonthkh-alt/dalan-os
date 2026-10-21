/** Giỏ món tại bàn — cùng logic với app khách web (apps/guest/src/lib/cart-store.ts). */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { computeLinePricing, type PricingMode } from '@dalan/domain';

export interface CartModifier {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceDelta: number;
}

export interface CartLine {
  key: string;
  itemId: string;
  name: string;
  nameEn: string | null;
  unit: string;
  pricingMode: PricingMode;
  /** Giá cơ bản hoặc giá/kg; null với món giá thời điểm */
  basePrice: number | null;
  variantId: string | null;
  variantName: string | null;
  variantPrice: number | null;
  modifiers: CartModifier[];
  quantity: number;
  note: string;
}

export interface CartState {
  sessionId: string | null;
  lines: CartLine[];
  orderNote: string;
  bindSession: (sessionId: string | null) => void;
  add: (line: Omit<CartLine, 'key'>) => void;
  setQuantity: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  setOrderNote: (note: string) => void;
  clear: () => void;
}

/** Tiền tạm tính của một dòng giỏ (cùng công thức với API). */
export function cartLineTotal(
  line: Pick<CartLine, 'pricingMode' | 'basePrice' | 'variantPrice' | 'quantity' | 'modifiers'>,
): number {
  if (line.pricingMode === 'MARKET' || line.pricingMode === 'OPEN') return 0;
  try {
    return computeLinePricing({
      pricingMode: line.pricingMode,
      basePrice: line.basePrice,
      variantPrice: line.variantPrice,
      quantity: line.quantity,
      modifiers: line.modifiers.map((m) => ({
        groupCode: m.groupId,
        groupName: m.groupName,
        optionCode: m.optionId,
        optionName: m.optionName,
        priceDelta: m.priceDelta,
      })),
    }).lineTotal;
  } catch {
    return 0;
  }
}

export function cartTotal(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + cartLineTotal(l), 0);
}

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + (l.pricingMode === 'WEIGHT' ? 1 : l.quantity), 0);
}

function lineKey(line: Omit<CartLine, 'key'>): string {
  const mods = [...line.modifiers]
    .map((m) => m.optionId)
    .sort()
    .join(',');
  return `${line.itemId}|${line.variantId ?? ''}|${mods}|${line.note.trim()}`;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      sessionId: null,
      lines: [],
      orderNote: '',
      bindSession: (sessionId) => {
        if (get().sessionId !== sessionId) set({ sessionId, lines: [], orderNote: '' });
      },
      add: (line) => {
        const key = lineKey(line);
        const existing = get().lines.find((l) => l.key === key);
        if (existing && line.pricingMode !== 'WEIGHT') {
          set({
            lines: get().lines.map((l) =>
              l.key === key ? { ...l, quantity: l.quantity + line.quantity } : l,
            ),
          });
        } else {
          set({
            lines: [...get().lines, { ...line, key: existing ? `${key}|${Date.now()}` : key }],
          });
        }
      },
      setQuantity: (key, quantity) => {
        if (quantity <= 0) set({ lines: get().lines.filter((l) => l.key !== key) });
        else set({ lines: get().lines.map((l) => (l.key === key ? { ...l, quantity } : l)) });
      },
      remove: (key) => set({ lines: get().lines.filter((l) => l.key !== key) }),
      setOrderNote: (orderNote) => set({ orderNote }),
      clear: () => set({ lines: [], orderNote: '' }),
    }),
    { name: 'dalan-zalo-cart', version: 1 },
  ),
);
