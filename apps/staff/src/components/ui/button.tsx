'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand-700 text-white shadow-brand hover:bg-brand-800 active:bg-brand-900 disabled:bg-brand-300 disabled:shadow-none',
  secondary: 'bg-gold-100 text-ink-900 ring-1 ring-inset ring-gold-300/70 hover:bg-gold-200 active:bg-gold-300 disabled:opacity-50',
  ghost: 'bg-transparent text-ink-700 hover:bg-ink-900/[0.05] active:bg-ink-900/[0.09] disabled:opacity-40',
  outline: 'bg-white text-ink-900 shadow-card ring-1 ring-inset ring-ink-200 hover:bg-ink-50 hover:ring-ink-300 active:bg-ink-100 disabled:opacity-40',
  danger: 'bg-red-600 text-white shadow-[0_1px_2px_rgb(127_29_29/0.3),0_4px_12px_-2px_rgb(220_38_38/0.35)] hover:bg-red-700 active:bg-red-800 disabled:bg-red-300 disabled:shadow-none',
  success: 'bg-emerald-600 text-white shadow-[0_1px_2px_rgb(6_78_59/0.3),0_4px_12px_-2px_rgb(5_150_105/0.35)] hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-emerald-300 disabled:shadow-none',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-[40px] rounded-xl px-3 text-sm',
  md: 'min-h-[44px] rounded-xl px-4 text-[15px]',
  lg: 'min-h-[52px] rounded-2xl px-5 text-base',
  xl: 'min-h-[64px] rounded-2xl px-6 text-lg',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  block?: boolean;
}

/** Nút chuẩn: bóng mềm, lún nhẹ khi nhấn, vùng chạm ≥ 40px. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading, block, disabled, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-semibold transition-[background-color,box-shadow,transform,color] duration-150 select-none active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 [&_svg]:shrink-0',
        variants[variant],
        sizes[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
      {children}
    </button>
  );
});
