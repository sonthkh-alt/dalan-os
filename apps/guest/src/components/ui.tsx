'use client';

import Link from 'next/link';
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CircleAlert, CircleCheck, Minus, Plus, TriangleAlert, X } from 'lucide-react';
import { create } from 'zustand';
import { cn } from '@/lib/format';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold' | 'soft';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_BASE =
  'inline-flex select-none items-center justify-center gap-2 rounded-2xl font-semibold transition duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maroon';
const BUTTON_SIZES: Record<ButtonSize, string> = { sm: 'min-h-10 px-3.5 text-sm', md: 'min-h-12 px-5 text-[15px]', lg: 'min-h-14 px-6 text-base' };
const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-maroon text-white shadow-[0_6px_16px_-6px_rgb(139_30_45/0.6)] hover:bg-maroon-dark',
  secondary: 'bg-paper text-maroon ring-1 ring-inset ring-maroon/25 hover:bg-maroon-soft',
  ghost: 'bg-transparent text-ink-soft hover:bg-cream-dark',
  danger: 'bg-danger text-white',
  gold: 'bg-linear-to-br from-gold-light to-gold text-maroon-deep shadow-[0_6px_16px_-6px_rgb(184_134_11/0.6)]',
  soft: 'bg-maroon-soft text-maroon hover:bg-maroon/15',
};

/** Lớp CSS của nút, dùng chung cho <button> và <Link>. */
export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string): string {
  return cn(BUTTON_BASE, BUTTON_SIZES[size], BUTTON_VARIANTS[variant], className);
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  loading,
  disabled,
  children,
  type = 'button',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean }) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner className={cn('h-4 w-4', variant === 'primary' || variant === 'danger' ? 'border-white/50 border-t-white' : '')} /> : null}
      {children}
    </button>
  );
}

/** Liên kết trông như nút (tránh lồng <button> trong <a>). */
export function LinkButton({
  href,
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...rest
}: { href: string; variant?: ButtonVariant; size?: ButtonSize; className?: string; children: ReactNode } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden className={cn('inline-block h-6 w-6 animate-spin rounded-full border-2 border-maroon/25 border-t-maroon', className)} />;
}

export function PageSpinner() {
  return (
    <div className="flex justify-center py-24" role="status" aria-live="polite">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

export function Chip({ active, className, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm font-medium transition',
        active ? 'bg-ink text-white shadow-sm' : 'bg-paper text-ink-soft ring-1 ring-inset ring-line hover:ring-maroon/40',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-card bg-paper p-4 shadow-card ring-1 ring-line-soft', className)}>{children}</div>;
}

export function Badge({ tone = 'neutral', className, children }: { tone?: 'neutral' | 'maroon' | 'gold' | 'success' | 'warn' | 'danger' | 'dark'; className?: string; children: ReactNode }) {
  const tones = {
    neutral: 'bg-cream-dark text-ink-soft',
    maroon: 'bg-maroon-soft text-maroon',
    gold: 'bg-gold-soft text-gold',
    success: 'bg-success-soft text-success',
    warn: 'bg-warn-soft text-warn',
    danger: 'bg-danger-soft text-danger',
    dark: 'bg-ink/80 text-white',
  };
  return <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4', tones[tone], className)}>{children}</span>;
}

/** Tiêu đề trang: dòng nhỏ phía trên + tiêu đề serif + mô tả. */
export function PageTitle({ eyebrow, title, subtitle, action }: { eyebrow?: ReactNode; title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3 pt-2">
      <div className="min-w-0">
        {eyebrow ? <p className="text-xs font-semibold tracking-[0.14em] text-gold uppercase">{eyebrow}</p> : null}
        <h1 className="mt-0.5 font-serif text-[28px] leading-tight font-bold text-ink">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-ink-soft">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-3 flex items-center justify-between gap-2', className)}>
      <h2 className="font-serif text-xl font-bold text-ink">{children}</h2>
      {action}
    </div>
  );
}

export function EmptyState({ icon, title, body, action, className }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex animate-rise flex-col items-center gap-3 px-6 py-12 text-center', className)}>
      {icon ? <div className="mb-1 flex h-20 w-20 items-center justify-center rounded-full bg-maroon-soft text-maroon">{icon}</div> : null}
      <p className="font-serif text-xl font-bold text-ink">{title}</p>
      {body ? <div className="max-w-sm text-sm leading-relaxed text-ink-soft">{body}</div> : null}
      {action ? <div className="mt-2 flex w-full max-w-xs flex-col gap-2">{action}</div> : null}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-ink">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-ink-muted">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  'w-full min-h-12 rounded-2xl border border-line bg-paper px-4 py-3 text-base text-ink placeholder:text-ink-muted transition focus:border-maroon focus:outline-none focus:ring-4 focus:ring-maroon/10';

/** Bộ tăng giảm số lượng, nút 44px. */
export function QuantityStepper({ value, onChange, min = 1, max = 99, size = 'md', label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; size?: 'sm' | 'md'; label?: string }) {
  const btn = size === 'sm' ? 'h-9 w-9' : 'h-12 w-12';
  return (
    <div className="inline-flex items-center rounded-full bg-paper ring-1 ring-line" role="group" aria-label={label}>
      <button type="button" aria-label="−" className={cn(btn, 'flex items-center justify-center rounded-full text-ink-soft transition hover:bg-cream-dark disabled:opacity-40')} onClick={() => onChange(value - 1)} disabled={value <= min}>
        <Minus className="h-4 w-4" />
      </button>
      <span className={cn('tabular text-center font-bold text-ink', size === 'sm' ? 'w-7 text-sm' : 'w-9 text-lg')} aria-live="polite">
        {value}
      </span>
      <button type="button" aria-label="+" className={cn(btn, 'flex items-center justify-center rounded-full text-maroon transition hover:bg-maroon-soft disabled:opacity-40')} onClick={() => onChange(value + 1)} disabled={value >= max}>
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Bottom sheet dùng cho chi tiết món, giỏ hàng, biểu mẫu. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  bare,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Không đệm nội dung (để ảnh tràn viền) */
  bare?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open || typeof document === 'undefined') return null;
  // Portal ra body để tổ tiên có backdrop-filter/transform không cắt mất sheet
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Đóng" className="absolute inset-0 animate-fade-in bg-maroon-deep/45 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative flex max-h-[92dvh] w-full max-w-lg animate-sheet-up flex-col overflow-hidden rounded-t-[28px] bg-cream shadow-2xl sm:rounded-[28px]">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-2">
          <div className="h-1.5 w-10 rounded-full bg-ink/15" />
        </div>
        {title ? (
          <div className="flex items-center justify-between gap-2 px-5 pt-6 pb-3">
            <h2 className="font-serif text-xl font-bold text-ink">{title}</h2>
            <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-paper text-ink-soft ring-1 ring-line hover:bg-cream-dark" aria-label="Đóng">
              <X className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <button type="button" onClick={onClose} className="absolute top-3 right-3 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-paper/90 text-ink shadow-md backdrop-blur" aria-label="Đóng">
            <X className="h-5 w-5" />
          </button>
        )}
        <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain', bare ? 'pb-4' : cn('px-5 pb-4', title ? '' : 'pt-8'))}>{children}</div>
        {footer ? <div className="safe-bottom border-t border-line-soft bg-paper/95 px-5 pt-3 backdrop-blur">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

interface ToastState {
  message: string | null;
  tone: 'ok' | 'warn' | 'error';
  /** Đổi mỗi lần hiển thị để reset bộ hẹn giờ khi cùng nội dung */
  nonce: number;
  show: (message: string, tone?: ToastState['tone']) => void;
  hide: () => void;
}
export const useToast = create<ToastState>((set) => ({
  message: null,
  tone: 'ok',
  nonce: 0,
  show: (message, tone = 'ok') => set((s) => ({ message, tone, nonce: s.nonce + 1 })),
  hide: () => set({ message: null }),
}));

export function Toaster() {
  const { message, tone, nonce, hide } = useToast();
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(hide, 3200);
    return () => clearTimeout(t);
  }, [message, nonce, hide]);
  if (!message) return null;
  const tones = { ok: 'bg-ink text-white', warn: 'bg-warn text-white', error: 'bg-danger text-white' };
  const Icon = tone === 'ok' ? CircleCheck : tone === 'warn' ? TriangleAlert : CircleAlert;
  return (
    <div className="pointer-events-none fixed inset-x-0 z-60 flex justify-center px-4" style={{ top: 'calc(var(--safe-top) + 0.75rem)' }} role="status" aria-live="polite">
      <div key={nonce} className={cn('pointer-events-auto flex max-w-md animate-rise items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-medium shadow-float', tones[tone])} onClick={hide}>
        <Icon className={cn('h-5 w-5 shrink-0', tone === 'ok' ? 'text-gold-light' : '')} />
        {message}
      </div>
    </div>
  );
}
