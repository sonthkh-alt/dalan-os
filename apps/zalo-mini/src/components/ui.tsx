import { useEffect, type ReactNode } from 'react';
import { create } from 'zustand';
import { Icon, Spinner, useNavigate } from 'zmp-ui';
import { cn } from '../lib/format';

export const inputClass =
  'w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-base text-ink placeholder:text-ink-muted focus:border-maroon focus:outline-none disabled:opacity-60';

/** Thanh tiêu đề trên cùng (Mini App ẩn action bar của Zalo, tự vẽ header theo màu thương hiệu). */
export function TopBar({
  title,
  back,
  right,
}: {
  title: string;
  back?: boolean;
  right?: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <header className="safe-top sticky top-0 z-30 bg-maroon text-cream shadow-sm">
      <div className="flex h-12 items-center gap-2 px-3">
        {back ? (
          <button
            type="button"
            aria-label="Quay lại"
            onClick={() => navigate(-1)}
            className="-ml-1 flex h-10 w-10 items-center justify-center rounded-full active:bg-white/10"
          >
            <Icon icon="zi-arrow-left" />
          </button>
        ) : null}
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold">{title}</h1>
        {right}
      </div>
    </header>
  );
}

export function Card({
  className,
  children,
  onClick,
}: {
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-2xl border border-line bg-paper p-4',
        onClick && 'cursor-pointer active:scale-[0.99]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-ink">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-ink-muted">{hint}</span> : null}
    </label>
  );
}

type Tone = 'info' | 'warn' | 'success' | 'error';
const TONES: Record<Tone, string> = {
  info: 'bg-cream-dark text-ink-soft',
  warn: 'bg-warn-soft text-warn',
  success: 'bg-success-soft text-success',
  error: 'bg-danger-soft text-danger',
};

/** Thông báo nhẹ (dùng cả khi API chưa có endpoint). */
export function Notice({
  tone = 'info',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-xl px-3 py-2.5 text-sm', TONES[tone], className)}>{children}</div>
  );
}

export function Loading({ label = 'Đang tải...' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-ink-muted">
      <Spinner visible />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <p className="text-base font-semibold text-ink">{title}</p>
      {description ? <p className="text-sm text-ink-soft">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Chip({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium',
        active ? 'border-maroon bg-maroon text-white' : 'border-line bg-paper text-ink-soft',
      )}
    >
      {children}
    </button>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="text-base font-bold text-ink">{children}</h2>
      {action}
    </div>
  );
}

// ───────── Toast ─────────

interface ToastState {
  message: string | null;
  tone: 'success' | 'error';
  key: number;
  show: (message: string, tone?: 'success' | 'error') => void;
  hide: () => void;
}

export const useToast = create<ToastState>((set) => ({
  message: null,
  tone: 'success',
  key: 0,
  show: (message, tone = 'success') => set((s) => ({ message, tone, key: s.key + 1 })),
  hide: () => set({ message: null }),
}));

export function Toaster() {
  const { message, tone, key, hide } = useToast();
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(hide, 3200);
    return () => clearTimeout(timer);
  }, [message, key, hide]);
  if (!message) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex justify-center px-4 pt-[calc(env(safe-area-inset-top,0px)+64px)]">
      <div
        role="status"
        className={cn(
          'pointer-events-auto max-w-sm rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-lg',
          tone === 'error' ? 'bg-danger' : 'bg-ink',
        )}
        onClick={hide}
      >
        {message}
      </div>
    </div>
  );
}
