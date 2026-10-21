'use client';

import { useEffect, useMemo, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { BranchMenuItemView } from '@dalan/contracts';
import { cn, money, moneyPlain } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { NumberPad } from '@/components/ui/number-pad';
import { Input, Textarea } from '@/components/ui/primitives';
import { cartLineTotal, defaultLineFor, type CartLine } from './cart-store';

export interface ItemDialogProps {
  item: BranchMenuItemView | null;
  initial?: CartLine | null;
  defaultCourse?: number;
  onClose: () => void;
  onSubmit: (line: CartLine) => void;
}

/** Cấu hình một dòng món: biến thể, tùy chọn, số lượng hoặc trọng lượng, giá nhập, ghi chú, đợt. */
export function ItemDialog({ item, initial, defaultCourse = 1, onClose, onSubmit }: ItemDialogProps) {
  const [line, setLine] = useState<CartLine | null>(null);
  const [qtyText, setQtyText] = useState('1');
  const [priceText, setPriceText] = useState('');

  useEffect(() => {
    if (!item) return setLine(null);
    const base = initial ?? defaultLineFor(item, defaultCourse);
    setLine(base);
    setQtyText(String(base.quantity));
    setPriceText(base.enteredPrice ? String(base.enteredPrice) : '');
  }, [item, initial, defaultCourse]);

  const errors = useMemo(() => {
    if (!item || !line) return [];
    const out: string[] = [];
    for (const g of item.modifierGroups) {
      const chosen = line.modifiers.filter((m) => m.groupId === g.id).length;
      const min = g.isRequired ? Math.max(1, g.minSelect) : g.minSelect;
      if (chosen < min) out.push(`Chọn ${g.name}`);
      if (g.maxSelect > 0 && chosen > g.maxSelect) out.push(`${g.name}: tối đa ${g.maxSelect}`);
    }
    if (item.pricingMode === 'VARIANT' && !line.variantId) out.push('Chọn cỡ');
    if ((item.pricingMode === 'MARKET' || item.pricingMode === 'OPEN') && !line.enteredPrice) out.push('Nhập giá bán');
    if (item.pricingMode === 'OPEN' && !line.customName?.trim()) out.push('Nhập tên món');
    if (!(line.quantity > 0)) out.push('Số lượng phải lớn hơn 0');
    return out;
  }, [item, line]);

  if (!item || !line) return null;
  const isWeight = item.pricingMode === 'WEIGHT';
  const isOpenPrice = item.pricingMode === 'MARKET' || item.pricingMode === 'OPEN';
  const total = errors.length === 0 ? cartLineTotal(line) : 0;

  const toggleOption = (g: BranchMenuItemView['modifierGroups'][number], o: (typeof g.options)[number]) => {
    const others = line.modifiers.filter((m) => m.groupId !== g.id);
    const mine = line.modifiers.filter((m) => m.groupId === g.id);
    const already = mine.some((m) => m.optionId === o.id);
    const entry = { groupId: g.id, groupCode: g.code, groupName: g.name, optionId: o.id, optionCode: o.code, optionName: o.name, priceDelta: o.priceDelta };
    let next: CartLine['modifiers'];
    if (g.maxSelect === 1) next = [...others, ...(already && !g.isRequired ? [] : [entry])];
    else if (already) next = [...others, ...mine.filter((m) => m.optionId !== o.id)];
    else next = g.maxSelect > 0 && mine.length >= g.maxSelect ? line.modifiers : [...others, ...mine, entry];
    setLine({ ...line, modifiers: next });
  };

  const setQty = (text: string) => {
    setQtyText(text);
    const n = Number(text.replace(',', '.'));
    if (Number.isFinite(n)) setLine({ ...line, quantity: isWeight ? Math.round(n * 1000) / 1000 : Math.max(0, Math.floor(n)) });
  };
  const bump = (d: number) => {
    const n = Math.max(isWeight ? 0.1 : 1, (isWeight ? Math.round((line.quantity + d * 0.1) * 1000) / 1000 : line.quantity + d));
    setLine({ ...line, quantity: n });
    setQtyText(String(n));
  };

  return (
    <Dialog open onClose={onClose} title={item.name} size="md" footer={
      <div className="flex w-full items-center gap-2">
        <div className="flex-1">
          <div className="text-xs text-ink-500">Thành tiền</div>
          <div className="text-xl font-bold text-brand-800 tabular-nums">{errors.length ? '—' : money(total)}</div>
        </div>
        <Button size="lg" disabled={errors.length > 0} onClick={() => onSubmit(line)}>
          {initial ? 'Cập nhật' : 'Thêm vào giỏ'}
        </Button>
      </div>
    }>
      <div className="space-y-4">
        {item.description && <p className="text-sm text-ink-500">{item.description}</p>}
        {item.pricingMode === 'VARIANT' && (
          <Section title="Cỡ">
            <div className="grid grid-cols-2 gap-2">
              {item.variants.map((v) => (
                <Choice key={v.id} active={line.variantId === v.id} onClick={() => setLine({ ...line, variantId: v.id, variantName: v.name, variantPrice: v.price })} label={v.name} sub={moneyPlain(v.price)} />
              ))}
            </div>
          </Section>
        )}
        {item.modifierGroups.map((g) => (
          <Section key={g.id} title={`${g.name}${g.isRequired ? ' *' : ''}${g.maxSelect > 1 ? ` (tối đa ${g.maxSelect})` : ''}`}>
            <div className="grid grid-cols-2 gap-2">
              {g.options.map((o) => (
                <Choice key={o.id} active={line.modifiers.some((m) => m.optionId === o.id)} onClick={() => toggleOption(g, o)} label={o.name} sub={o.priceDelta ? `+${moneyPlain(o.priceDelta)}` : undefined} />
              ))}
            </div>
          </Section>
        ))}
        {item.pricingMode === 'OPEN' && <Input label="Tên món" value={line.customName ?? ''} onChange={(e) => setLine({ ...line, customName: e.target.value })} placeholder="Ví dụ: Món theo yêu cầu" />}
        {isOpenPrice && (
          <Section title={`Giá bán (đồng/${item.unit})`}>
            <input inputMode="numeric" value={priceText} onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); setPriceText(v); setLine({ ...line, enteredPrice: v ? Number(v) : undefined }); }} className="min-h-[52px] w-full rounded-xl border border-ink-300 px-3 text-right text-2xl font-bold tabular-nums outline-none focus:border-brand-500" placeholder="0" />
            <NumberPad value={priceText} onChange={(v) => { setPriceText(v); setLine({ ...line, enteredPrice: v ? Number(v) : undefined }); }} className="mt-2" />
          </Section>
        )}
        <Section title={isWeight ? `Trọng lượng (kg) · ${moneyPlain(item.price ?? 0)}/kg` : `Số lượng (${item.unit})`}>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => bump(-1)} className="flex h-12 w-12 items-center justify-center rounded-xl bg-ink-100" aria-label="Giảm"><Minus className="h-6 w-6" /></button>
            <input inputMode={isWeight ? 'decimal' : 'numeric'} value={qtyText} onChange={(e) => setQty(e.target.value)} className="min-h-[48px] flex-1 rounded-xl border border-ink-300 text-center text-2xl font-bold tabular-nums outline-none focus:border-brand-500" />
            <button type="button" onClick={() => bump(1)} className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-100 text-brand-800" aria-label="Tăng"><Plus className="h-6 w-6" /></button>
          </div>
          {isWeight && <p className="mt-1 text-xs text-ink-500">Nhập trọng lượng cân thực tế; có thể sửa lại trước khi tính tiền.</p>}
        </Section>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-ink-700">Đợt lên món</span>
            <div className="flex gap-1">
              {[1, 2, 3].map((c) => (
                <button key={c} type="button" onClick={() => setLine({ ...line, course: c })} className={cn('min-h-[44px] flex-1 rounded-xl border font-semibold', line.course === c ? 'border-brand-700 bg-brand-50 text-brand-800' : 'border-ink-100 bg-white')}>
                  {c}
                </button>
              ))}
            </div>
          </label>
          <Input label="Ghế (tùy chọn)" inputMode="numeric" value={line.seatNo ?? ''} onChange={(e) => setLine({ ...line, seatNo: e.target.value ? Number(e.target.value) : undefined })} placeholder="số ghế" />
        </div>
        <Textarea label="Ghi chú cho bếp" value={line.note ?? ''} onChange={(e) => setLine({ ...line, note: e.target.value || undefined })} placeholder="Ít cay, không hành, làm trước..." />
        <div className="flex flex-wrap gap-1.5">
          {['Ít cay', 'Không cay', 'Không hành', 'Ít đá', 'Làm trước', 'Mang về'].map((q) => (
            <button key={q} type="button" onClick={() => setLine({ ...line, note: line.note ? `${line.note}, ${q}` : q })} className="min-h-[36px] rounded-full bg-ink-100 px-3 text-sm">
              {q}
            </button>
          ))}
        </div>
        {errors.length > 0 && <p className="text-sm font-semibold text-amber-700">{errors.join(' · ')}</p>}
      </div>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-sm font-semibold text-ink-700">{title}</h3>
      {children}
    </div>
  );
}

function Choice({ active, onClick, label, sub }: { active: boolean; onClick: () => void; label: string; sub?: string }) {
  return (
    <button type="button" onClick={onClick} className={cn('flex min-h-[48px] flex-col items-start justify-center rounded-xl border px-3 py-1 text-left', active ? 'border-brand-700 bg-brand-50 text-brand-900' : 'border-ink-100 bg-white')}>
      <span className="font-semibold">{label}</span>
      {sub && <span className="text-xs text-ink-500">{sub}</span>}
    </button>
  );
}
