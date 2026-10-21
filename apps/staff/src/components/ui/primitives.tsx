'use client';

import Link from 'next/link';
import { forwardRef, type ComponentType, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronRight, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

type IconType = ComponentType<{ className?: string }>;

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info'; className?: string }) {
  const tones = {
    neutral: 'bg-ink-100 text-ink-700 ring-ink-200/60',
    brand: 'bg-brand-50 text-brand-800 ring-brand-200/70',
    success: 'bg-emerald-50 text-emerald-800 ring-emerald-200/80',
    warning: 'bg-amber-50 text-amber-800 ring-amber-200/80',
    danger: 'bg-red-50 text-red-800 ring-red-200/80',
    info: 'bg-sky-50 text-sky-800 ring-sky-200/80',
  };
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset', tones[tone], className)}>{children}</span>;
}

/** Lớp chung cho ô nhập: viền mảnh, vòng sáng thương hiệu khi focus. */
export const fieldClass =
  'min-h-[48px] w-full rounded-xl border border-ink-200 bg-white px-3.5 text-base text-ink-900 shadow-[inset_0_1px_1px_rgb(31_27_28/0.03)] outline-none transition-[border-color,box-shadow] placeholder:text-ink-300 hover:border-ink-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 disabled:bg-ink-50 disabled:text-ink-500';

const labelClass = 'mb-1.5 block text-sm font-semibold text-ink-700';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }>(function Input({ label, hint, className, id, ...rest }, ref) {
  return (
    <label className="block">
      {label && <span className={labelClass}>{label}</span>}
      <input ref={ref} id={id} className={cn(fieldClass, className)} {...rest} />
      {hint && <span className="mt-1 block text-xs text-ink-500">{hint}</span>}
    </label>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }>(function Textarea({ label, className, ...rest }, ref) {
  return (
    <label className="block">
      {label && <span className={labelClass}>{label}</span>}
      <textarea ref={ref} className={cn(fieldClass, 'min-h-[88px] py-2.5', className)} {...rest} />
    </label>
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { label?: string }>(function Select({ label, className, children, ...rest }, ref) {
  return (
    <label className="block">
      {label && <span className={labelClass}>{label}</span>}
      <select ref={ref} className={cn(fieldClass, 'select-chevron cursor-pointer pr-10', className)} {...rest}>
        {children}
      </select>
    </label>
  );
});

export function Spinner({ className }: { className?: string }) {
  return <span role="status" className={cn('inline-block h-6 w-6 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-700', className)} aria-label="Đang tải" />;
}

/** Trạng thái rỗng có biểu tượng và một thao tác gợi ý (không để người dùng “bí đường”). */
export function EmptyState({ title, hint, action, icon: Icon = Inbox, className }: { title: string; hint?: string; action?: ReactNode; icon?: IconType; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 px-4 py-12 text-center', className)}>
      <span className="mb-1 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-ink-300 shadow-card ring-1 ring-ink-100">
        <Icon className="h-7 w-7" />
      </span>
      <p className="text-lg font-semibold text-ink-900">{title}</p>
      {hint && <p className="max-w-sm text-sm text-ink-500">{hint}</p>}
      {action && <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div>}
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

/** Khối giữ chỗ khi đang tải. */
export function Skeleton({ className }: { className?: string }) {
  return <span className={cn('block animate-pulse rounded-lg bg-ink-100', className)} aria-hidden />;
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={cn('inline-flex rounded-xl bg-ink-900/[0.06] p-1', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn('min-h-[40px] rounded-lg px-3 text-sm font-semibold transition-all', value === o.value ? 'bg-white text-brand-800 shadow-card ring-1 ring-ink-900/5' : 'text-ink-500 hover:text-ink-900')}
        >
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

// ───────── Thẻ (bổ sung) ─────────

/** Thẻ bề mặt trắng, bo 2xl, bóng mềm. `title`/`actions` tạo phần đầu thẻ. */
export function Card({ title, subtitle, actions, children, className, bodyClassName, padded = true }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string; bodyClassName?: string; padded?: boolean }) {
  return (
    <section className={cn('rounded-2xl bg-white shadow-card ring-1 ring-ink-900/[0.06]', className)}>
      {(title || actions) && (
        <header className="flex items-start gap-3 px-4 pt-4 pb-1 md:px-5">
          <div className="min-w-0 flex-1">
            {title && <h2 className="truncate text-base font-bold tracking-tight text-ink-900">{title}</h2>}
            {subtitle && <p className="text-sm text-ink-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn(padded && 'p-4 md:px-5', bodyClassName)}>{children}</div>
    </section>
  );
}

export type StatTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

const statIconTones: Record<StatTone, string> = {
  neutral: 'bg-ink-100 text-ink-700',
  brand: 'bg-brand-50 text-brand-700',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
  info: 'bg-sky-50 text-sky-700',
};

/** Thẻ chỉ số (KPI): nhãn, giá trị lớn, ghi chú/xu hướng; có thể bấm để mở trang chi tiết. */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
  trend,
  href,
  loading,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: IconType;
  tone?: StatTone;
  /** Phần trăm thay đổi (dương = tăng). */
  trend?: number | null;
  href?: string;
  loading?: boolean;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-ink-500">{label}</span>
        {Icon && (
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', statIconTones[tone])}>
            <Icon className="h-5 w-5" />
          </span>
        )}
      </div>
      {loading ? <Skeleton className="mt-2 h-8 w-24" /> : <div className={cn('mt-1 text-[28px] leading-tight font-extrabold tracking-tight tabular-nums', tone === 'danger' ? 'text-red-700' : tone === 'warning' ? 'text-amber-700' : 'text-ink-900')}>{value}</div>}
      <div className="mt-1 flex min-h-5 flex-wrap items-center gap-1.5 text-xs text-ink-500">
        {trend !== undefined && trend !== null && (
          <span className={cn('rounded-full px-1.5 py-0.5 font-semibold', trend >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')}>
            {trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%
          </span>
        )}
        {hint}
      </div>
    </>
  );
  const cls = cn('group relative block rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink-900/[0.06] transition', href && 'hover:-translate-y-0.5 hover:shadow-raised', className);
  if (href)
    return (
      <Link href={href} className={cls}>
        {body}
        <ChevronRight className="absolute right-3 bottom-3 h-4 w-4 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-brand-700" aria-hidden />
      </Link>
    );
  return <div className={cls}>{body}</div>;
}

/** Phím tắt hiển thị (ví dụ Ctrl K). */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cn('inline-flex min-w-6 items-center justify-center rounded-md border border-ink-200 bg-white px-1.5 font-sans text-[11px] font-semibold text-ink-500 shadow-[0_1px_0_rgb(31_27_28/0.08)]', className)}>{children}</kbd>;
}
