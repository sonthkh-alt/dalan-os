'use client';

import { Delete } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface NumberPadProps {
  value: string;
  onChange: (next: string) => void;
  /** Cho phép dấu thập phân (nhập kg). */
  decimal?: boolean;
  maxLength?: number;
  /** Nút nhanh (ví dụ mệnh giá tiền). */
  quick?: { label: string; value: string }[];
  onSubmit?: () => void;
  submitLabel?: string;
  className?: string;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** Bàn phím số lớn dùng cho PIN, số lượng, tiền mặt, trọng lượng. */
export function NumberPad({ value, onChange, decimal, maxLength = 12, quick, onSubmit, submitLabel = 'Xong', className }: NumberPadProps) {
  const press = (k: string) => {
    if (k === '.' && (value.includes('.') || !decimal)) return;
    if (value.length >= maxLength) return;
    if (value === '0' && k !== '.') return onChange(k);
    onChange(value + k);
  };
  const backspace = () => onChange(value.slice(0, -1));
  const Key = ({ k, label, onClick, variant, ariaLabel }: { k?: string; label?: React.ReactNode; onClick?: () => void; variant?: 'default' | 'muted' | 'primary'; ariaLabel?: string }) => (
    <button
      type="button"
      onClick={onClick ?? (() => press(k!))}
      aria-label={ariaLabel}
      className={cn(
        'flex min-h-[56px] items-center justify-center rounded-2xl text-2xl font-semibold tabular-nums transition-[transform,background-color] duration-100 active:scale-95',
        variant === 'primary'
          ? 'bg-brand-700 text-white shadow-brand'
          : variant === 'muted'
            ? 'bg-ink-900/[0.06] text-ink-700 hover:bg-ink-900/[0.09] active:bg-ink-900/[0.12]'
            : 'bg-white text-ink-900 shadow-card ring-1 ring-ink-900/[0.07] hover:bg-ink-50 active:bg-ink-100',
      )}
    >
      {label ?? k}
    </button>
  );
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {quick && quick.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {quick.map((q) => (
            <button key={q.label} type="button" onClick={() => onChange(q.value)} className="min-h-[44px] rounded-full bg-gold-100 px-4 font-semibold text-ink-900 ring-1 ring-gold-300/70 ring-inset transition active:scale-95 active:bg-gold-300">
              {q.label}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((k) => (
          <Key key={k} k={k} />
        ))}
        {decimal ? <Key k="." label="," ariaLabel="Dấu thập phân" /> : <Key label="000" onClick={() => value && press('000')} variant="muted" ariaLabel="Ba số không" />}
        <Key k="0" />
        <Key label={<Delete className="h-6 w-6" />} onClick={backspace} variant="muted" ariaLabel="Xóa một số" />
        {onSubmit && (
          <button type="button" onClick={onSubmit} className="col-span-3 min-h-[56px] rounded-2xl bg-brand-700 text-xl font-bold text-white shadow-brand transition active:scale-[0.99] active:bg-brand-900">
            {submitLabel}
          </button>
        )}
      </div>
    </div>
  );
}
