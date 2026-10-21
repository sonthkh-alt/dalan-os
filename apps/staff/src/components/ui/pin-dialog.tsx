'use client';

import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog } from './dialog';
import { NumberPad } from './number-pad';

/** Hộp nhập PIN quản lý để duyệt thao tác vượt hạn mức (API trả APPROVAL_REQUIRED). */
export function ManagerPinDialog({ open, onClose, onSubmit, title = 'Cần PIN quản lý', message, loading }: { open: boolean; onClose: () => void; onSubmit: (pin: string) => void; title?: string; message?: string; loading?: boolean }) {
  const [pin, setPin] = useState('');
  return (
    <Dialog
      open={open}
      onClose={() => {
        setPin('');
        onClose();
      }}
      title={title}
      size="sm"
      mode="center"
    >
      <div className="mb-4 flex items-start gap-3 rounded-2xl bg-gold-50 p-3 ring-1 ring-gold-200 ring-inset">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-gold-700" />
        <p className="text-sm text-ink-700">{message ?? 'Thao tác này cần quản lý xác nhận bằng mã PIN.'}</p>
      </div>
      <div className="mb-4 flex justify-center gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={cn('h-3.5 w-3.5 rounded-full transition-all', i < pin.length ? 'scale-110 bg-brand-700' : 'bg-ink-200', i >= 4 && i >= pin.length && 'opacity-40')} />
        ))}
      </div>
      <NumberPad
        value={pin}
        onChange={(v) => setPin(v.replace(/\D/g, '').slice(0, 6))}
        maxLength={6}
        onSubmit={() => {
          if (pin.length >= 4 && !loading) {
            onSubmit(pin);
            setPin('');
          }
        }}
        submitLabel="Duyệt"
      />
    </Dialog>
  );
}
