'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Ban, Flame, Leaf, Search, SlidersHorizontal, Star, X } from 'lucide-react';
import type { BranchMenuItemView } from '@dalan/contracts';
import { matchesSearch } from '@dalan/domain';
import type { MenuView } from '@/lib/types';
import { cn, moneyPlain } from '@/lib/utils';
import { needsConfig } from './cart-store';

export interface MenuBrowserProps {
  menu: MenuView;
  onPick: (item: BranchMenuItemView) => void;
  /** Nhấn giữ (hoặc chuột phải) để mở hộp cấu hình. */
  onConfigure?: (item: BranchMenuItemView) => void;
  /** Số lượng từng món đang nằm trong giỏ, để hiện huy hiệu trên thẻ. */
  cartCounts?: Record<string, number>;
  /** Chế độ báo hết món (86): chạm món để bật/tắt hết. */
  soldOutMode?: boolean;
  onToggleSoldOut?: (item: BranchMenuItemView) => void;
  /** Nút bổ sung trên thanh công cụ (ví dụ nút báo hết món). */
  toolbar?: ReactNode;
  /** Thanh chọn đợt/ghế cho món mới. */
  subbar?: ReactNode;
}

/** Duyệt thực đơn kiểu POS: thanh danh mục dọc (tablet), tìm không dấu, lưới món có ảnh, trạng thái hết món. */
export function MenuBrowser({ menu, onPick, onConfigure, cartCounts, soldOutMode, onToggleSoldOut, toolbar, subbar }: MenuBrowserProps) {
  const openMenus = menu.menus.filter((m) => m.categories.length > 0);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const activeMenu = openMenus.find((m) => m.id === menuId) ?? openMenus.find((m) => m.isOpenNow) ?? openMenus[0];
  const categories = activeMenu?.categories ?? [];
  const activeCategory = categories.find((c) => c.id === categoryId) ?? categories[0];

  const items = useMemo(() => {
    if (search.trim()) {
      const seen = new Set<string>();
      return menu.menus
        .flatMap((m) => m.categories.flatMap((c) => c.items.map((i) => ({ item: i, open: m.isOpenNow && c.isOpenNow }))))
        .filter(({ item }) => {
          if (seen.has(item.id)) return false;
          const ok = matchesSearch(`${item.name} ${item.nameEn ?? ''} ${item.code}`, search);
          if (ok) seen.add(item.id);
          return ok;
        });
    }
    return (activeCategory?.items ?? []).map((item) => ({ item, open: !!activeMenu?.isOpenNow && !!activeCategory?.isOpenNow }));
  }, [search, menu, activeCategory, activeMenu]);

  const categoryButton = (c: (typeof categories)[number], vertical: boolean) => {
    const active = activeCategory?.id === c.id && !search;
    return (
      <button
        key={c.id}
        type="button"
        onClick={() => {
          setCategoryId(c.id);
          setSearch('');
        }}
        className={cn(
          'shrink-0 font-semibold transition',
          vertical ? 'flex min-h-[48px] w-full items-center rounded-xl px-3 text-left text-sm' : 'min-h-[44px] rounded-full px-4 text-sm',
          active ? 'bg-brand-700 text-white shadow-sm' : vertical ? 'text-ink-700 hover:bg-ink-100' : 'border border-ink-100 bg-white text-ink-700',
          !c.isOpenNow && 'opacity-60',
        )}
      >
        <span className="line-clamp-2">{c.name}</span>
        {vertical && <span className={cn('ml-auto pl-2 text-xs tabular-nums', active ? 'text-white/80' : 'text-ink-300')}>{c.items.length}</span>}
      </button>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 px-3 pt-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-ink-300" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm món (không cần dấu)" aria-label="Tìm món" className="min-h-[44px] w-full rounded-xl border border-ink-100 bg-white pr-10 pl-10 text-base outline-none focus:border-brand-500" />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="absolute top-1/2 right-1 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-ink-500" aria-label="Xóa tìm kiếm">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
        {openMenus.length > 1 && (
          <select
            value={activeMenu?.id ?? ''}
            onChange={(e) => {
              setMenuId(e.target.value);
              setCategoryId(null);
            }}
            className="min-h-[44px] max-w-[150px] rounded-xl border border-ink-100 bg-white px-2 text-sm font-semibold"
            aria-label="Chọn thực đơn"
          >
            {openMenus.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.isOpenNow ? '' : ' (ngoài giờ)'}
              </option>
            ))}
          </select>
        )}
        {toolbar}
      </div>
      {subbar && <div className="px-3 pt-2">{subbar}</div>}
      {soldOutMode && (
        <div className="mx-3 mt-2 flex items-center gap-2 rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white">
          <Ban className="h-4 w-4 shrink-0" /> Chế độ báo hết món: chạm món để đánh dấu hết hôm nay hoặc mở bán lại.
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        {!search && categories.length > 0 && (
          <nav className="scrollbar-thin hidden w-44 shrink-0 flex-col gap-1 overflow-y-auto border-r border-ink-100 p-2 lg:flex" aria-label="Danh mục">
            {categories.map((c) => categoryButton(c, true))}
          </nav>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          {!search && categories.length > 0 && <div className="flex gap-1.5 overflow-x-auto px-3 py-2 no-scrollbar lg:hidden">{categories.map((c) => categoryButton(c, false))}</div>}
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3 pt-2 pb-6">
            {search && <p className="mb-2 text-sm text-ink-500">{items.length} món khớp “{search}”</p>}
            {items.length === 0 && <p className="py-10 text-center text-ink-500">Không có món phù hợp</p>}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {items.map(({ item, open }) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  open={open}
                  count={cartCounts?.[item.id] ?? 0}
                  soldOutMode={!!soldOutMode}
                  onPick={() => (soldOutMode ? onToggleSoldOut?.(item) : onPick(item))}
                  onConfigure={onConfigure && !soldOutMode ? () => onConfigure(item) : undefined}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function priceLabel(item: BranchMenuItemView): string {
  if (item.pricingMode === 'VARIANT') {
    const prices = item.variants.map((v) => v.price);
    if (prices.length === 0) return '—';
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? moneyPlain(min) : `từ ${moneyPlain(min)}`;
  }
  if (item.pricingMode === 'MARKET') return 'Giá thời điểm';
  if (item.pricingMode === 'OPEN') return 'Nhập giá';
  if (item.price === null) return '—';
  return item.pricingMode === 'WEIGHT' ? `${moneyPlain(item.price)}/kg` : moneyPlain(item.price);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

function ItemCard({ item, open, count, soldOutMode, onPick, onConfigure }: { item: BranchMenuItemView; open: boolean; count: number; soldOutMode: boolean; onPick: () => void; onConfigure?: () => void }) {
  const unavailable = item.soldOut || !open;
  const disabled = !soldOutMode && unavailable;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPick}
      onContextMenu={(e) => {
        if (!onConfigure) return;
        e.preventDefault();
        onConfigure();
      }}
      aria-label={`${item.name}${item.soldOut ? ' (hết món)' : ''}`}
      className={cn(
        'group relative flex min-h-[120px] flex-col overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition active:scale-[0.97]',
        count > 0 ? 'border-brand-500 ring-2 ring-brand-200' : 'border-ink-100',
        soldOutMode && 'ring-2 ring-red-200',
        disabled && 'cursor-not-allowed',
      )}
    >
      <div className={cn('relative h-20 w-full shrink-0 bg-linear-to-br from-gold-100 to-brand-50 sm:h-24', unavailable && 'grayscale')}>
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-2xl font-black text-brand-300">{initials(item.name)}</span>
        )}
        <span className="absolute top-1.5 left-1.5 flex gap-1">
          {item.isSignature && (
            <span className="flex h-6 items-center gap-0.5 rounded-full bg-gold-500 px-1.5 text-[11px] font-bold text-white">
              <Star className="h-3 w-3" /> Đặc sản
            </span>
          )}
          {item.isSpicy && (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white" title="Cay">
              <Flame className="h-3.5 w-3.5" />
            </span>
          )}
          {item.isVegetarian && (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white" title="Món chay">
              <Leaf className="h-3.5 w-3.5" />
            </span>
          )}
        </span>
        {count > 0 && <span className="absolute top-1.5 right-1.5 flex h-7 min-w-7 items-center justify-center rounded-full bg-brand-700 px-1.5 text-sm font-bold text-white shadow tabular-nums">{count}</span>}
        {item.soldOut && (
          <span className="absolute inset-0 flex items-center justify-center bg-ink-900/45">
            <span className="-rotate-6 rounded-lg bg-red-600 px-3 py-1 text-sm font-black tracking-wide text-white uppercase shadow">Hết món</span>
          </span>
        )}
        {!item.soldOut && !open && (
          <span className="absolute inset-0 flex items-center justify-center bg-ink-900/40">
            <span className="rounded-lg bg-ink-900 px-3 py-1 text-xs font-bold text-white">Ngoài giờ phục vụ</span>
          </span>
        )}
      </div>
      <div className={cn('flex flex-1 flex-col p-2.5', unavailable && 'opacity-60')}>
        <span className="line-clamp-2 text-sm leading-snug font-semibold text-ink-900">{item.name}</span>
        <span className="mt-auto flex items-end justify-between gap-1 pt-1">
          <span className="text-sm font-bold text-brand-800 tabular-nums">{priceLabel(item)}</span>
          <span className="flex items-center gap-1 text-[11px] text-ink-500">
            {needsConfig(item) && <SlidersHorizontal className="h-3 w-3" aria-label="Có tùy chọn" />}/{item.unit}
          </span>
        </span>
        {item.stockLeft !== null && item.stockLeft > 0 && item.stockLeft <= 5 && !item.soldOut && <span className="mt-1 w-fit rounded-full bg-amber-100 px-2 text-[11px] font-bold text-amber-800">Còn {item.stockLeft}</span>}
        {soldOutMode && (
          <span className={cn('mt-1.5 rounded-lg py-1 text-center text-xs font-bold', item.soldOut ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white')}>{item.soldOut ? 'Chạm để mở bán lại' : 'Chạm để báo hết'}</span>
        )}
      </div>
    </button>
  );
}
