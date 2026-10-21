'use client';

import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info'; className?: string }) {
  const tones = {
    neutral: 'bg-ink-100 text-ink-700',
    brand: 'bg-brand-100 text-brand-800',
    success: 'bg-emerald-100 text-emerald-800',
    warning: 'bg-amber-100 text-amber-800',
    danger: 'bg-red-100 text-red-800',
    info: 'bg-sky-100 text-sky-800',
  };
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', tones[tone], className)}>{children}</span>;
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }>(function Input({ label, hint, className, id, ...rest }, ref) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-sm font-semibold text-ink-700">{label}</span>}
      <input ref={ref} id={id} className={cn('min-h-[48px] w-full rounded-xl border border-ink-300 bg-white px-3 text-base text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 disabled:bg-ink-100', className)} {...rest} />
      {hint && <span className="mt-1 block text-xs text-ink-500">{hint}</span>}
    </label>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }>(function Textarea({ label, className, ...rest }, ref) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-sm font-semibold text-ink-700">{label}</span>}
      <textarea ref={ref} className={cn('min-h-[80px] w-full rounded-xl border border-ink-300 bg-white px-3 py-2 text-base text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200', className)} {...rest} />
    </label>
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { label?: string }>(function Select({ label, className, children, ...rest }, ref) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-sm font-semibold text-ink-700">{label}</span>}
      <select ref={ref} className={cn('min-h-[48px] w-full rounded-xl border border-ink-300 bg-white px-3 text-base text-ink-900 outline-none focus:border-brand-500', className)} {...rest}>
        {children}
      </select>
    </label>
  );
});

export function Spinner({ className }: { className?: string }) {
  return <span className={cn('inline-block h-6 w-6 animate-spin rounded-full border-[3px] border-brand-300 border-t-brand-700', className)} aria-label="Đang tải" />;
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <p className="text-lg font-semibold text-ink-700">{title}</p>
      {hint && <p className="max-w-sm text-sm text-ink-500">{hint}</p>}
      {action}
    </div>
  );
}

export function Loading({ label = 'Đang tải...' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-ink-500">
      <Spinner /> <span>{label}</span>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={cn('inline-flex rounded-xl bg-ink-100 p-1', className)}>
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} className={cn('min-h-[40px] rounded-lg px-3 text-sm font-semibold', value === o.value ? 'bg-white text-brand-800 shadow' : 'text-ink-500')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Row({ label, value, bold, className }: { label: ReactNode; value: ReactNode; bold?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 py-1', bold && 'text-lg font-bold', className)}>
      <span className="text-ink-700">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
