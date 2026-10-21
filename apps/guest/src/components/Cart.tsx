'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChefHat, ChevronRight, Plus, Send, ShoppingBag, Trash, UtensilsCrossed } from 'lucide-react';
import type { BranchMenuItemView, GuestOrderInput } from '@dalan/contracts';
import type { PricingMode } from '@dalan/domain';
import { api, ApiError, newIdempotencyKey } from '@/lib/api';
import { cartCount, cartLineTotal, cartTotal, useCart } from '@/lib/cart-store';
import { useGuestMenu, useGuestToken } from '@/lib/guest-data';
import { isQuickAdd, pickUpsell } from '@/lib/menu';
import { cn, formatVnd, localizedName } from '@/lib/format';
import { DishImage } from './DishImage';
import { PriceTag } from './MenuBrowser';
import { Button, LinkButton, QuantityStepper, Sheet, inputClass, useToast } from './ui';

/** Thanh giỏ nổi phía trên thanh điều hướng (kiểu Starbucks/Grab). */
export function CartBar({ onSelectItem }: { onSelectItem?: (item: BranchMenuItemView) => void }) {
  const t = useTranslations('cart');
  const lines = useCart((s) => s.lines);
  const [open, setOpen] = useState(false);
  if (lines.length === 0) return null;
  const count = cartCount(lines);
  return (
    <>
      <div className="above-nav pointer-events-none fixed inset-x-0 z-30 px-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="pointer-events-auto mx-auto flex h-16 w-full max-w-lg animate-rise items-center gap-3 rounded-[22px] bg-linear-to-r from-maroon to-maroon-dark pr-2 pl-3 text-white shadow-float transition active:scale-[0.98] md:max-w-2xl"
          aria-label={t('view')}
        >
          <span className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-white/12">
            <ShoppingBag className="h-5 w-5" />
            <span key={count} className="tabular absolute -top-1.5 -right-1.5 flex h-5 min-w-5 animate-pop items-center justify-center rounded-full bg-gold-light px-1 text-[11px] font-bold text-maroon-deep">
              {count}
            </span>
          </span>
          <span className="flex min-w-0 flex-1 flex-col items-start leading-tight">
            <span className="text-[11px] font-medium text-white/75">{t('items', { count })}</span>
            <span className="tabular text-lg font-bold">{formatVnd(cartTotal(lines))}</span>
          </span>
          <span className="flex h-12 items-center gap-1 rounded-2xl bg-white px-4 text-sm font-bold text-maroon">
            {t('view')}
            <ChevronRight className="h-4 w-4" />
          </span>
        </button>
      </div>
      <CartSheet
        open={open}
        onClose={() => setOpen(false)}
        onSelectItem={
          onSelectItem
            ? (item) => {
                setOpen(false);
                onSelectItem(item);
              }
            : undefined
        }
      />
    </>
  );
}

export function CartSheet({ open, onClose, onSelectItem }: { open: boolean; onClose: () => void; onSelectItem?: (item: BranchMenuItemView) => void }) {
  const t = useTranslations('cart');
  const tc = useTranslations('common');
  const tm = useTranslations('menu');
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast((s) => s.show);
  const token = useGuestToken();
  const menu = useGuestMenu();
  const { lines, orderNote, setQuantity, remove, setOrderNote, clear, add } = useCart();
  const [idemKey, setIdemKey] = useState(() => newIdempotencyKey());
  const [confirming, setConfirming] = useState(false);

  const itemsById = useMemo(() => {
    const m = new Map<string, BranchMenuItemView>();
    for (const menuDef of menu.data?.menus ?? []) for (const c of menuDef.categories) for (const i of c.items) m.set(i.id, i);
    return m;
  }, [menu.data]);
  const upsell = useMemo(() => {
    const picks = pickUpsell(menu.data, new Set(lines.map((l) => l.itemId)));
    return picks.filter((i) => isQuickAdd(i) || !!onSelectItem).slice(0, 6);
  }, [menu.data, lines, onSelectItem]);

  const quickAdd = (item: BranchMenuItemView) => {
    if (!isQuickAdd(item)) {
      onSelectItem?.(item);
      return;
    }
    add({
      itemId: item.id,
      name: item.name,
      nameEn: item.nameEn,
      unit: item.unit,
      pricingMode: item.pricingMode as PricingMode,
      basePrice: item.price,
      variantId: null,
      variantName: null,
      variantPrice: null,
      modifiers: [],
      quantity: 1,
      note: '',
    });
    toast(tm('added', { name: localizedName(locale, item.name, item.nameEn) }));
  };

  const submit = useMutation({
    mutationFn: async () => {
      const body: GuestOrderInput = {
        lines: lines.map((l) => ({
          itemId: l.itemId,
          variantId: l.variantId ?? undefined,
          quantity: l.quantity,
          modifiers: l.modifiers.map((m) => ({ groupId: m.groupId, optionId: m.optionId })),
          note: l.note || undefined,
          course: 1,
        })),
        notes: orderNote || undefined,
      };
      return api<{ id: string; status: string }>('/guest/orders', { body, guestToken: token, idempotencyKey: idemKey });
    },
    onSuccess: (order) => {
      clear();
      setIdemKey(newIdempotencyKey());
      setConfirming(false);
      void queryClient.invalidateQueries({ queryKey: ['guest-session'] });
      toast(order.status === 'PENDING_CONFIRM' ? t('sentConfirm') : t('sentKitchen'));
      onClose();
      router.push('/orders');
    },
    onError: (err) => {
      setConfirming(false);
      const message = err instanceof ApiError ? err.message : tc('errorGeneric');
      toast(`${t('sentError')}: ${message}`, 'error');
      if (err instanceof ApiError && err.status === 401) router.push('/');
    },
  });

  const count = cartCount(lines);
  const hasWeight = lines.some((l) => l.pricingMode === 'WEIGHT');
  const close = () => {
    setConfirming(false);
    onClose();
  };

  const footer =
    lines.length === 0 ? null : confirming ? (
      <div className="animate-rise space-y-3 pb-1">
        <div className="flex items-start gap-3 rounded-2xl bg-gold-soft p-3">
          <ChefHat className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
          <div className="text-sm">
            <p className="font-bold text-ink">{t('confirmTitle', { count })}</p>
            <p className="mt-0.5 text-ink-soft">{t('confirmBody')}</p>
          </div>
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <Button variant="secondary" size="lg" onClick={() => setConfirming(false)} disabled={submit.isPending}>
            {t('review')}
          </Button>
          <Button size="lg" onClick={() => submit.mutate()} loading={submit.isPending}>
            {!submit.isPending ? <Send className="h-5 w-5" /> : null}
            {submit.isPending ? t('submitting') : t('confirmSend')}
          </Button>
        </div>
      </div>
    ) : (
      <div className="space-y-2.5 pb-1">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-ink-soft">{hasWeight ? t('totalEstimated') : t('total')}</span>
          <span className="tabular text-2xl font-bold text-maroon">{formatVnd(cartTotal(lines))}</span>
        </div>
        <Button size="lg" className="w-full" onClick={() => setConfirming(true)}>
          <ChefHat className="h-5 w-5" />
          {t('submit', { count })}
        </Button>
      </div>
    );

  return (
    <Sheet open={open} onClose={close} title={t('title')} footer={footer}>
      {lines.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-maroon-soft text-maroon">
            <UtensilsCrossed className="h-7 w-7" />
          </span>
          <p className="text-ink-soft">{t('empty')}</p>
          <LinkButton href="/menu" variant="secondary" onClick={close}>
            {t('browse')}
          </LinkButton>
        </div>
      ) : (
        <>
          <ul className="space-y-2.5">
            {lines.map((l) => {
              const menuItem = itemsById.get(l.itemId);
              return (
                <li key={l.key} className="flex gap-3 rounded-3xl bg-paper p-3 shadow-card ring-1 ring-line-soft">
                  <DishImage src={menuItem?.imageUrl ?? null} name={l.name} className="h-16 w-16 shrink-0 rounded-2xl" sizes="64px" />
                  <div className="min-w-0 flex-1">
                    <p className="leading-snug font-semibold text-ink">{localizedName(locale, l.name, l.nameEn)}</p>
                    {l.variantName || l.modifiers.length ? (
                      <p className="mt-0.5 text-xs text-ink-soft">{[l.variantName, ...l.modifiers.map((m) => m.optionName)].filter(Boolean).join(' · ')}</p>
                    ) : null}
                    {l.note ? <p className="mt-0.5 text-xs text-ink-muted italic">“{l.note}”</p> : null}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="tabular text-[15px] font-bold text-maroon">{formatVnd(cartLineTotal(l))}</span>
                      {l.pricingMode === 'WEIGHT' ? (
                        <span className="flex items-center gap-1">
                          <span className="tabular rounded-full bg-cream-dark px-2.5 py-1 text-sm font-semibold text-ink-soft">{l.quantity} kg</span>
                          <button type="button" aria-label={t('remove')} onClick={() => remove(l.key)} className="flex h-10 w-10 items-center justify-center rounded-full text-ink-muted hover:bg-cream-dark hover:text-danger">
                            <Trash className="h-4 w-4" />
                          </button>
                        </span>
                      ) : (
                        <QuantityStepper value={l.quantity} onChange={(v) => setQuantity(l.key, Math.min(99, v))} min={0} size="sm" label={t('quantity')} />
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {hasWeight ? <p className="mt-2 text-xs text-warn">{tm('weightNote')}</p> : null}

          {upsell.length > 0 ? (
            <section className="mt-5" aria-labelledby="upsell-title">
              <h3 id="upsell-title" className="mb-2 font-serif text-lg font-bold text-ink">
                {t('upsell')}
              </h3>
              <ul className="no-scrollbar -mx-5 flex gap-2.5 overflow-x-auto px-5 pb-1">
                {upsell.map((item) => (
                  <li key={item.id} className="w-32 shrink-0">
                    <button type="button" onClick={() => quickAdd(item)} className="group block w-full overflow-hidden rounded-2xl bg-paper text-left ring-1 ring-line-soft transition active:scale-[0.97]">
                      <div className="relative">
                        <DishImage src={item.imageUrl} name={item.name} className="aspect-square w-full" sizes="128px" />
                        <span className="absolute right-1.5 bottom-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-paper text-maroon shadow-md">
                          <Plus className="h-4 w-4" strokeWidth={2.6} />
                        </span>
                      </div>
                      <div className="p-2">
                        <p className="line-clamp-2 min-h-8 text-xs leading-4 font-semibold text-ink">{localizedName(locale, item.name, item.nameEn)}</p>
                        <PriceTag item={item} className="mt-0.5 text-xs" />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <label className="mt-5 block">
            <span className="mb-1.5 block text-sm font-semibold text-ink">{t('orderNote')}</span>
            <input type="text" value={orderNote} onChange={(e) => setOrderNote(e.target.value)} maxLength={300} placeholder={t('orderNotePlaceholder')} className={inputClass} />
          </label>
          <button type="button" onClick={clear} className={cn('mt-3 mb-1 flex min-h-11 items-center gap-2 rounded-full px-2 text-sm font-semibold text-ink-muted hover:text-danger')}>
            <Trash className="h-4 w-4" />
            {t('clear')}
          </button>
        </>
      )}
    </Sheet>
  );
}
