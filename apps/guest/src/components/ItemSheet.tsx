'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Info, MessageCircleQuestion, ScanQrCode, Scale } from 'lucide-react';
import type { BranchMenuItemView } from '@dalan/contracts';
import type { PricingMode } from '@dalan/domain';
import { cartLineTotal, useCart, type CartModifier } from '@/lib/cart-store';
import { cn, formatVnd, localizedName } from '@/lib/format';
import { DishImage } from './DishImage';
import { PriceTag } from './MenuBrowser';
import { Badge, Button, LinkButton, QuantityStepper, Sheet, inputClass, useToast } from './ui';

const QUICK_NOTES = ['lessSpicy', 'noOnion', 'lessSalt', 'serveFirst'] as const;
const WEIGHT_PRESETS = [0.5, 1, 1.5, 2];

export function ItemSheet({
  item,
  open,
  onClose,
  onAskStaff,
  readOnly,
}: {
  item: BranchMenuItemView | null;
  open: boolean;
  onClose: () => void;
  onAskStaff?: (item: BranchMenuItemView) => Promise<void>;
  /** Thực đơn công khai: chỉ xem, không gọi món */
  readOnly?: boolean;
}) {
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
  const name = localizedName(locale, item.name, item.nameEn);

  const toggleOption = (groupId: string, optionId: string, maxSelect: number, required: boolean) => {
    setSelected((prev) => {
      const current = prev[groupId] ?? [];
      if (maxSelect <= 1) return { ...prev, [groupId]: current.includes(optionId) && !required ? [] : [optionId] };
      if (current.includes(optionId)) return { ...prev, [groupId]: current.filter((x) => x !== optionId) };
      if (current.length >= maxSelect) return prev;
      return { ...prev, [groupId]: [...current, optionId] };
    });
  };

  const addQuickNote = (text: string) => setNote((n) => (n.includes(text) ? n : [n.trim(), text].filter(Boolean).join(', ').slice(0, 200)));

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
    toast(t('added', { name }));
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

  const footer = readOnly ? (
    <div className="flex items-center gap-3 pb-1">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-maroon-soft text-maroon">
        <ScanQrCode className="h-5 w-5" />
      </span>
      <p className="flex-1 text-[13px] leading-snug text-ink-soft">{t('readOnlyHint')}</p>
      <LinkButton href="/reserve" size="sm" variant="secondary" onClick={onClose}>
        {t('reserveCta')}
      </LinkButton>
    </div>
  ) : isMarket ? (
    <Button size="lg" className="w-full" onClick={askStaff} loading={busy}>
      <MessageCircleQuestion className="h-5 w-5" />
      {t('askStaff')}
    </Button>
  ) : (
    <div className="flex items-center gap-3">
      {!isWeight ? <QuantityStepper value={quantity} onChange={(v) => setQuantity(Math.min(99, Math.max(1, v)))} label={t('quantity')} /> : null}
      <Button size="lg" className="min-w-0 flex-1 justify-between gap-2 px-4 whitespace-nowrap" onClick={submit} disabled={missingRequired.length > 0 || qty <= 0}>
        <span>{missingRequired.length > 0 ? t('chooseRequired') : t('add')}</span>
        <span className="tabular">{formatVnd(total)}</span>
      </Button>
    </div>
  );

  return (
    <Sheet open={open} onClose={onClose} bare footer={footer}>
      <div className="relative">
        <DishImage src={item.imageUrl} name={item.name} className="aspect-[16/10] w-full" sizes="(max-width: 512px) 100vw, 512px" priority large />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-cream to-transparent" />
      </div>
      <div className="-mt-4 px-5">
        <div className="relative">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {item.isSignature ? <Badge tone="gold">★ {t('signatureTag')}</Badge> : null}
            {item.isVegetarian ? <Badge tone="success">{t('vegetarianTag')}</Badge> : null}
            {item.isSpicy ? <Badge tone="danger">{t('spicyTag')}</Badge> : null}
          </div>
          <h2 className="font-serif text-[26px] leading-tight font-bold text-ink">{name}</h2>
          {locale === 'en' && item.nameEn ? <p className="text-sm text-ink-muted">{item.name}</p> : null}
          <PriceTag item={item} className="mt-2 text-xl" />
          {item.description ? <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">{localizedName(locale, item.description, item.descriptionEn)}</p> : null}
          {item.allergens.length > 0 ? (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-muted">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t('allergens', { list: item.allergens.join(', ') })}
            </p>
          ) : null}
          {isWeight ? (
            <p className="mt-3 flex items-center gap-2 rounded-2xl bg-warn-soft px-3 py-2.5 text-[13px] text-warn">
              <Scale className="h-4 w-4 shrink-0" />
              {t('weightNote')}
            </p>
          ) : null}
          {isMarket ? <p className="mt-3 rounded-2xl bg-warn-soft px-3 py-2.5 text-[13px] text-warn">{t('marketNote')}</p> : null}
        </div>

        {item.variants.length > 0 ? (
          <fieldset className="mt-6">
            <GroupLegend title={t('variants')} badge={readOnly ? undefined : t('required')} required />
            <div className="grid grid-cols-2 gap-2">
              {item.variants.map((v) => {
                const on = variantId === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVariantId(v.id)}
                    className={cn('rounded-2xl px-3.5 py-3 text-left ring-1 transition', on ? 'bg-maroon-soft ring-2 ring-maroon' : 'bg-paper ring-line')}
                    aria-pressed={on}
                  >
                    <span className="block font-semibold text-ink">{localizedName(locale, v.name, v.nameEn)}</span>
                    <span className="tabular block text-sm font-semibold text-maroon">{formatVnd(v.price)}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        {item.modifierGroups.map((g) => {
          const required = g.isRequired || g.minSelect > 0;
          const chosen = selected[g.id] ?? [];
          const missing = missingRequired.includes(g);
          return (
            <fieldset key={g.id} className="mt-6">
              <GroupLegend
                title={localizedName(locale, g.name, g.nameEn)}
                badge={required ? t('required') : g.maxSelect > 1 ? t('chooseUpTo', { max: g.maxSelect }) : t('optional')}
                required={required}
                missing={missing}
              />
              <div className="overflow-hidden rounded-2xl bg-paper ring-1 ring-line">
                {g.options.map((o, idx) => {
                  const on = chosen.includes(o.id);
                  const multi = g.maxSelect > 1;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => toggleOption(g.id, o.id, g.maxSelect, required)}
                      className={cn('flex min-h-13 w-full items-center gap-3 px-4 py-3 text-left transition', idx > 0 && 'border-t border-line-soft', on && 'bg-maroon-soft/60')}
                      aria-pressed={on}
                    >
                      <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center border-2 transition', multi ? 'rounded-md' : 'rounded-full', on ? 'border-maroon bg-maroon text-white' : 'border-line')}>
                        {on ? <Check className="h-3 w-3" strokeWidth={3.5} /> : null}
                      </span>
                      <span className="flex-1 text-[15px] text-ink">{localizedName(locale, o.name, o.nameEn)}</span>
                      {o.priceDelta ? <span className="tabular text-sm font-medium text-ink-soft">+{formatVnd(o.priceDelta)}</span> : null}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          );
        })}

        {!isMarket && !readOnly && isWeight ? (
          <div className="mt-6">
            <GroupLegend title={t('weightKg')} />
            <div className="grid grid-cols-4 gap-2">
              {WEIGHT_PRESETS.map((w) => (
                <button key={w} type="button" onClick={() => setWeight(String(w))} className={cn('tabular min-h-11 rounded-2xl text-sm font-semibold ring-1', Number(weight) === w ? 'bg-maroon text-white ring-maroon' : 'bg-paper text-ink-soft ring-line')}>
                  {w} kg
                </button>
              ))}
            </div>
            <input type="number" inputMode="decimal" step="0.1" min="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} className={cn(inputClass, 'tabular mt-2')} aria-label={t('weightKg')} />
          </div>
        ) : null}

        {!isMarket && !readOnly ? (
          <div className="mt-6 mb-2">
            <GroupLegend title={t('note')} badge={t('optional')} />
            <div className="no-scrollbar -mx-5 mb-2 flex gap-2 overflow-x-auto px-5">
              {QUICK_NOTES.map((k) => (
                <button key={k} type="button" onClick={() => addQuickNote(t(`quickNotes.${k}`))} className="min-h-9 shrink-0 rounded-full bg-paper px-3 text-[13px] font-medium text-ink-soft ring-1 ring-line hover:ring-maroon/40">
                  + {t(`quickNotes.${k}`)}
                </button>
              ))}
            </div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('notePlaceholder')} maxLength={200} rows={2} className={cn(inputClass, 'resize-none')} />
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}

function GroupLegend({ title, badge, required, missing }: { title: string; badge?: string; required?: boolean; missing?: boolean }) {
  return (
    <legend className="mb-2.5 flex w-full items-center justify-between gap-2">
      <span className="text-base font-bold text-ink">{title}</span>
      {badge ? (
        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', missing ? 'bg-maroon text-white' : required ? 'bg-maroon-soft text-maroon' : 'bg-cream-dark text-ink-soft')}>{badge}</span>
      ) : null}
    </legend>
  );
}
