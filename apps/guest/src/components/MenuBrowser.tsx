'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Clock, Flame, Leaf, Plus, Search, Sparkles, Star, X } from 'lucide-react';
import { matchesSearch } from '@dalan/domain';
import type { BranchMenuItemView, BranchMenuView } from '@dalan/contracts';
import { cn, localizedName } from '@/lib/format';
import { flattenMenu, priceParts } from '@/lib/menu';
import { useCart } from '@/lib/cart-store';
import { DishImage } from './DishImage';
import { Badge, Chip } from './ui';

export { flattenMenu, type MenuCategoryFlat } from '@/lib/menu';

type Filter = 'all' | 'vegetarian' | 'signature' | 'seafood' | 'spicy' | 'under100';
const FILTERS: Filter[] = ['all', 'signature', 'seafood', 'vegetarian', 'spicy', 'under100'];
const SEAFOOD = ['HAI_SAN', 'CUA_BE', 'TOM', 'CA', 'CA_HOI', 'BABA', 'DAC_SAN', 'DO_DONG'];

function applyFilter(item: BranchMenuItemView, filter: Filter, categoryCode: string): boolean {
  switch (filter) {
    case 'vegetarian':
      return item.isVegetarian;
    case 'signature':
      return item.isSignature;
    case 'spicy':
      return item.isSpicy;
    case 'seafood':
      return SEAFOOD.includes(categoryCode) || item.tags.includes('hai-san');
    case 'under100':
      return item.price !== null && item.price < 100_000 && item.pricingMode !== 'WEIGHT';
    default:
      return true;
  }
}

/** Giá món: hỗ trợ giá cố định, theo cỡ ("từ"), theo kg và giá thời điểm. */
export function PriceTag({ item, className }: { item: BranchMenuItemView; className?: string }) {
  const t = useTranslations('menu');
  const p = priceParts(item);
  if (p.market) return <span className={cn('text-sm font-semibold text-warn', className)}>{t('marketShort')}</span>;
  if (!p.amount) return null;
  return (
    <span className={cn('tabular inline-flex items-baseline gap-1 font-bold text-maroon', className)}>
      {p.from ? <span className="text-xs font-medium text-ink-muted">{t('from')}</span> : null}
      <span>{p.amount}</span>
      {p.unit ? <span className="text-xs font-medium text-ink-muted">{t('perUnit', { unit: p.unit })}</span> : null}
    </span>
  );
}

function DietBadges({ item, compact }: { item: BranchMenuItemView; compact?: boolean }) {
  const t = useTranslations('menu');
  if (!item.isSignature && !item.isVegetarian && !item.isSpicy) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {item.isSignature ? (
        <Badge tone="gold">
          <Star className="h-3 w-3" fill="currentColor" />
          {compact ? null : t('signatureTag')}
        </Badge>
      ) : null}
      {item.isVegetarian ? (
        <Badge tone="success">
          <Leaf className="h-3 w-3" />
          {compact ? null : t('vegetarianTag')}
        </Badge>
      ) : null}
      {item.isSpicy ? (
        <Badge tone="danger">
          <Flame className="h-3 w-3" />
          {compact ? null : t('spicyTag')}
        </Badge>
      ) : null}
    </span>
  );
}

export function MenuBrowser({
  view,
  onSelect,
  readOnly,
  intro,
}: {
  view: BranchMenuView;
  onSelect?: (item: BranchMenuItemView, categoryOpen: boolean) => void;
  readOnly?: boolean;
  /** Nội dung chèn giữa thanh tìm kiếm và danh sách (ví dụ thẻ cơ sở) */
  intro?: ReactNode;
}) {
  const t = useTranslations('menu');
  const locale = useLocale();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const categories = useMemo(() => flattenMenu(view), [view]);
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const stickyRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const lines = useCart((s) => s.lines);

  // Số lượng món đã có trong giỏ (chỉ ở chế độ gọi món)
  const inCart = useMemo(() => {
    const m = new Map<string, number>();
    if (readOnly) return m;
    for (const l of lines) m.set(l.itemId, (m.get(l.itemId) ?? 0) + (l.pricingMode === 'WEIGHT' ? 1 : l.quantity));
    return m;
  }, [lines, readOnly]);

  const searching = query.trim().length > 0 || filter !== 'all';
  const visible = useMemo(
    () =>
      categories
        .map((c) => ({ ...c, items: c.items.filter((i) => applyFilter(i, filter, c.code) && (query.trim() === '' || matchesSearch(`${i.name} ${i.nameEn ?? ''} ${i.description ?? ''}`, query))) }))
        .filter((c) => c.items.length > 0),
    [categories, filter, query],
  );
  const resultCount = useMemo(() => visible.reduce((n, c) => n + c.items.length, 0), [visible]);

  const signatures = useMemo(() => {
    if (searching) return [];
    const seen = new Set<string>();
    return categories
      .filter((c) => c.isOpenNow)
      .flatMap((c) => c.items.map((i) => ({ item: i, open: c.isOpenNow })))
      .filter(({ item }) => item.isSignature && !item.soldOut && !seen.has(item.id) && seen.add(item.id))
      .slice(0, 10);
  }, [categories, searching]);

  // Scroll-spy: nhóm cuối cùng có mép trên đã đi qua thanh dính
  useEffect(() => {
    if (searching) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const edge = (stickyRef.current?.getBoundingClientRect().bottom ?? 120) + 24;
        let current: string | null = null;
        for (const c of visible) {
          const el = sectionRefs.current.get(c.id);
          if (el && el.getBoundingClientRect().top <= edge) current = c.id;
        }
        setActiveCat(current ?? visible[0]?.id ?? null);
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, [searching, visible]);

  // Giữ tab đang chọn nằm trong khung nhìn
  useEffect(() => {
    const box = tabsRef.current;
    const tab = activeCat ? box?.querySelector<HTMLElement>(`[data-tab="${activeCat}"]`) : null;
    if (!box || !tab) return;
    const target = tab.offsetLeft - box.clientWidth / 2 + tab.clientWidth / 2;
    box.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }, [activeCat]);

  const jump = useCallback((id: string) => {
    const el = sectionRefs.current.get(id);
    if (!el) return;
    const edge = stickyRef.current?.getBoundingClientRect().bottom ?? 120;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - edge - 8, behavior: 'smooth' });
    setActiveCat(id);
  }, []);

  return (
    <div>
      <div ref={stickyRef} className="sticky-under-header sticky z-20 -mx-4 bg-cream/90 px-4 pt-2 pb-2 backdrop-blur-xl">
        <label className="relative block">
          <Search className="pointer-events-none absolute top-1/2 left-4 h-4.5 w-4.5 -translate-y-1/2 text-ink-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search')}
            className="h-12 w-full rounded-full bg-paper pr-11 pl-11 text-[15px] text-ink shadow-card ring-1 ring-line-soft placeholder:text-ink-muted focus:ring-2 focus:ring-maroon/40 focus:outline-none"
            aria-label={t('search')}
            enterKeyHint="search"
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} className="absolute top-1/2 right-1.5 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-ink-muted hover:bg-cream-dark" aria-label={t('clearSearch')}>
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </label>
        {!searching && visible.length > 1 ? (
          <div ref={tabsRef} className="no-scrollbar -mx-4 mt-2 flex gap-1 overflow-x-auto scroll-smooth px-4" role="tablist" aria-label={t('categories')}>
            {visible.map((c) => {
              const on = activeCat === c.id;
              return (
                <button
                  key={c.id}
                  data-tab={c.id}
                  role="tab"
                  aria-selected={on}
                  onClick={() => jump(c.id)}
                  className={cn('relative min-h-10 shrink-0 whitespace-nowrap rounded-full px-3.5 text-sm font-semibold transition', on ? 'bg-maroon text-white shadow-sm' : 'text-ink-soft hover:bg-cream-dark', !c.isOpenNow && !on && 'text-ink-muted')}
                >
                  {localizedName(locale, c.name, c.nameEn)}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="no-scrollbar -mx-4 mt-1 flex gap-2 overflow-x-auto px-4 py-2">
        {FILTERS.map((f) => (
          <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
            {f === 'signature' ? <Star className="h-3.5 w-3.5" /> : f === 'vegetarian' ? <Leaf className="h-3.5 w-3.5" /> : f === 'spicy' ? <Flame className="h-3.5 w-3.5" /> : null}
            {t(`filters.${f}`)}
          </Chip>
        ))}
      </div>

      {intro}

      {searching ? (
        <p className="mt-2 text-sm text-ink-muted" aria-live="polite">
          {t('resultCount', { count: resultCount })}
        </p>
      ) : null}

      {signatures.length > 0 ? (
        <section className="mt-3" aria-labelledby="sig-title">
          <div className="mb-2.5 flex items-center gap-2">
            <Sparkles className="h-4.5 w-4.5 text-gold" />
            <h2 id="sig-title" className="font-serif text-xl font-bold text-ink">
              {t('signatureRail')}
            </h2>
          </div>
          <ul className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
            {signatures.map(({ item, open }) => (
              <li key={item.id} className="w-40 shrink-0 snap-start">
                <button type="button" onClick={() => onSelect?.(item, open)} className="group block w-full overflow-hidden rounded-3xl bg-paper text-left shadow-card ring-1 ring-line-soft transition active:scale-[0.98]">
                  <div className="relative">
                    <DishImage src={item.imageUrl} name={item.name} className="aspect-[4/3] w-full" sizes="160px" />
                    <span className="absolute top-2 left-2">
                      <Badge tone="dark">
                        <Star className="h-3 w-3 text-gold-light" fill="currentColor" />
                        {t('signatureTag')}
                      </Badge>
                    </span>
                    {inCart.get(item.id) ? <CartCount n={inCart.get(item.id)!} /> : null}
                  </div>
                  <div className="p-3">
                    <p className="line-clamp-2 min-h-10 text-sm leading-5 font-semibold text-ink">{localizedName(locale, item.name, item.nameEn)}</p>
                    <PriceTag item={item} className="mt-1 text-sm" />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {visible.length === 0 ? (
        <div className="py-16 text-center">
          <Search className="mx-auto h-10 w-10 text-line" />
          <p className="mt-3 font-semibold text-ink">{t('noResults')}</p>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setFilter('all');
            }}
            className="mt-2 text-sm font-semibold text-maroon underline underline-offset-4"
          >
            {t('resetFilters')}
          </button>
        </div>
      ) : null}

      <div className="space-y-7 pt-4">
        {visible.map((c) => (
          <section
            key={c.id}
            data-cat={c.id}
            aria-labelledby={`cat-${c.id}`}
            ref={(el) => {
              if (el) sectionRefs.current.set(c.id, el);
              else sectionRefs.current.delete(c.id);
            }}
          >
            <div className="mb-3 flex items-end justify-between gap-2 border-b border-line/70 pb-2">
              <div>
                <h2 id={`cat-${c.id}`} className="font-serif text-[22px] leading-tight font-bold text-ink">
                  {localizedName(locale, c.name, c.nameEn)}
                </h2>
                <p className="text-xs text-ink-muted">{t('itemCount', { count: c.items.length })}</p>
              </div>
              {!c.isOpenNow ? (
                <Badge tone="warn" className="shrink-0">
                  <Clock className="h-3 w-3" />
                  {c.hours ? t('opensAt', { hours: c.hours }) : t('closedNow')}
                </Badge>
              ) : null}
            </div>
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {c.items.map((item) => (
                <li key={item.id}>
                  <ItemCard item={item} readOnly={readOnly} closed={!c.isOpenNow} count={inCart.get(item.id) ?? 0} onClick={() => onSelect?.(item, c.isOpenNow)} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function CartCount({ n }: { n: number }) {
  return (
    <span key={n} className="tabular absolute top-2 right-2 flex h-7 min-w-7 animate-pop items-center justify-center rounded-full bg-maroon px-1.5 text-xs font-bold text-white shadow-md ring-2 ring-paper">
      {n}
    </span>
  );
}

function ItemCard({ item, readOnly, closed, count, onClick }: { item: BranchMenuItemView; readOnly?: boolean; closed?: boolean; count: number; onClick: () => void }) {
  const t = useTranslations('menu');
  const locale = useLocale();
  const unavailable = item.soldOut || closed;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={item.soldOut}
      className={cn(
        'group flex h-full w-full items-stretch gap-3 rounded-3xl bg-paper p-3 text-left shadow-card ring-1 ring-line-soft transition hover:shadow-lift active:scale-[0.99] disabled:active:scale-100',
        count > 0 && 'ring-2 ring-maroon/40',
      )}
    >
      <div className={cn('flex min-w-0 flex-1 flex-col py-0.5', unavailable && 'opacity-60')}>
        <span className="line-clamp-2 text-[15px] leading-snug font-semibold text-ink">{localizedName(locale, item.name, item.nameEn)}</span>
        {locale === 'en' && item.nameEn ? <span className="truncate text-xs text-ink-muted">{item.name}</span> : null}
        {item.description ? <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-ink-soft">{localizedName(locale, item.description, item.descriptionEn)}</p> : null}
        <div className="mt-1.5">
          <DietBadges item={item} />
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-x-2 pt-2">
          <PriceTag item={item} className="text-[15px]" />
          {item.pricingMode === 'WEIGHT' ? <span className="text-[11px] font-medium text-warn">{t('byWeight')}</span> : null}
          {item.stockLeft !== null && item.stockLeft > 0 && item.stockLeft <= 5 && !item.soldOut ? <span className="text-[11px] font-semibold text-danger">{t('stockLeft', { count: item.stockLeft })}</span> : null}
        </div>
      </div>
      <div className="relative shrink-0">
        <DishImage src={item.imageUrl} name={item.name} className={cn('h-28 w-28 rounded-2xl', unavailable && 'grayscale-[60%]')} sizes="112px" />
        {item.soldOut ? (
          <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-ink/45 text-sm font-bold text-white">{t('soldOut')}</span>
        ) : !readOnly && !closed ? (
          <span className={cn('absolute -right-1 -bottom-1 flex h-10 w-10 items-center justify-center rounded-full shadow-md ring-4 ring-paper transition group-active:scale-90', count > 0 ? 'bg-maroon text-white' : 'bg-paper text-maroon')} aria-hidden>
            {count > 0 ? <span className="tabular text-sm font-bold">{count}</span> : <Plus className="h-5 w-5" strokeWidth={2.6} />}
          </span>
        ) : null}
      </div>
    </button>
  );
}
