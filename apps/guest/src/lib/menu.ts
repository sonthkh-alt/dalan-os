import type { BranchMenuItemView, BranchMenuView } from '@dalan/contracts';
import { formatVnd } from './format';

export interface MenuCategoryFlat {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  isOpenNow: boolean;
  menuName: string;
  menuKind: string;
  /** Khung giờ bán (nếu thực đơn/nhóm có lịch) */
  hours: string | null;
  items: BranchMenuItemView[];
}

function hoursOf(schedule: { from?: string; to?: string } | undefined): string | null {
  return schedule?.from && schedule.to ? `${schedule.from}–${schedule.to}` : null;
}

/** Trải phẳng thực đơn thành danh sách nhóm; thực đơn đang mở bán xếp trước. */
export function flattenMenu(view: BranchMenuView): MenuCategoryFlat[] {
  const open = view.menus.filter((m) => m.isOpenNow);
  const closed = view.menus.filter((m) => !m.isOpenNow);
  return [...open, ...closed].flatMap((m) =>
    m.categories.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      nameEn: c.nameEn,
      isOpenNow: m.isOpenNow && c.isOpenNow,
      menuName: m.name,
      menuKind: m.kind,
      hours: hoursOf(c.schedule) ?? hoursOf(m.schedule),
      items: c.items,
    })),
  );
}

export interface PriceParts {
  /** "từ" khi món có nhiều cỡ giá khác nhau */
  from?: boolean;
  amount: string | null;
  /** "/kg", "/đĩa"... */
  unit?: string;
  /** Giá thời điểm: không có số tiền */
  market?: boolean;
  weight?: boolean;
}

export function priceParts(item: BranchMenuItemView): PriceParts {
  if (item.pricingMode === 'MARKET' || item.pricingMode === 'OPEN') return { amount: null, market: true };
  if (item.pricingMode === 'VARIANT') {
    const prices = item.variants.map((v) => v.price);
    if (prices.length === 0) return { amount: null };
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return { amount: formatVnd(min), from: min !== max };
  }
  if (item.price === null) return { amount: null };
  return { amount: formatVnd(item.price), unit: item.unit, weight: item.pricingMode === 'WEIGHT' };
}

/** Món có thể thêm nhanh (không cần chọn cỡ / tùy chọn bắt buộc, không phải giá thời điểm). */
export function isQuickAdd(item: BranchMenuItemView): boolean {
  if (item.soldOut || item.price === null || item.pricingMode !== 'FIXED' || item.variants.length > 0) return false;
  return !item.modifierGroups.some((g) => g.isRequired || g.minSelect > 0);
}

const DRINK_PREFIX = 'DR_';
const SIDE_CODES = new Set(['XOI', 'COM', 'MON_RAU', 'MON_CANH', 'BANH', 'NOM_SALAD']);

/** "Thường gọi kèm": đồ uống, món ăn kèm và món đặc trưng còn bán, chưa có trong giỏ. */
export function pickUpsell(view: BranchMenuView | undefined, excludeItemIds: Set<string>, limit = 8): BranchMenuItemView[] {
  if (!view) return [];
  const cats = flattenMenu(view).filter((c) => c.isOpenNow);
  const seen = new Set<string>();
  const take = (pred: (c: MenuCategoryFlat, i: BranchMenuItemView) => boolean) =>
    cats.flatMap((c) => c.items.filter((i) => pred(c, i))).filter((i) => {
      if (seen.has(i.id) || excludeItemIds.has(i.id) || i.soldOut || i.pricingMode === 'MARKET' || i.pricingMode === 'OPEN') return false;
      seen.add(i.id);
      return true;
    });
  const drinks = take((c) => c.code.startsWith(DRINK_PREFIX) || c.menuKind === 'DRINKS').slice(0, 4);
  const sides = take((c) => SIDE_CODES.has(c.code)).slice(0, 2);
  const signature = take((_, i) => i.isSignature).slice(0, 3);
  // Xen kẽ để hàng gợi ý đa dạng
  const out: BranchMenuItemView[] = [];
  for (let k = 0; out.length < limit && k < 4; k++) {
    for (const list of [drinks, signature, sides]) if (list[k] && out.length < limit) out.push(list[k]!);
  }
  return out;
}
