import { isWithinSchedule, matchesSearch, type Schedule } from '@dalan/domain';
// Dữ liệu thực đơn thật của Dạ Lan, nhúng vào bundle lúc build (site tĩnh, không có API).
import rawSeed from '../../../../data/seed/menu-dalan.json';

export type BranchCode = 'CENTER' | 'STAR' | 'EVENT';

export interface SeedBranch {
  code: BranchCode;
  name: string;
  address: string;
  phone: string;
  capacity: number | null;
}

export interface SeedMenu {
  code: string;
  name: string;
  branches: BranchCode[];
  availability: Schedule | null;
}

export interface SeedModifier {
  name: string;
  required?: boolean;
  options: string[];
}

export interface SeedVariant {
  name: string;
  price: number;
}

export interface SeedItem {
  name: string;
  unit: string;
  price?: number | null;
  variants?: SeedVariant[];
  pricingMode?: 'weight' | 'market';
  signature?: boolean;
  vegetarian?: boolean;
  description?: string;
  note?: string;
  modifiers?: SeedModifier[];
  station?: string;
  /** Món chỉ có ở một số thực đơn (ví dụ chỉ ăn sáng Event). */
  menus?: string[];
  ownBrand?: boolean;
}

export interface SeedCategory {
  code: string;
  name: string;
  menu: string;
  alsoMenus?: string[];
  station: string;
  sort: number;
  availability?: Schedule;
  note?: string;
  items: SeedItem[];
}

interface SeedData {
  source: string;
  note: string;
  branches: SeedBranch[];
  menus: SeedMenu[];
  categories: SeedCategory[];
}

const seed = rawSeed as unknown as SeedData;

export const SEED_SOURCE = seed.source;
export const branches: SeedBranch[] = seed.branches;
export const menus: SeedMenu[] = seed.menus;
export const categories: SeedCategory[] = [...seed.categories].sort((a, b) => a.sort - b.sort);
export const totalItems = categories.reduce((sum, c) => sum + c.items.length, 0);

export const BRANCH_SLUGS: Record<BranchCode, string> = {
  CENTER: 'center',
  STAR: 'star',
  EVENT: 'event',
};

export function branchFromSlug(slug: string | undefined): SeedBranch | undefined {
  if (!slug) return undefined;
  return branches.find((b) => b.code.toLowerCase() === slug.toLowerCase());
}

/** Nhóm thực đơn hiển thị thành tab; ăn sáng Center và Event cùng là tab "Ăn sáng". */
export type MenuKind = 'alacarte' | 'breakfast' | 'lunch' | 'drinks';

export function menuKind(code: string): MenuKind {
  if (code.startsWith('BREAKFAST')) return 'breakfast';
  if (code === 'OFFICE_LUNCH') return 'lunch';
  if (code === 'DRINKS') return 'drinks';
  return 'alacarte';
}

export const MENU_KIND_LABEL: Record<MenuKind, string> = {
  alacarte: 'Thực đơn chọn món',
  breakfast: 'Ăn sáng',
  lunch: 'Cơm văn phòng',
  drinks: 'Đồ uống',
};

const KIND_ORDER: MenuKind[] = ['alacarte', 'breakfast', 'lunch', 'drinks'];

export function menusForBranch(code: BranchCode): SeedMenu[] {
  return menus
    .filter((m) => m.branches.includes(code))
    .sort((a, b) => KIND_ORDER.indexOf(menuKind(a.code)) - KIND_ORDER.indexOf(menuKind(b.code)));
}

/** Danh mục thuộc một thực đơn: theo `menu` chính hoặc `alsoMenus`. */
export function categoriesForMenu(menuCode: string): SeedCategory[] {
  return categories.filter((c) => c.menu === menuCode || c.alsoMenus?.includes(menuCode));
}

/** Món có mặt trong thực đơn không (món có `menus` chỉ bán ở các thực đơn đó). */
export function itemInMenu(item: SeedItem, menuCode: string): boolean {
  return !item.menus || item.menus.length === 0 || item.menus.includes(menuCode);
}

export function isServingNow(schedule: Schedule | null | undefined, now: Date): boolean {
  return isWithinSchedule(schedule ?? null, now);
}

const DAY_NAMES = ['', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

/** "06:00–10:00 hằng ngày", "10:30–13:30, Thứ 2 – Thứ 7", "Cả ngày". */
export function describeSchedule(schedule: Schedule | null | undefined): string {
  if (!schedule || (!schedule.days?.length && !schedule.from && !schedule.to)) return 'Cả ngày';
  const time = schedule.from && schedule.to ? `${schedule.from}–${schedule.to}` : '';
  const days = [...(schedule.days ?? [])].sort((a, b) => a - b);
  let dayText = 'hằng ngày';
  if (days.length > 0 && days.length < 7) {
    const contiguous = days.every((d, i) => i === 0 || d === (days[i - 1] ?? 0) + 1);
    dayText =
      contiguous && days.length > 2
        ? `${DAY_NAMES[days[0] ?? 1]} – ${DAY_NAMES[days[days.length - 1] ?? 7]}`
        : days.map((d) => DAY_NAMES[d]).join(', ');
  }
  return time ? `${time}, ${dayText}` : dayText;
}

const SEAFOOD_CATEGORIES = new Set(['HAI_SAN', 'CUA_BE', 'TOM', 'CA', 'CA_HOI']);

export function isSeafood(item: SeedItem, category: SeedCategory): boolean {
  return SEAFOOD_CATEGORIES.has(category.code) || item.station === 'SEAFOOD';
}

export function isSpecialty(item: SeedItem, category: SeedCategory): boolean {
  return item.signature === true || category.code === 'DAC_SAN';
}

/** Giá thấp nhất có thể (giá thường hoặc biến thể rẻ nhất); null nếu chưa có giá. */
export function minPrice(item: SeedItem): number | null {
  if (item.variants?.length) return Math.min(...item.variants.map((v) => v.price));
  return typeof item.price === 'number' ? item.price : null;
}

export type FilterKey = 'vegetarian' | 'specialty' | 'seafood' | 'under100k';

export const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'vegetarian', label: 'Món chay' },
  { key: 'specialty', label: 'Đặc sản' },
  { key: 'seafood', label: 'Hải sản' },
  { key: 'under100k', label: 'Dưới 100.000đ' },
];

export function itemMatches(
  item: SeedItem,
  category: SeedCategory,
  query: string,
  filters: Set<FilterKey>,
): boolean {
  if (query.trim()) {
    const haystack = [
      item.name,
      item.description ?? '',
      category.name,
      ...(item.modifiers?.flatMap((m) => m.options) ?? []),
    ].join(' ');
    if (!matchesSearch(haystack, query)) return false;
  }
  if (filters.has('vegetarian') && !item.vegetarian) return false;
  if (filters.has('specialty') && !isSpecialty(item, category)) return false;
  if (filters.has('seafood') && !isSeafood(item, category)) return false;
  if (filters.has('under100k')) {
    const p = minPrice(item);
    if (p === null || p >= 100_000 || item.pricingMode === 'weight') return false;
  }
  return true;
}

/** Các món đặc sản (signature) để giới thiệu ở trang chủ. */
export const signatureItems = categories.flatMap((c) =>
  c.items.filter((i) => i.signature).map((i) => ({ item: i, category: c })),
);
