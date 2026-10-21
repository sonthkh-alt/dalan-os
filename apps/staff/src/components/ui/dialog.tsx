'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** sheet: trượt từ dưới (điện thoại); center: hộp giữa (tablet). Mặc định tự động theo kích thước. */
  mode?: 'auto' | 'sheet' | 'center';
  size?: 'sm' | 'md' | 'lg' | 'full';
  dismissible?: boolean;
}

const sizes = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl', full: 'sm:max-w-[96vw] sm:h-[94vh]' };

/** Hộp thoại/sheet không phụ thuộc thư viện: khóa cuộn nền, đóng bằng Esc, vùng chạm lớn, hiệu ứng mở mượt. */
export function Dialog({ open, onClose, title, children, footer, mode = 'auto', size = 'md', dismissible = true }: DialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // Giữ onClose mới nhất mà không phải gắn lại listener (tránh mất focus khi cha render lại)
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Đưa focus vào hộp thoại nếu chưa có phần tử nào bên trong được focus (autoFocus)
    const prevFocus = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      if (prevFocus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
    };
  }, [open, dismissible]);

  if (!open || typeof document === 'undefined') return null;
  const center = mode === 'center';
  // Portal ra body: tổ tiên có backdrop-filter/transform (vd. thanh dưới làm mờ nền) sẽ giam
  // phần tử fixed trong khung của nó và cắt mất hộp thoại.
  return createPortal(
    <div className={cn('fixed inset-0 z-50 flex justify-center', center ? 'items-center' : 'items-end sm:items-center')} role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined}>
      <div className="animate-fade-in absolute inset-0 bg-ink-900/45 backdrop-blur-[2px]" onClick={dismissible ? onClose : undefined} aria-hidden />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[94dvh] w-full flex-col bg-white shadow-overlay ring-1 ring-ink-900/5 outline-none',
          center ? 'animate-dialog-in mx-4 rounded-3xl' : 'animate-sheet-in rounded-t-3xl sm:animate-dialog-in sm:rounded-3xl',
          sizes[size],
        )}
      >
        {!center && <span className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-ink-200 sm:hidden" aria-hidden />}
        {(title || dismissible) && (
          <div className="flex items-center justify-between gap-3 px-5 pt-3 pb-2 sm:pt-4">
            <h2 id={titleId} className="min-w-0 text-lg font-bold tracking-tight text-ink-900">
              {title}
            </h2>
            {dismissible && (
              <button type="button" onClick={onClose} aria-label="Đóng" className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900">
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        )}
        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-3">{children}</div>
        {footer && <div className="safe-bottom flex flex-wrap gap-2 border-t border-ink-100 bg-ink-50/60 px-5 py-3 sm:rounded-b-3xl">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Xác nhận', danger, loading }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; message?: ReactNode; confirmLabel?: string; danger?: boolean; loading?: boolean }) {
  return (
    <Dialog open={open} onClose={onClose} title={title} size="sm" mode="center">
      <div className="flex gap-3 py-1">
        {danger && (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
            <AlertTriangle className="h-5 w-5" />
          </span>
        )}
        <div className="pt-1 text-base text-ink-700">{message}</div>
      </div>
      <div className="mt-5 flex gap-2">
        <button type="button" onClick={onClose} className="min-h-[48px] flex-1 rounded-xl bg-white font-semibold text-ink-900 shadow-card ring-1 ring-ink-200 ring-inset transition hover:bg-ink-50 active:scale-[0.98]">
          Hủy
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className={cn('inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl font-semibold text-white transition active:scale-[0.98]', danger ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-700 shadow-brand hover:bg-brand-800', loading && 'opacity-60')}
        >
          {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
