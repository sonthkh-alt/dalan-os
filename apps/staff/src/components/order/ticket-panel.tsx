'use client';

import { Minus, PauseCircle, Plus, Send, Trash2 } from 'lucide-react';
import type { BranchMenuItemView } from '@dalan/contracts';
import { cn, moneyPlain, qty } from '@/lib/utils';
import { cartLineLabel, cartLineTotal, type CartLine } from './cart-store';

export interface CartSectionProps {
  cart: CartLine[];
  items: Map<string, BranchMenuItemView>;
  onInc: (line: CartLine) => void;
  onDec: (line: CartLine) => void;
  onEdit: (line: CartLine) => void;
  onRemove: (line: CartLine) => void;
  onClear: () => void;
}

/** Phần "Chưa gửi bếp": giỏ nháp nhóm theo đợt; đợt 2 trở đi sẽ được giữ lại tới khi gọi đợt. */
export function CartSection({ cart, items, onInc, onDec, onEdit, onRemove, onClear }: CartSectionProps) {
  if (cart.length === 0) return null;
  const courses = [...new Set(cart.map((l) => l.course))].sort((a, b) => a - b);
  return (
    <section className="overflow-hidden rounded-2xl border-2 border-brand-500 bg-white shadow-sm">
      <div className="flex min-h-12 items-center gap-2 bg-brand-700 px-3 text-white">
        <span className="text-sm font-bold">Chưa gửi bếp</span>
        <span className="rounded-full bg-white/20 px-2 text-xs tabular-nums">{cart.length}</span>
        <button type="button" onClick={onClear} className="ml-auto min-h-11 rounded-lg px-3 text-xs font-semibold text-white/90 hover:bg-white/10">
          Xóa tất cả
        </button>
      </div>
      {courses.map((c) => (
        <div key={c}>
          {(courses.length > 1 || c > 1) && (
            <div className={cn('flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold', c > 1 ? 'bg-sky-50 text-sky-900' : 'bg-paper text-ink-700')}>
              {c > 1 && <PauseCircle className="h-3.5 w-3.5" />}
              Đợt {c} {c > 1 ? '· sẽ giữ lại, gọi đợt khi khách sẵn sàng' : '· gửi bếp ngay'}
            </div>
          )}
          <ul className="divide-y divide-ink-100">
            {cart
              .filter((l) => l.course === c)
              .map((l) => {
                const weight = l.pricingMode === 'WEIGHT';
                const soldOut = items.get(l.itemId)?.soldOut;
                const meta = [...l.modifiers.map((m) => m.optionName), l.seatNo ? `Ghế ${l.seatNo}` : null].filter(Boolean).join(' · ');
                return (
                  <li key={l.key} className="flex items-center gap-2 px-2 py-2">
                    <div className="flex shrink-0 items-center rounded-xl bg-ink-100/60">
                      <button type="button" onClick={() => onDec(l)} className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-700 active:bg-ink-300" aria-label={l.quantity <= 1 || weight ? 'Bỏ món' : 'Giảm'}>
                        {l.quantity <= 1 || weight ? <Trash2 className="h-4 w-4" /> : <Minus className="h-5 w-5" />}
                      </button>
                      <span className="min-w-8 text-center text-base font-extrabold tabular-nums">
                        {qty(l.quantity)}
                        {weight ? <span className="text-[10px]">kg</span> : ''}
                      </span>
                      <button type="button" onClick={() => onInc(l)} className="flex h-11 w-11 items-center justify-center rounded-xl text-brand-800 active:bg-brand-100" aria-label="Tăng">
                        <Plus className="h-5 w-5" />
                      </button>
                    </div>
                    <button type="button" onClick={() => onEdit(l)} className="min-h-11 min-w-0 flex-1 text-left">
                      <span className="block truncate text-sm font-semibold">{cartLineLabel(l)}</span>
                      {meta && <span className="block truncate text-xs text-ink-500">{meta}</span>}
                      {l.note && <span className="block truncate text-xs font-semibold text-amber-800">⚑ {l.note}</span>}
                      {soldOut && <span className="block text-xs font-bold text-red-700">Món vừa báo hết – bỏ hoặc đổi món</span>}
                    </button>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{moneyPlain(cartLineTotal(l))}</span>
                    <button type="button" onClick={() => onRemove(l)} className="flex h-11 w-9 shrink-0 items-center justify-center rounded-lg text-ink-300 hover:text-red-700" aria-label="Bỏ món">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
      <p className="border-t border-ink-100 bg-paper px-3 py-1.5 text-[11px] text-ink-500">Chạm tên món để sửa ghi chú, tùy chọn, đợt, ghế.</p>
    </section>
  );
}

/** Nút gửi bếp lớn kiểu Toast: hiện số món và tổng tiền giỏ. */
export function SendButton({ count, total, loading, disabled, onClick, className }: { count: number; total: number; loading?: boolean; disabled?: boolean; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={cn('flex min-h-14 w-full items-center gap-3 rounded-2xl bg-brand-700 px-4 text-left text-white shadow-md transition hover:bg-brand-800 active:scale-[0.99] disabled:opacity-60', className)}
    >
      {loading ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Send className="h-6 w-6" />}
      <span className="flex-1 text-lg font-bold">{loading ? 'Đang gửi bếp...' : 'Gửi bếp'}</span>
      <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-sm font-bold tabular-nums">{count} món</span>
      <span className="text-lg font-extrabold tabular-nums">{moneyPlain(total)}</span>
    </button>
  );
}
