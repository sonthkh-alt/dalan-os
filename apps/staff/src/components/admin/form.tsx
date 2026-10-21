'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { codify } from '@dalan/domain';
import { cn, moneyPlain } from '@/lib/utils';
import type { Schedule } from '@/lib/queries-admin';
import { fieldClass } from '@/components/ui/primitives';

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink-900/[0.06] md:p-5', className)}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {title && <h2 className="text-base font-bold tracking-tight text-ink-900 md:text-lg">{title}</h2>}
          {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cn('flex min-h-[44px] cursor-pointer items-center gap-3 select-none', disabled && 'cursor-not-allowed opacity-50')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative h-7 w-12 shrink-0 rounded-full transition-colors', checked ? 'bg-brand-700' : 'bg-ink-300')}
      >
        <span className={cn('absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-card transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
      <span>
        <span className="block text-sm font-semibold text-ink-900">{label}</span>
        {hint && <span className="block text-xs text-ink-500">{hint}</span>}
      </span>
    </label>
  );
}

// Dùng chung lớp ô nhập của hệ thống thiết kế
const inputCls = fieldClass;

function Labeled({ label, hint, children }: { label?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-sm font-semibold text-ink-700">{label}</span>}
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-500">{hint}</span>}
    </label>
  );
}

/** Ô nhập số tiền VND (số nguyên), hiển thị phân cách hàng nghìn. `null` = để trống. */
export function MoneyInput({ label, value, onChange, hint, placeholder, disabled, allowNegative }: { label?: string; value: number | null; onChange: (v: number | null) => void; hint?: ReactNode; placeholder?: string; disabled?: boolean; allowNegative?: boolean }) {
  const [text, setText] = useState(value === null ? '' : moneyPlain(value));
  useEffect(() => {
    setText(value === null ? '' : (value < 0 ? '-' : '') + moneyPlain(Math.abs(value)));
  }, [value]);
  return (
    <Labeled label={label} hint={hint}>
      <div className="relative">
        <input
          inputMode="numeric"
          disabled={disabled}
          placeholder={placeholder}
          className={cn(inputCls, 'pr-8 text-right tabular-nums')}
          value={text}
          onChange={(e) => {
            const neg = allowNegative && e.target.value.trim().startsWith('-');
            const digits = e.target.value.replace(/\D/g, '');
            if (!digits) {
              setText(neg ? '-' : '');
              onChange(null);
              return;
            }
            const n = Number(digits) * (neg ? -1 : 1);
            setText((neg ? '-' : '') + moneyPlain(Math.abs(n)));
            onChange(n);
          }}
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-ink-500">đ</span>
      </div>
    </Labeled>
  );
}

/** Ô nhập phần trăm, lưu dạng basis points (10% = 1000). */
export function BpsInput({ label, value, onChange, hint, placeholder, disabled }: { label?: string; value: number | null; onChange: (v: number | null) => void; hint?: ReactNode; placeholder?: string; disabled?: boolean }) {
  const fmt = (v: number | null) => (v === null ? '' : String(v / 100).replace('.', ','));
  const [text, setText] = useState(fmt(value));
  useEffect(() => {
    setText((cur) => (parseBps(cur) === value ? cur : fmt(value)));
  }, [value]);
  return (
    <Labeled label={label} hint={hint}>
      <div className="relative">
        <input
          inputMode="decimal"
          disabled={disabled}
          placeholder={placeholder}
          className={cn(inputCls, 'pr-8 text-right tabular-nums')}
          value={text}
          onChange={(e) => {
            const t = e.target.value.replace(/[^\d.,]/g, '');
            setText(t);
            onChange(parseBps(t));
          }}
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-ink-500">%</span>
      </div>
    </Labeled>
  );
}

function parseBps(t: string): number | null {
  if (!t.trim()) return null;
  const n = Number(t.replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(10000, Math.round(n * 100)));
}

/** Ô nhập số nguyên (null khi trống). */
export function IntInput({ label, value, onChange, hint, min, placeholder, disabled }: { label?: string; value: number | null; onChange: (v: number | null) => void; hint?: ReactNode; min?: number; placeholder?: string; disabled?: boolean }) {
  return (
    <Labeled label={label} hint={hint}>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        disabled={disabled}
        placeholder={placeholder}
        className={cn(inputCls, 'tabular-nums')}
        value={value ?? ''}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === '' ? null : Math.trunc(Number(v)));
        }}
      />
    </Labeled>
  );
}

/** Nhập nhãn cách nhau bằng dấu phẩy. */
export function TagsInput({ label, value, onChange, hint, placeholder }: { label?: string; value: string[]; onChange: (v: string[]) => void; hint?: ReactNode; placeholder?: string }) {
  const [text, setText] = useState(value.join(', '));
  useEffect(() => {
    setText((cur) => (splitTags(cur).join('|') === value.join('|') ? cur : value.join(', ')));
  }, [value]);
  return (
    <Labeled label={label} hint={hint}>
      <input
        className={inputCls}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(splitTags(e.target.value));
        }}
      />
    </Labeled>
  );
}

function splitTags(t: string): string[] {
  return t
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: 'T2' },
  { value: 2, label: 'T3' },
  { value: 3, label: 'T4' },
  { value: 4, label: 'T5' },
  { value: 5, label: 'T6' },
  { value: 6, label: 'T7' },
  { value: 7, label: 'CN' },
];

export function scheduleText(s: Schedule | null | undefined): string {
  if (!s || (!s.days?.length && !s.from && !s.to)) return 'Bán cả ngày, mọi ngày';
  const days = s.days?.length ? (s.days.length === 7 ? 'Mọi ngày' : WEEKDAYS.filter((d) => s.days!.includes(d.value)).map((d) => d.label).join(', ')) : 'Mọi ngày';
  const hours = s.from && s.to ? `${s.from}–${s.to}` : 'cả ngày';
  return `${days} · ${hours}`;
}

/** Lịch bán: chọn ngày trong tuần (ISO 1..7) và khung giờ. */
export function ScheduleEditor({ value, onChange }: { value: Schedule; onChange: (v: Schedule) => void }) {
  const days = value.days ?? [];
  const toggle = (d: number) => {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort();
    onChange(clean({ ...value, days: next }));
  };
  return (
    <div className="space-y-2">
      <span className="block text-sm font-semibold text-ink-700">Lịch bán</span>
      <div className="flex flex-wrap gap-1.5">
        {WEEKDAYS.map((d) => (
          <button key={d.value} type="button" onClick={() => toggle(d.value)} className={cn('min-h-[40px] min-w-[44px] rounded-lg border px-2 text-sm font-semibold', days.includes(d.value) ? 'border-brand-700 bg-brand-700 text-white' : 'border-ink-300 bg-white text-ink-700')}>
            {d.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Labeled label="Từ giờ">
          <input type="time" className={inputCls} value={value.from ?? ''} onChange={(e) => onChange(clean({ ...value, from: e.target.value || undefined }))} />
        </Labeled>
        <Labeled label="Đến giờ">
          <input type="time" className={inputCls} value={value.to ?? ''} onChange={(e) => onChange(clean({ ...value, to: e.target.value || undefined }))} />
        </Labeled>
      </div>
      <p className="text-xs text-ink-500">Không chọn ngày = mọi ngày; bỏ trống giờ = cả ngày. Giờ kết thúc nhỏ hơn giờ bắt đầu nghĩa là qua đêm.</p>
    </div>
  );
}

function clean(s: Schedule): Schedule {
  const out: Schedule = {};
  if (s.days?.length) out.days = s.days;
  if (s.from) out.from = s.from;
  if (s.to) out.to = s.to;
  return out;
}

/** Chỉ giữ các trường đã thay đổi (so sánh JSON) để gửi PATCH. */
export function diffPatch<T extends Record<string, unknown>>(original: Partial<T> | null | undefined, next: T): Partial<T> {
  if (!original) return next;
  const out: Partial<T> = {};
  for (const k of Object.keys(next) as (keyof T)[]) {
    if (JSON.stringify(original[k] ?? null) !== JSON.stringify(next[k] ?? null)) out[k] = next[k];
  }
  return out;
}

export function SearchBox({ value, onChange, placeholder = 'Tìm kiếm (gõ không dấu cũng được)' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input type="search" className={cn(inputCls, 'min-h-[44px]')} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />;
}

/** Bảng đơn giản cuộn ngang trên màn nhỏ. */
export function Table({ head, children, className }: { head: ReactNode[]; children: ReactNode; className?: string }) {
  return (
    <div className={cn('scrollbar-thin overflow-x-auto', className)}>
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-ink-100 text-left text-xs font-semibold tracking-wide text-ink-500 uppercase">
            {head.map((h, i) => (
              <th key={i} className="px-2 py-2 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function codeFrom(name: string): string {
  return codify(name);
}
