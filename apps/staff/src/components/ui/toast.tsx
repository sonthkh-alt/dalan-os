'use client';

import { create } from 'zustand';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}
interface ToastState {
  items: ToastItem[];
  push: (kind: ToastKind, message: string) => void;
  remove: (id: number) => void;
}

let seq = 0;
export const useToast = create<ToastState>((set) => ({
  items: [],
  push: (kind, message) => {
    const id = ++seq;
    set((s) => ({ items: [...s.items.slice(-3), { id, kind, message }] }));
    setTimeout(() => set((s) => ({ items: s.items.filter((t) => t.id !== id) })), kind === 'error' ? 5000 : 2800);
  },
  remove: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}));

export const toast = {
  success: (m: string) => useToast.getState().push('success', m),
  error: (m: string) => useToast.getState().push('error', m),
  info: (m: string) => useToast.getState().push('info', m),
  warning: (m: string) => useToast.getState().push('warning', m),
};

const icons = { success: CheckCircle2, error: XCircle, info: Info, warning: AlertTriangle };
const styles = { success: 'bg-emerald-700 text-white', error: 'bg-red-700 text-white', info: 'bg-ink-900 text-white', warning: 'bg-amber-600 text-white' };

export function ToastViewport() {
  const items = useToast((s) => s.items);
  const remove = useToast((s) => s.remove);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-3">
      {items.map((t) => {
        const Icon = icons[t.kind];
        return (
          <button key={t.id} type="button" onClick={() => remove(t.id)} className={cn('pointer-events-auto flex max-w-lg items-center gap-2 rounded-xl px-4 py-3 text-base font-medium shadow-lg animate-toast-in', styles[t.kind])}>
            <Icon className="h-5 w-5 shrink-0" />
            <span>{t.message}</span>
          </button>
        );
      })}
    </div>
  );
}
