'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Flame, Leaf, Search, Star } from 'lucide-react';
import { matchesSearch } from '@dalan/domain';
import type { BranchMenuItemView, BranchMenuView } from '@dalan/contracts';
import { cn, formatVnd, localizedName } from '@/lib/format';
import { Chip } from './ui';

type Filter = 'all' | 'vegetarian' | 'signature' | 'seafood' | 'under100';
const FILTERS: Filter[] = ['all', 'vegetarian', 'signature', 'seafood', 'under100'];

export interface MenuCategoryFlat {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  isOpenNow: boolean;
  menuName: string;
  items: BranchMenuItemView[];
}

export function flattenMenu(view: BranchMenuView): MenuCategoryFlat[] {
  const open = view.menus.filter((m) => m.isOpenNow);
  const closed = view.menus.filter((m) => !m.isOpenNow);
  return [...open, ...closed].flatMap((m) =>
    m.categories.map((c) => ({ id: c.id, code: c.code, name: c.name, nameEn: c.nameEn, isOpenNow: m.isOpenNow && c.isOpenNow, menuName: m.name, items: c.items })),
  );
}

function applyFilter(item: BranchMenuItemView, filter: Filter, categoryCode: string): boolean {
  switch (filter) {
    case 'vegetarian':
      return item.isVegetarian;
    case 'signature':
      return item.isSignature;
    case 'seafood':
      return ['HAI_SAN', 'CUA_BE', 'TOM', 'CA', 'CA_HOI', 'BABA', 'DAC_SAN', 'DO_DONG'].includes(categoryCode) || item.tags.includes('hai-san');
    case 'under100':
      return item.price !== null && item.price < 100_000 && item.pricingMode !== 'WEIGHT';
    default:
      return true;
  }
}

export function MenuBrowser({ view, onSelect, readOnly }: { view: BranchMenuView; onSelect?: (item: BranchMenuItemView, categoryOpen: boolean) => void; readOnly?: boolean }) {
  const t = useTranslations('menu');
  const locale = useLocale();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const categories = useMemo(() => flattenMenu(view), [view]);
  const sectionRefs = useRef(new Map<string, HTMLElement>());

  const searching = query.trim().length > 0 || filter !== 'all';
  const visible = useMemo(
    () =>
      categories
        .map((c) => ({ ...c, items: c.items.filter((i) => applyFilter(i, filter, c.code) && (query.trim() === '' || matchesSearch(`${i.name} ${i.nameEn ?? ''} ${i.description ?? ''}`, query))) }))
        .filter((c) => c.items.length > 0),
    [categories, filter, query],
  );

  useEffect(() => {
    if (searching) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActiveCat(hit.target.getAttribute('data-cat'));
      },
      { rootMargin: '-120px 0px -60% 0px', threshold: 0 },
    );
    sectionRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [searching, visible]);

  const jump = (id: string) => {
    const el = sectionRefs.current.get(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 118;
    window.scrollTo({ top, behavior: 'smooth' });
    setActiveCat(id);
  };

  return (
    <div>
      <div className="sticky top-[57px] z-20 -mx-4 border-b border-line/70 bg-cream/95 px-4 pt-2 backdrop-blur">
        <label className="relative block">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search')}
            className="w-full rounded-xl border border-line bg-paper py-2.5 pr-3 pl-9 text-base placeholder:text-ink-muted focus:border-maroon focus:outline-none"
            aria-label={t('search')}
          />
        </label>
        <div className="no-scrollbar -mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-2">
          {FILTERS.map((f) => (
            <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
              {t(`filters.${f}`)}
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
                className={cn('whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold', activeCat === c.id ? 'bg-maroon text-white' : 'text-ink-soft')}
              >
                {localizedName(locale, c.name, c.nameEn)}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {visible.length === 0 ? <p className="py-12 text-center text-ink-muted">{t('noResults')}</p> : null}

      <div className="space-y-6 pt-3">
        {visible.map((c) => (
          <section
            key={c.id}
            data-cat={c.id}
            ref={(el) => {
              if (el) sectionRefs.current.set(c.id, el);
              else sectionRefs.current.delete(c.id);
            }}
          >
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-lg font-bold text-ink">{localizedName(locale, c.name, c.nameEn)}</h2>
              {!c.isOpenNow ? <span className="text-xs font-medium text-warn">{t('closedNow')}</span> : null}
            </div>
            <ul className="space-y-2">
              {c.items.map((item) => (
                <li key={item.id}>
                  <ItemCard item={item} disabled={readOnly || item.soldOut} dimmed={item.soldOut || !c.isOpenNow} onClick={() => onSelect?.(item, c.isOpenNow)} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

export function priceLabel(item: BranchMenuItemView, t: (key: string, values?: Record<string, string | number>) => string): string {
  if (item.pricingMode === 'MARKET' || item.pricingMode === 'OPEN') return t('marketNote');
  if (item.pricingMode === 'VARIANT') {
    const prices = item.variants.map((v) => v.price);
    if (prices.length === 0) return '';
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? formatVnd(min) : `${formatVnd(min)} – ${formatVnd(max)}`;
  }
  if (item.price === null) return '';
  return `${formatVnd(item.price)}${t('perUnit', { unit: item.unit })}`;
}

function ItemCard({ item, disabled, dimmed, onClick }: { item: BranchMenuItemView; disabled?: boolean; dimmed?: boolean; onClick: () => void }) {
  const t = useTranslations('menu');
  const locale = useLocale();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn('flex w-full items-stretch gap-3 rounded-2xl border border-line bg-paper p-3 text-left transition active:scale-[0.99] disabled:active:scale-100', dimmed && 'opacity-55')}
    >
      {item.imageUrl ? (
        <Image src={item.imageUrl} alt="" width={88} height={88} className="h-22 w-22 shrink-0 rounded-xl object-cover" />
      ) : (
        <div className="flex h-22 w-22 shrink-0 items-center justify-center rounded-xl bg-cream-dark font-serif text-2xl text-maroon/60">{item.name.slice(0, 1)}</div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <span className="font-semibold text-ink leading-snug">{localizedName(locale, item.name, item.nameEn)}</span>
          {item.soldOut ? <span className="shrink-0 rounded-full bg-line px-2 py-0.5 text-xs font-semibold text-ink-soft">{t('soldOut')}</span> : null}
        </div>
        {locale === 'en' && item.nameEn ? <span className="text-xs text-ink-muted">{item.name}</span> : null}
        {item.description ? <p className="mt-0.5 line-clamp-2 text-xs text-ink-soft">{localizedName(locale, item.description, item.descriptionEn)}</p> : null}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span className="text-sm font-bold text-maroon">{priceLabel(item, t as never)}</span>
          <span className="flex gap-1">
            {item.isSignature ? <Star className="h-4 w-4 text-gold" aria-label={t('signatureTag')} /> : null}
            {item.isVegetarian ? <Leaf className="h-4 w-4 text-success" aria-label={t('vegetarianTag')} /> : null}
            {item.isSpicy ? <Flame className="h-4 w-4 text-danger" aria-label={t('spicyTag')} /> : null}
          </span>
        </div>
      </div>
    </button>
  );
}
