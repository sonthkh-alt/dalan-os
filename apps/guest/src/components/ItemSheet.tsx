'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Minus, Plus } from 'lucide-react';
import type { BranchMenuItemView } from '@dalan/contracts';
import type { PricingMode } from '@dalan/domain';
import { cartLineTotal, useCart, type CartModifier } from '@/lib/cart-store';
import { cn, formatVnd, localizedName } from '@/lib/format';
import { Button, Sheet, inputClass, useToast } from './ui';

export function ItemSheet({ item, open, onClose, onAskStaff }: { item: BranchMenuItemView | null; open: boolean; onClose: () => void; onAskStaff?: (item: BranchMenuItemView) => Promise<void> }) {
  const t = useTranslations('menu');
  const locale = useLocale();
  const add = useCart((s) => s.add);
  const toast = useToast((s) => s.show);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [quantity, setQuantity] = useState(1);
  const [weight, setWeight] = useState('1');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  // reset khi mở món khác
  const [lastItemId, setLastItemId] = useState<string | null>(null);
  if (item && item.id !== lastItemId) {
    setLastItemId(item.id);
    setVariantId(item.variants.find((v) => v.isDefault)?.id ?? item.variants[0]?.id ?? null);
    const defaults: Record<string, string[]> = {};
    for (const g of item.modifierGroups) {
      const d = g.options.filter((o) => o.isDefault).map((o) => o.id);
      if (d.length) defaults[g.id] = d.slice(0, Math.max(1, g.maxSelect));
    }
    setSelected(defaults);
    setQuantity(1);
    setWeight('1');
    setNote('');
  }

  const modifiers: CartModifier[] = useMemo(() => {
    if (!item) return [];
    return item.modifierGroups.flatMap((g) =>
      (selected[g.id] ?? []).flatMap((optionId) => {
        const o = g.options.find((x) => x.id === optionId);
        return o ? [{ groupId: g.id, groupName: g.name, optionId: o.id, optionName: o.name, priceDelta: o.priceDelta }] : [];
      }),
    );
  }, [item, selected]);

  if (!item) return null;
  const isWeight = item.pricingMode === 'WEIGHT';
  const isMarket = item.pricingMode === 'MARKET' || item.pricingMode === 'OPEN';
  const variant = item.variants.find((v) => v.id === variantId) ?? null;
  const qty = isWeight ? Number(weight.replace(',', '.')) || 0 : quantity;
  const missingRequired = item.modifierGroups.filter((g) => (g.isRequired || g.minSelect > 0) && (selected[g.id]?.length ?? 0) < Math.max(1, g.minSelect));
  const total = cartLineTotal({ pricingMode: item.pricingMode as PricingMode, basePrice: item.price, variantPrice: variant?.price ?? null, quantity: qty > 0 ? qty : 1, modifiers });

  const toggleOption = (groupId: string, optionId: string, maxSelect: number) => {
    setSelected((prev) => {
      const current = prev[groupId] ?? [];
      if (maxSelect <= 1) return { ...prev, [groupId]: [optionId] };
      if (current.includes(optionId)) return { ...prev, [groupId]: current.filter((x) => x !== optionId) };
      if (current.length >= maxSelect) return prev;
      return { ...prev, [groupId]: [...current, optionId] };
    });
  };

  const submit = () => {
    if (missingRequired.length || qty <= 0) return;
    add({
      itemId: item.id,
      name: item.name,
      nameEn: item.nameEn,
      unit: item.unit,
      pricingMode: item.pricingMode as PricingMode,
      basePrice: item.price,
      variantId: variant?.id ?? null,
      variantName: variant?.name ?? null,
      variantPrice: variant?.price ?? null,
      modifiers,
      quantity: isWeight ? Math.round(qty * 1000) / 1000 : qty,
      note: note.trim(),
    });
    toast(`${localizedName(locale, item.name, item.nameEn)} ✓`);
    onClose();
  };

  const askStaff = async () => {
    if (!onAskStaff) return;
    setBusy(true);
    try {
      await onAskStaff(item);
      toast(t('askStaffSent'));
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      footer={
        isMarket ? (
          <Button size="lg" className="w-full" onClick={askStaff} loading={busy}>
            {t('askStaff')}
          </Button>
        ) : (
          <Button size="lg" className="w-full" onClick={submit} disabled={missingRequired.length > 0 || qty <= 0}>
            {t('addToCart', { price: formatVnd(total) })}
          </Button>
        )
      }
    >
      {item.imageUrl ? <Image src={item.imageUrl} alt="" width={640} height={360} className="mb-3 h-44 w-full rounded-2xl object-cover" /> : null}
      <h2 className="text-xl font-bold text-ink">{localizedName(locale, item.name, item.nameEn)}</h2>
      {locale === 'en' && item.nameEn ? <p className="text-sm text-ink-muted">{item.name}</p> : null}
      {item.description ? <p className="mt-1 text-sm text-ink-soft">{localizedName(locale, item.description, item.descriptionEn)}</p> : null}
      <p className="mt-2 text-base font-bold text-maroon">
        {isMarket ? t('marketNote') : item.pricingMode === 'VARIANT' ? '' : item.price !== null ? `${formatVnd(item.price)}${t('perUnit', { unit: item.unit })}` : ''}
      </p>
      {isWeight ? <p className="text-xs text-warn">{t('weightNote')}</p> : null}

      {item.variants.length > 0 ? (
        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-semibold text-ink">
            {t('variants')} <span className="ml-1 rounded-full bg-maroon-soft px-2 py-0.5 text-xs font-medium text-maroon">{t('required')}</span>
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {item.variants.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVariantId(v.id)}
                className={cn('rounded-xl border px-3 py-3 text-left', variantId === v.id ? 'border-maroon bg-maroon-soft' : 'border-line bg-paper')}
                aria-pressed={variantId === v.id}
              >
                <span className="block font-semibold">{localizedName(locale, v.name, v.nameEn)}</span>
                <span className="block text-sm text-maroon">{formatVnd(v.price)}</span>
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      {item.modifierGroups.map((g) => {
        const required = g.isRequired || g.minSelect > 0;
        const chosen = selected[g.id] ?? [];
        return (
          <fieldset key={g.id} className="mt-4">
            <legend className="mb-2 text-sm font-semibold text-ink">
              {localizedName(locale, g.name, g.nameEn)}
              <span className={cn('ml-2 rounded-full px-2 py-0.5 text-xs font-medium', required ? 'bg-maroon-soft text-maroon' : 'bg-cream-dark text-ink-soft')}>
                {required ? t('required') : g.maxSelect > 1 ? t('chooseUpTo', { max: g.maxSelect }) : t('optional')}
              </span>
            </legend>
            <div className="space-y-1.5">
              {g.options.map((o) => {
                const on = chosen.includes(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => toggleOption(g.id, o.id, g.maxSelect)}
                    className={cn('flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left', on ? 'border-maroon bg-maroon-soft' : 'border-line bg-paper')}
                    aria-pressed={on}
                  >
                    <span>{localizedName(locale, o.name, o.nameEn)}</span>
                    {o.priceDelta ? <span className="text-sm text-maroon">+{formatVnd(o.priceDelta)}</span> : null}
                  </button>
                );
              })}
            </div>
          </fieldset>
        );
      })}

      {!isMarket ? (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-ink">{isWeight ? t('weightKg') : t('quantity')}</span>
            {isWeight ? (
              <input type="number" inputMode="decimal" step="0.1" min="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} className={inputClass} />
            ) : (
              <div className="flex items-center rounded-xl border border-line bg-paper">
                <button type="button" aria-label="-" className="h-12 w-12 text-ink-soft" onClick={() => setQuantity((q) => Math.max(1, q - 1))}>
                  <Minus className="mx-auto h-5 w-5" />
                </button>
                <span className="flex-1 text-center text-lg font-bold">{quantity}</span>
                <button type="button" aria-label="+" className="h-12 w-12 text-ink-soft" onClick={() => setQuantity((q) => Math.min(99, q + 1))}>
                  <Plus className="mx-auto h-5 w-5" />
                </button>
              </div>
            )}
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-ink">{t('estimated')}</span>
            <span className="flex h-12 items-center text-lg font-bold text-maroon">{formatVnd(total)}</span>
          </label>
        </div>
      ) : null}

      {!isMarket ? (
        <label className="mt-4 block">
          <span className="mb-1 block text-sm font-semibold text-ink">{t('note')}</span>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('notePlaceholder')} maxLength={200} className={inputClass} />
        </label>
      ) : null}
    </Sheet>
  );
}
