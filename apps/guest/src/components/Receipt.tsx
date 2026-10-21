import type { ReactNode } from 'react';
import { cn } from '@/lib/format';

/** Hóa đơn kiểu giấy in nhiệt: mép răng cưa, đường kẻ đứt. */
export function Receipt({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('drop-shadow-[0_10px_24px_rgb(74_14_23/0.10)]', className)}>
      <div className="receipt-edge bg-paper px-5 py-7">{children}</div>
    </div>
  );
}

export function ReceiptDivider() {
  return <div className="my-4 border-t-2 border-dashed border-line" aria-hidden />;
}

export function ReceiptRow({ label, value, muted, strong, accent }: { label: ReactNode; value: ReactNode; muted?: boolean; strong?: boolean; accent?: 'success' }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 py-0.5 text-sm', muted && 'text-ink-muted', strong && 'font-semibold text-ink', accent === 'success' && 'text-success')}>
      <dt>{label}</dt>
      <dd className="tabular font-medium">{value}</dd>
    </div>
  );
}

export function ReceiptTotal({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 pt-1">
      <dt className="text-base font-bold text-ink">{label}</dt>
      <dd className="tabular font-serif text-[28px] leading-none font-bold text-maroon">{value}</dd>
    </div>
  );
}
