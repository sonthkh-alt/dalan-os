'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Minus, Plus, ShoppingBasket, Trash2 } from 'lucide-react';
import type { GuestOrderInput } from '@dalan/contracts';
import { api, ApiError, newIdempotencyKey } from '@/lib/api';
import { cartCount, cartLineTotal, cartTotal, useCart } from '@/lib/cart-store';
import { useGuestToken } from '@/lib/guest-data';
import { formatVnd, localizedName } from '@/lib/format';
import { Button, Sheet, inputClass, useToast } from './ui';

export function CartBar() {
  const t = useTranslations('cart');
  const lines = useCart((s) => s.lines);
  const [open, setOpen] = useState(false);
  if (lines.length === 0) return null;
  return (
    <>
      <div className="fixed inset-x-0 bottom-[64px] z-30 px-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mx-auto flex w-full max-w-lg items-center justify-between rounded-2xl bg-maroon px-4 py-3 text-white shadow-lg"
        >
          <span className="flex items-center gap-2 font-semibold">
            <ShoppingBasket className="h-5 w-5" />
            {t('items', { count: cartCount(lines) })}
          </span>
          <span className="font-bold">{formatVnd(cartTotal(lines))}</span>
          <span className="rounded-lg bg-white/15 px-3 py-1 text-sm font-semibold">{t('view')}</span>
        </button>
      </div>
      <CartSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function CartSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('cart');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast((s) => s.show);
  const token = useGuestToken();
  const { lines, orderNote, setQuantity, remove, setOrderNote, clear } = useCart();
  const [idemKey, setIdemKey] = useState(() => newIdempotencyKey());

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
      void queryClient.invalidateQueries({ queryKey: ['guest-session'] });
      toast(order.status === 'PENDING_CONFIRM' ? t('sentConfirm') : t('sentKitchen'));
      onClose();
      router.push('/orders');
    },
    onError: (err) => {
      const message = err instanceof ApiError ? err.message : tc('errorGeneric');
      toast(`${t('sentError')}: ${message}`, 'error');
      if (err instanceof ApiError && err.status === 401) router.push('/');
    },
  });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('title')}
      footer={
        lines.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-base">
              <span className="text-ink-soft">{t('total')}</span>
              <span className="text-xl font-bold text-maroon">{formatVnd(cartTotal(lines))}</span>
            </div>
            <Button size="lg" className="w-full" onClick={() => submit.mutate()} loading={submit.isPending}>
              {submit.isPending ? t('submitting') : t('submit')}
            </Button>
          </div>
        ) : null
      }
    >
      {lines.length === 0 ? (
        <p className="py-10 text-center text-ink-muted">{t('empty')}</p>
      ) : (
        <ul className="divide-y divide-line">
          {lines.map((l) => (
            <li key={l.key} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">
                  {localizedName(locale, l.name, l.nameEn)}
                  {l.variantName ? <span className="text-ink-soft"> · {l.variantName}</span> : null}
                </p>
                {l.modifiers.length ? <p className="text-xs text-ink-soft">{l.modifiers.map((m) => m.optionName).join(', ')}</p> : null}
                {l.note ? <p className="text-xs text-ink-muted">“{l.note}”</p> : null}
                <p className="mt-1 text-sm font-bold text-maroon">{formatVnd(cartLineTotal(l))}</p>
              </div>
              {l.pricingMode === 'WEIGHT' ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-ink-soft">{l.quantity} kg</span>
                  <button type="button" aria-label={t('clear')} onClick={() => remove(l.key)} className="rounded-full p-2 text-ink-muted hover:bg-cream-dark">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center rounded-xl border border-line bg-paper">
                  <button type="button" aria-label="-" className="h-10 w-10 text-ink-soft" onClick={() => setQuantity(l.key, l.quantity - 1)}>
                    <Minus className="mx-auto h-4 w-4" />
                  </button>
                  <span className="w-8 text-center font-bold">{l.quantity}</span>
                  <button type="button" aria-label="+" className="h-10 w-10 text-ink-soft" onClick={() => setQuantity(l.key, l.quantity + 1)}>
                    <Plus className="mx-auto h-4 w-4" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {lines.length > 0 ? (
        <div className="mt-3 flex items-end gap-2">
          <label className="flex-1">
            <span className="mb-1 block text-sm font-medium text-ink-soft">{t('orderNote')}</span>
            <input type="text" value={orderNote} onChange={(e) => setOrderNote(e.target.value)} maxLength={300} className={inputClass} />
          </label>
          <Button variant="ghost" onClick={clear} aria-label={t('clear')}>
            <Trash2 className="h-5 w-5" />
          </Button>
        </div>
      ) : null}
    </Sheet>
  );
}
