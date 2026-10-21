'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { cn, moneyPlain } from '@/lib/utils';

/** Tiêu đề trang vận hành: tên, mô tả ngắn, nút thao tác bên phải. */
export function PageHeader({ title, subtitle, actions, className }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-3 border-b border-ink-100 bg-white px-4 py-3', className)}>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-bold text-ink-900">{title}</h1>
        {subtitle && <div className="text-sm text-ink-500">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Thanh tab cuộn ngang, vùng chạm lớn. */
export function TabBar<T extends string>({ value, onChange, tabs, className }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode; badge?: number | null }[]; className?: string }) {
  return (
    <div className={cn('no-scrollbar flex gap-1 overflow-x-auto border-b border-ink-100 bg-white px-2', className)} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn('relative flex min-h-[48px] shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm font-semibold whitespace-nowrap', value === t.value ? 'border-brand-700 text-brand-800' : 'border-transparent text-ink-500 hover:text-ink-900')}
        >
          {t.label}
          {t.badge ? <span className="min-w-5 rounded-full bg-red-600 px-1.5 text-center text-[11px] leading-5 text-white">{t.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Card({ title, actions, children, className, bodyClassName }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cn('rounded-2xl border border-ink-100 bg-white', className)}>
      {(title || actions) && (
        <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-2.5">
          <h2 className="min-w-0 flex-1 truncate font-bold text-ink-900">{title}</h2>
          {actions}
        </div>
      )}
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, tone = 'neutral' }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' }) {
  const tones = { neutral: 'text-ink-900', brand: 'text-brand-800', success: 'text-emerald-700', warning: 'text-amber-700', danger: 'text-red-700' };
  return (
    <div className="rounded-2xl border border-ink-100 bg-white px-4 py-3">
      <div className="text-xs font-semibold tracking-wide text-ink-500 uppercase">{label}</div>
      <div className={cn('text-2xl font-black tabular-nums', tones[tone])}>{value}</div>
      {hint && <div className="text-xs text-ink-500">{hint}</div>}
    </div>
  );
}

/** Chip lọc trạng thái. */
export function FilterChips<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; count?: number }[] }) {
  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn('flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold', value === o.value ? 'border-brand-700 bg-brand-50 text-brand-900' : 'border-ink-100 bg-white text-ink-700')}
        >
          {o.label}
          {o.count !== undefined && <span className="rounded-full bg-ink-100 px-1.5 text-xs text-ink-700">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Ô nhập tiền VND: hiển thị phân cách hàng nghìn, trả về số nguyên. */
export function MoneyInput({ label, value, onChange, hint, disabled, placeholder, className }: { label?: string; value: number | null; onChange: (v: number | null) => void; hint?: string; disabled?: boolean; placeholder?: string; className?: string }) {
  const [text, setText] = useState(value === null || value === undefined ? '' : moneyPlain(value));
  useEffect(() => {
    const parsed = Number(text.replace(/\D/g, '') || 'NaN');
    if ((value ?? null) !== (Number.isNaN(parsed) ? null : parsed)) setText(value === null || value === undefined ? '' : moneyPlain(value));
  }, [value, text]);
  return (
    <label className={cn('block', className)}>
      {label && <span className="mb-1 block text-sm font-semibold text-ink-700">{label}</span>}
      <div className="relative">
        <input
          inputMode="numeric"
          value={text}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '');
            setText(digits ? moneyPlain(Number(digits)) : '');
            onChange(digits ? Number(digits) : null);
          }}
          className="min-h-[48px] w-full rounded-xl border border-ink-300 bg-white px-3 pr-8 text-right text-base text-ink-900 tabular-nums outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 disabled:bg-ink-100"
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-ink-500">đ</span>
      </div>
      {hint && <span className="mt-1 block text-xs text-ink-500">{hint}</span>}
    </label>
  );
}

/** Ô nhập số (cho phép thập phân) trả về number | null. */
export function NumberInput({ label, value, onChange, min, step, hint, suffix, disabled, className, inputClassName }: { label?: string; value: number | null; onChange: (v: number | null) => void; min?: number; step?: number | 'any'; hint?: string; suffix?: string; disabled?: boolean; className?: string; inputClassName?: string }) {
  return (
    <label className={cn('block', className)}>
      {label && <span className="mb-1 block text-sm font-semibold text-ink-700">{label}</span>}
      <div className="relative">
        <input
          type="number"
          inputMode="decimal"
          value={value === null || Number.isNaN(value) ? '' : value}
          min={min}
          step={step ?? 'any'}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className={cn('min-h-[48px] w-full rounded-xl border border-ink-300 bg-white px-3 text-base text-ink-900 tabular-nums outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 disabled:bg-ink-100', suffix && 'pr-12', inputClassName)}
        />
        {suffix && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-ink-500">{suffix}</span>}
      </div>
      {hint && <span className="mt-1 block text-xs text-ink-500">{hint}</span>}
    </label>
  );
}

export function Checkbox({ label, checked, onChange, hint }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; hint?: ReactNode }) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-start gap-3 py-1">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-5 w-5 accent-brand-700" />
      <span>
        <span className="block text-base text-ink-900">{label}</span>
        {hint && <span className="block text-xs text-ink-500">{hint}</span>}
      </span>
    </label>
  );
}

/** Bảng đơn giản, cuộn ngang trên điện thoại. */
export function Table({ head, children, className, empty }: { head: ReactNode[]; children: ReactNode; className?: string; empty?: ReactNode }) {
  return (
    <div className={cn('scrollbar-thin overflow-x-auto rounded-xl border border-ink-100 bg-white', className)}>
      <table className="w-full min-w-[560px] text-sm">
        <thead className="bg-paper text-left text-xs font-semibold tracking-wide text-ink-500 uppercase">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="px-3 py-2 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

export function ErrorBox({ error, className }: { error: unknown; className?: string }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : 'Có lỗi xảy ra';
  return <div className={cn('rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800', className)}>{message}</div>;
}

/** Ô tìm kiếm có trì hoãn. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
