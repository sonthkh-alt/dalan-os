'use client';

import { useState } from 'react';
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
      {message && <p className="mb-3 text-sm text-ink-700">{message}</p>}
      <div className="mb-3 flex justify-center gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={`h-4 w-4 rounded-full ${i < pin.length ? 'bg-brand-700' : 'bg-ink-100'} ${i >= 4 && pin.length < 5 && i > pin.length ? 'opacity-40' : ''}`} />
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
