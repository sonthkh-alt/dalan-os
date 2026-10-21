'use client';

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { create } from 'zustand';
import { cn } from '@/lib/format';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  loading,
  disabled,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md' | 'lg'; loading?: boolean }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-maroon';
  const sizes = { sm: 'min-h-10 px-3 text-sm', md: 'min-h-12 px-4 text-base', lg: 'min-h-14 px-5 text-lg' };
  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-maroon text-white hover:bg-maroon-dark shadow-sm',
    secondary: 'bg-paper text-maroon border border-maroon/30 hover:bg-maroon-soft',
    ghost: 'bg-transparent text-ink-soft hover:bg-cream-dark',
    danger: 'bg-danger text-white',
  };
  return (
    <button className={cn(base, sizes[size], variants[variant], className)} disabled={disabled || loading} {...rest}>
      {loading ? <Spinner className="h-4 w-4 border-white/60 border-t-white" /> : null}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden className={cn('inline-block h-6 w-6 animate-spin rounded-full border-2 border-maroon/30 border-t-maroon', className)} />;
}

export function Chip({ active, className, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        'whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition',
        active ? 'border-maroon bg-maroon text-white' : 'border-line bg-paper text-ink-soft hover:border-maroon/40',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-2xl border border-line bg-paper p-4 shadow-[0_1px_2px_rgba(31,26,23,0.04)]', className)}>{children}</div>;
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      {icon ? <div className="text-ink-muted">{icon}</div> : null}
      <p className="text-lg font-semibold text-ink">{title}</p>
      {body ? <p className="max-w-sm text-sm text-ink-soft">{body}</p> : null}
      {action}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink-soft">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-ink-muted">{hint}</span> : null}
    </label>
  );
}

export const inputClass = 'w-full rounded-xl border border-line bg-paper px-3 py-3 text-base text-ink placeholder:text-ink-muted focus:border-maroon focus:outline-none focus:ring-2 focus:ring-maroon/20';

/** Bottom sheet dùng cho chi tiết món, giỏ hàng, biểu mẫu. */
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; footer?: ReactNode }) {
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
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Đóng" className="absolute inset-0 animate-fade-in bg-ink/50" onClick={onClose} />
      <div className="relative flex max-h-[92dvh] w-full max-w-lg animate-sheet-up flex-col rounded-t-3xl bg-cream shadow-2xl">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="mx-auto h-1.5 w-10 rounded-full bg-line" />
        </div>
        {title ? (
          <div className="flex items-center justify-between px-5 pb-2">
            <h2 className="text-lg font-bold text-ink">{title}</h2>
            <button type="button" onClick={onClose} className="rounded-full p-2 text-ink-soft hover:bg-cream-dark" aria-label="Đóng">
              <X className="h-5 w-5" />
            </button>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer ? <div className="safe-bottom border-t border-line bg-cream px-5 pt-3">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

interface ToastState {
  message: string | null;
  tone: 'ok' | 'warn' | 'error';
  show: (message: string, tone?: ToastState['tone']) => void;
  hide: () => void;
}
export const useToast = create<ToastState>((set) => ({
  message: null,
  tone: 'ok',
  show: (message, tone = 'ok') => set({ message, tone }),
  hide: () => set({ message: null }),
}));

export function Toaster() {
  const { message, tone, hide } = useToast();
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(hide, 3200);
    return () => clearTimeout(t);
  }, [message, hide]);
  if (!message) return null;
  const tones = { ok: 'bg-success text-white', warn: 'bg-warn text-white', error: 'bg-danger text-white' };
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex justify-center px-4" role="status" aria-live="polite">
      <div className={cn('pointer-events-auto max-w-md animate-fade-in rounded-xl px-4 py-3 text-sm font-medium shadow-lg', tones[tone])}>{message}</div>
    </div>
  );
}
