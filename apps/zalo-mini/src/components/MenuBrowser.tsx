import { useMemo, useRef, useState } from 'react';
import { Icon } from 'zmp-ui';
import { matchesSearch } from '@dalan/domain';
import type { BranchMenuItemView, BranchMenuView } from '@dalan/contracts';
import { cn, formatVnd } from '../lib/format';
import { Chip } from './ui';

type Filter = 'all' | 'vegetarian' | 'signature' | 'seafood' | 'under100';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'signature', label: 'Đặc sản' },
  { key: 'seafood', label: 'Hải sản' },
  { key: 'vegetarian', label: 'Chay' },
  { key: 'under100', label: 'Dưới 100k' },
];

interface MenuCategoryFlat {
  id: string;
  code: string;
  name: string;
  isOpenNow: boolean;
  items: BranchMenuItemView[];
}

function flattenMenu(view: BranchMenuView): MenuCategoryFlat[] {
  const open = view.menus.filter((m) => m.isOpenNow);
  const closed = view.menus.filter((m) => !m.isOpenNow);
  return [...open, ...closed].flatMap((m) =>
    m.categories.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      isOpenNow: m.isOpenNow && c.isOpenNow,
      items: c.items,
    })),
  );
}

function applyFilter(item: BranchMenuItemView, filter: Filter, categoryCode: string): boolean {
  switch (filter) {
    case 'vegetarian':
      return item.isVegetarian;
    case 'signature':
      return item.isSignature;
    case 'seafood':
      return (
        ['HAI_SAN', 'CUA_BE', 'TOM', 'CA', 'CA_HOI', 'BABA', 'DAC_SAN', 'DO_DONG'].includes(
          categoryCode,
        ) || item.tags.includes('hai-san')
      );
    case 'under100':
      return item.price !== null && item.price < 100_000 && item.pricingMode !== 'WEIGHT';
    default:
      return true;
  }
}

export function priceLabel(item: BranchMenuItemView): string {
  if (item.pricingMode === 'MARKET' || item.pricingMode === 'OPEN') return 'Giá theo thời điểm';
  if (item.pricingMode === 'VARIANT') {
    const prices = item.variants.map((v) => v.price);
    if (prices.length === 0) return '';
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? formatVnd(min) : `${formatVnd(min)} – ${formatVnd(max)}`;
  }
  if (item.price === null) return '';
  return `${formatVnd(item.price)}/${item.unit}`;
}

export function MenuBrowser({
  view,
  onSelect,
  readOnly,
}: {
  view: BranchMenuView;
  onSelect?: (item: BranchMenuItemView, categoryOpen: boolean) => void;
  readOnly?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const categories = useMemo(() => flattenMenu(view), [view]);
  const sectionRefs = useRef(new Map<string, HTMLElement>());

  const searching = query.trim().length > 0 || filter !== 'all';
  const visible = useMemo(
    () =>
      categories
        .map((c) => ({
          ...c,
          items: c.items.filter(
            (i) =>
              applyFilter(i, filter, c.code) &&
              (query.trim() === '' ||
                matchesSearch(`${i.name} ${i.nameEn ?? ''} ${i.description ?? ''}`, query)),
          ),
        }))
        .filter((c) => c.items.length > 0),
    [categories, filter, query],
  );

  const jump = (id: string) => {
    sectionRefs.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveCat(id);
  };

  return (
    <div>
      <div className="sticky top-[calc(env(safe-area-inset-top,0px)+48px)] z-20 -mx-4 border-b border-line/70 bg-cream/95 px-4 pt-3 backdrop-blur">
        <label className="relative block">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted">
            <Icon icon="zi-search" size={18} />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm món (gõ không dấu cũng được)"
            className="w-full rounded-xl border border-line bg-paper py-2.5 pr-3 pl-9 text-base placeholder:text-ink-muted focus:border-maroon focus:outline-none"
            aria-label="Tìm món"
          />
        </label>
        <div className="no-scrollbar -mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-2">
          {FILTERS.map((f) => (
            <Chip key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label}
            </Chip>
          ))}
        </div>
        {!searching ? (
          <div className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 pb-2" role="tablist">
            {visible.map((c) => (
              <button
                key={c.id}
                role="tab"
                aria-selected={activeCat === c.id}
                onClick={() => jump(c.id)}
                className={cn(
                  'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold',
                  activeCat === c.id ? 'bg-maroon text-white' : 'text-ink-soft',
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <p className="py-12 text-center text-ink-muted">Không tìm thấy món phù hợp</p>
      ) : null}

      <div className="space-y-6 pt-3">
        {visible.map((c) => (
          <section
            key={c.id}
            className="scroll-mt-40"
            ref={(el) => {
              if (el) sectionRefs.current.set(c.id, el);
              else sectionRefs.current.delete(c.id);
            }}
          >
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-lg font-bold text-ink">{c.name}</h2>
              {!c.isOpenNow ? (
                <span className="text-xs font-medium text-warn">Ngoài giờ bán</span>
              ) : null}
            </div>
            <ul className="space-y-2">
              {c.items.map((item) => (
                <li key={item.id}>
                  <ItemCard
                    item={item}
                    disabled={readOnly || item.soldOut}
                    dimmed={item.soldOut || !c.isOpenNow}
                    onClick={() => onSelect?.(item, c.isOpenNow)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function ItemCard({
  item,
  disabled,
  dimmed,
  onClick,
}: {
  item: BranchMenuItemView;
  disabled?: boolean;
  dimmed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-stretch gap-3 rounded-2xl border border-line bg-paper p-3 text-left transition active:scale-[0.99] disabled:active:scale-100',
        dimmed && 'opacity-55',
      )}
    >
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt=""
          loading="lazy"
          className="h-20 w-20 shrink-0 rounded-xl object-cover"
        />
      ) : (
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-cream-dark font-serif text-2xl text-maroon/60">
          {item.name.slice(0, 1)}
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <span className="leading-snug font-semibold text-ink">{item.name}</span>
          {item.soldOut ? (
            <span className="shrink-0 rounded-full bg-line px-2 py-0.5 text-xs font-semibold text-ink-soft">
              Hết món
            </span>
          ) : null}
        </div>
        {item.description ? (
          <p className="mt-0.5 line-clamp-2 text-xs text-ink-soft">{item.description}</p>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span className="text-sm font-bold text-maroon">{priceLabel(item)}</span>
          <span className="flex gap-1 text-xs font-semibold">
            {item.isSignature ? (
              <span className="rounded bg-gold-soft px-1.5 py-0.5 text-gold">Đặc sản</span>
            ) : null}
            {item.isVegetarian ? (
              <span className="rounded bg-success-soft px-1.5 py-0.5 text-success">Chay</span>
            ) : null}
            {item.isSpicy ? (
              <span className="rounded bg-danger-soft px-1.5 py-0.5 text-danger">Cay</span>
            ) : null}
          </span>
        </div>
      </div>
    </button>
  );
}
