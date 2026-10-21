'use client';

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
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

/** Hộp thoại/sheet không phụ thuộc thư viện: khóa cuộn nền, đóng bằng Esc, vùng chạm lớn. */
export function Dialog({ open, onClose, title, children, footer, mode = 'auto', size = 'md', dismissible = true }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, dismissible]);

  if (!open || typeof document === 'undefined') return null;
  const sheet = mode === 'sheet';
  const center = mode === 'center';
  // Portal ra body: tổ tiên có backdrop-filter/transform (vd. thanh dưới làm mờ nền) sẽ giam
  // phần tử fixed trong khung của nó và cắt mất hộp thoại.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-900/50" onClick={dismissible ? onClose : undefined} />
      <div
        className={cn(
          'relative flex max-h-[94dvh] w-full flex-col bg-white shadow-2xl',
          sheet || mode === 'auto' ? 'rounded-t-2xl sm:rounded-2xl' : 'rounded-2xl',
          center && 'mx-4 rounded-2xl',
          sizes[size],
        )}
      >
        {(title || dismissible) && (
          <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-4 py-3">
            <h2 className="text-lg font-bold text-ink-900">{title}</h2>
            {dismissible && (
              <button type="button" onClick={onClose} aria-label="Đóng" className="flex h-11 w-11 items-center justify-center rounded-full text-ink-500 hover:bg-ink-100">
                <X className="h-6 w-6" />
              </button>
            )}
          </div>
        )}
        <div className="scrollbar-thin flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer && <div className="safe-bottom flex flex-wrap gap-2 border-t border-ink-100 px-4 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Xác nhận', danger, loading }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; message?: ReactNode; confirmLabel?: string; danger?: boolean; loading?: boolean }) {
  return (
    <Dialog open={open} onClose={onClose} title={title} size="sm" mode="center">
      <div className="py-2 text-base text-ink-700">{message}</div>
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={onClose} className="min-h-[48px] flex-1 rounded-xl border border-ink-300 bg-white font-semibold">
          Hủy
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className={cn('min-h-[48px] flex-1 rounded-xl font-semibold text-white', danger ? 'bg-red-600' : 'bg-brand-700', loading && 'opacity-60')}
        >
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
