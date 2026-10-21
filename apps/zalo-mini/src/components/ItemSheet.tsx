import { useMemo, useState } from 'react';
import { Button, Sheet } from 'zmp-ui';
import type { BranchMenuItemView } from '@dalan/contracts';
import type { PricingMode } from '@dalan/domain';
import { cartLineTotal, useCart, type CartModifier } from '../lib/cart-store';
import { cn, formatVnd } from '../lib/format';
import { inputClass, useToast } from './ui';

/** Chi tiết món: chọn cỡ, tùy chọn, số lượng/kg, ghi chú → thêm vào giỏ. Món giá thời điểm: hỏi nhân viên. */
export function ItemSheet({
  item,
  onClose,
  onAskStaff,
  viewOnly,
}: {
  item: BranchMenuItemView | null;
  onClose: () => void;
  onAskStaff?: (item: BranchMenuItemView) => Promise<void>;
  viewOnly?: boolean;
}) {
  return (
    <Sheet visible={!!item} onClose={onClose} autoHeight mask handler swipeToClose unmountOnClose>
      {item ? (
        <ItemSheetBody
          key={item.id}
          item={item}
          onClose={onClose}
          onAskStaff={onAskStaff}
          viewOnly={viewOnly}
        />
      ) : null}
    </Sheet>
  );
}

function ItemSheetBody({
  item,
  onClose,
  onAskStaff,
  viewOnly,
}: {
  item: BranchMenuItemView;
  onClose: () => void;
  onAskStaff?: (item: BranchMenuItemView) => Promise<void>;
  viewOnly?: boolean;
}) {
  const add = useCart((s) => s.add);
  const toast = useToast((s) => s.show);
  const [variantId, setVariantId] = useState<string | null>(
    () => item.variants.find((v) => v.isDefault)?.id ?? item.variants[0]?.id ?? null,
  );
  const [selected, setSelected] = useState<Record<string, string[]>>(() => {
    const defaults: Record<string, string[]> = {};
    for (const g of item.modifierGroups) {
      const d = g.options.filter((o) => o.isDefault).map((o) => o.id);
      if (d.length) defaults[g.id] = d.slice(0, Math.max(1, g.maxSelect));
    }
    return defaults;
  });
  const [quantity, setQuantity] = useState(1);
  const [weight, setWeight] = useState('1');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const modifiers: CartModifier[] = useMemo(
    () =>
      item.modifierGroups.flatMap((g) =>
        (selected[g.id] ?? []).flatMap((optionId) => {
          const o = g.options.find((x) => x.id === optionId);
          return o
            ? [
                {
                  groupId: g.id,
                  groupName: g.name,
                  optionId: o.id,
                  optionName: o.name,
                  priceDelta: o.priceDelta,
                },
              ]
            : [];
        }),
      ),
    [item, selected],
  );

  const isWeight = item.pricingMode === 'WEIGHT';
  const isMarket = item.pricingMode === 'MARKET' || item.pricingMode === 'OPEN';
  const variant = item.variants.find((v) => v.id === variantId) ?? null;
  const qty = isWeight ? Number(weight.replace(',', '.')) || 0 : quantity;
  const missingRequired = item.modifierGroups.filter(
    (g) =>
      (g.isRequired || g.minSelect > 0) && (selected[g.id]?.length ?? 0) < Math.max(1, g.minSelect),
  );
  const total = cartLineTotal({
    pricingMode: item.pricingMode as PricingMode,
    basePrice: item.price,
    variantPrice: variant?.price ?? null,
    quantity: qty > 0 ? qty : 1,
    modifiers,
  });

  const toggleOption = (groupId: string, optionId: string, maxSelect: number) => {
    setSelected((prev) => {
      const current = prev[groupId] ?? [];
      if (maxSelect <= 1) return { ...prev, [groupId]: [optionId] };
      if (current.includes(optionId))
        return { ...prev, [groupId]: current.filter((x) => x !== optionId) };
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
    toast(`Đã thêm ${item.name} vào giỏ`);
    onClose();
  };

  const askStaff = async () => {
    if (!onAskStaff) return;
    setBusy(true);
    try {
      await onAskStaff(item);
      toast('Đã gửi yêu cầu, nhân viên sẽ tới ngay');
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex max-h-[80vh] flex-col">
      <div className="flex-1 overflow-y-auto px-4 pt-2 pb-4">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" className="mb-3 h-44 w-full rounded-2xl object-cover" />
        ) : null}
        <h2 className="text-xl font-bold text-ink">{item.name}</h2>
        {item.description ? <p className="mt-1 text-sm text-ink-soft">{item.description}</p> : null}
        <p className="mt-2 text-base font-bold text-maroon">
          {isMarket
            ? 'Giá theo thời điểm, vui lòng hỏi nhân viên'
            : item.pricingMode === 'VARIANT'
              ? ''
              : item.price !== null
                ? `${formatVnd(item.price)}/${item.unit}`
                : ''}
        </p>
        {isWeight ? <p className="text-xs text-warn">Giá theo kg, chốt theo cân thực tế</p> : null}

        {item.variants.length > 0 ? (
          <fieldset className="mt-4">
            <legend className="mb-2 text-sm font-semibold text-ink">
              Chọn cỡ{' '}
              <span className="ml-1 rounded-full bg-maroon-soft px-2 py-0.5 text-xs font-medium text-maroon">
                Bắt buộc
              </span>
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {item.variants.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVariantId(v.id)}
                  aria-pressed={variantId === v.id}
                  className={cn(
                    'rounded-xl border px-3 py-3 text-left',
                    variantId === v.id ? 'border-maroon bg-maroon-soft' : 'border-line bg-paper',
                  )}
                >
                  <span className="block font-semibold">{v.name}</span>
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
                {g.name}
                <span
                  className={cn(
                    'ml-2 rounded-full px-2 py-0.5 text-xs font-medium',
                    required ? 'bg-maroon-soft text-maroon' : 'bg-cream-dark text-ink-soft',
                  )}
                >
                  {required
                    ? 'Bắt buộc'
                    : g.maxSelect > 1
                      ? `Chọn tối đa ${g.maxSelect}`
                      : 'Tùy chọn'}
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
                      aria-pressed={on}
                      className={cn(
                        'flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left',
                        on ? 'border-maroon bg-maroon-soft' : 'border-line bg-paper',
                      )}
                    >
                      <span>{o.name}</span>
                      {o.priceDelta ? (
                        <span className="text-sm text-maroon">+{formatVnd(o.priceDelta)}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          );
        })}

        {!isMarket && !viewOnly ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-ink">
                  {isWeight ? 'Trọng lượng dự kiến (kg)' : 'Số lượng'}
                </span>
                {isWeight ? (
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min="0.1"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    className={inputClass}
                  />
                ) : (
                  <div className="flex items-center rounded-xl border border-line bg-paper">
                    <button
                      type="button"
                      aria-label="Giảm"
                      className="h-11 w-11 text-xl text-ink-soft"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    >
                      −
                    </button>
                    <span className="flex-1 text-center text-lg font-bold">{quantity}</span>
                    <button
                      type="button"
                      aria-label="Tăng"
                      className="h-11 w-11 text-xl text-ink-soft"
                      onClick={() => setQuantity((q) => Math.min(99, q + 1))}
                    >
                      +
                    </button>
                  </div>
                )}
              </label>
              <div>
                <span className="mb-1 block text-sm font-semibold text-ink">Tạm tính</span>
                <span className="flex h-11 items-center text-lg font-bold text-maroon">
                  {formatVnd(total)}
                </span>
              </div>
            </div>
            <label className="mt-4 block">
              <span className="mb-1 block text-sm font-semibold text-ink">Ghi chú cho bếp</span>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ví dụ: ít cay, không hành"
                maxLength={200}
                className={inputClass}
              />
            </label>
          </>
        ) : null}
      </div>
      <div className="safe-bottom border-t border-line bg-paper px-4 pt-3">
        {viewOnly ? (
          <p className="pb-1 text-center text-sm text-ink-soft">
            Quét mã QR trên bàn bằng Zalo để gọi món này.
          </p>
        ) : isMarket ? (
          <Button fullWidth onClick={askStaff} loading={busy} disabled={!onAskStaff}>
            {onAskStaff ? 'Hỏi nhân viên giá hôm nay' : 'Vui lòng hỏi nhân viên tại nhà hàng'}
          </Button>
        ) : (
          <Button fullWidth onClick={submit} disabled={missingRequired.length > 0 || qty <= 0}>
            {`Thêm vào giỏ · ${formatVnd(total)}`}
          </Button>
        )}
      </div>
    </div>
  );
}
