'use client';

import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { BranchMenuItemView } from '@dalan/contracts';
import { matchesSearch } from '@dalan/domain';
import type { MenuView } from '@/lib/types';
import { cn, moneyPlain } from '@/lib/utils';

export interface MenuBrowserProps {
  menu: MenuView;
  onPick: (item: BranchMenuItemView) => void;
  /** Nhấn giữ hoặc nút cấu hình. */
  onConfigure?: (item: BranchMenuItemView) => void;
}

/** Duyệt thực đơn: tab thực đơn, danh mục cuộn ngang, tìm không dấu, lưới món chạm lớn. */
export function MenuBrowser({ menu, onPick, onConfigure }: MenuBrowserProps) {
  const openMenus = menu.menus.filter((m) => m.categories.length > 0);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const activeMenu = openMenus.find((m) => m.id === menuId) ?? openMenus.find((m) => m.isOpenNow) ?? openMenus[0];
  const categories = activeMenu?.categories ?? [];
  const activeCategory = categories.find((c) => c.id === categoryId) ?? categories[0];

  const items = useMemo(() => {
    if (search.trim()) {
      return menu.menus.flatMap((m) => m.categories.flatMap((c) => c.items.map((i) => ({ item: i, open: m.isOpenNow && c.isOpenNow })))).filter(({ item }) => matchesSearch(`${item.name} ${item.nameEn ?? ''} ${item.code}`, search));
    }
    return (activeCategory?.items ?? []).map((item) => ({ item, open: !!activeMenu?.isOpenNow && !!activeCategory?.isOpenNow }));
  }, [search, menu, activeCategory, activeMenu]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-2 pt-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-ink-300" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm món (không cần dấu)" className="min-h-[44px] w-full rounded-xl border border-ink-100 bg-white pr-10 pl-10 text-base outline-none focus:border-brand-500" />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="absolute top-1/2 right-1 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-ink-500" aria-label="Xóa tìm kiếm">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
        {openMenus.length > 1 && (
          <select value={activeMenu?.id ?? ''} onChange={(e) => { setMenuId(e.target.value); setCategoryId(null); }} className="min-h-[44px] max-w-[140px] rounded-xl border border-ink-100 bg-white px-2 text-sm font-semibold" aria-label="Thực đơn">
            {openMenus.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}{m.isOpenNow ? '' : ' (ngoài giờ)'}
              </option>
            ))}
          </select>
        )}
      </div>
      {!search && (
        <div className="flex gap-1.5 overflow-x-auto px-2 py-2 no-scrollbar">
          {categories.map((c) => (
            <button key={c.id} type="button" onClick={() => setCategoryId(c.id)} className={cn('min-h-[40px] shrink-0 rounded-full px-3 text-sm font-semibold', activeCategory?.id === c.id ? 'bg-brand-700 text-white' : 'bg-white text-ink-700 border border-ink-100', !c.isOpenNow && 'opacity-60')}>
              {c.name}
            </button>
          ))}
        </div>
      )}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 pb-24">
        {items.length === 0 && <p className="py-10 text-center text-ink-500">Không có món phù hợp</p>}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {items.map(({ item, open }) => (
            <ItemCard key={item.id} item={item} open={open} onPick={() => onPick(item)} onConfigure={onConfigure ? () => onConfigure(item) : undefined} />
          ))}
        </div>
      </div>
    </div>
  );
}

function priceLabel(item: BranchMenuItemView): string {
  if (item.pricingMode === 'VARIANT') {
    const prices = item.variants.map((v) => v.price);
    if (prices.length === 0) return '—';
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? moneyPlain(min) : `${moneyPlain(min)} – ${moneyPlain(max)}`;
  }
  if (item.pricingMode === 'MARKET') return 'Giá thời điểm';
  if (item.pricingMode === 'OPEN') return 'Nhập giá';
  if (item.price === null) return '—';
  return item.pricingMode === 'WEIGHT' ? `${moneyPlain(item.price)}/kg` : moneyPlain(item.price);
}

function ItemCard({ item, open, onPick, onConfigure }: { item: BranchMenuItemView; open: boolean; onPick: () => void; onConfigure?: () => void }) {
  const disabled = item.soldOut || !open;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPick}
      onContextMenu={(e) => {
        e.preventDefault();
        onConfigure?.();
      }}
      className={cn('relative flex min-h-[92px] flex-col overflow-hidden rounded-xl border border-ink-100 bg-white text-left shadow-sm transition active:scale-[0.98]', disabled && 'opacity-50')}
    >
      {item.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.imageUrl} alt="" className="h-20 w-full object-cover" loading="lazy" />
      ) : null}
      <div className="flex flex-1 flex-col p-2">
        <span className="line-clamp-2 text-sm font-semibold leading-snug text-ink-900">{item.name}</span>
        <span className="mt-auto flex items-end justify-between gap-1 pt-1">
          <span className="text-sm font-bold text-brand-800 tabular-nums">{priceLabel(item)}</span>
          <span className="text-[11px] text-ink-500">/{item.unit}</span>
        </span>
      </div>
      {item.soldOut && <span className="absolute top-1 right-1 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">Hết món</span>}
      {!item.soldOut && !open && <span className="absolute top-1 right-1 rounded-full bg-ink-700 px-2 py-0.5 text-[11px] font-bold text-white">Ngoài giờ</span>}
      {item.stockLeft !== null && item.stockLeft > 0 && item.stockLeft <= 5 && <span className="absolute top-1 left-1 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-bold text-white">Còn {item.stockLeft}</span>}
      {item.isSignature && !item.soldOut && <span className="absolute top-1 left-1 rounded-full bg-gold-500 px-2 py-0.5 text-[11px] font-bold text-white">Đặc sản</span>}
    </button>
  );
}
