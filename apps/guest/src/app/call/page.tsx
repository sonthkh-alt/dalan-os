'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BellRing, GlassWater, MessageSquareMore, ReceiptText, Utensils } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useGuestSessionView, useGuestToken } from '@/lib/guest-data';
import { formatTime } from '@/lib/format';
import { SessionGate } from '@/components/SessionGate';
import { Button, Card, inputClass, useToast } from '@/components/ui';

type Kind = 'CALL_STAFF' | 'WATER' | 'UTENSILS' | 'BILL' | 'OTHER';
const KINDS: { kind: Kind; icon: typeof BellRing }[] = [
  { kind: 'CALL_STAFF', icon: BellRing },
  { kind: 'WATER', icon: GlassWater },
  { kind: 'UTENSILS', icon: Utensils },
  { kind: 'BILL', icon: ReceiptText },
  { kind: 'OTHER', icon: MessageSquareMore },
];

export default function CallPage() {
  return (
    <SessionGate>
      <Call />
    </SessionGate>
  );
}

function Call() {
  const t = useTranslations('call');
  const tc = useTranslations('common');
  const locale = useLocale();
  const token = useGuestToken();
  const toast = useToast((s) => s.show);
  const queryClient = useQueryClient();
  const view = useGuestSessionView();
  const [note, setNote] = useState('');
  const send = useMutation({
    mutationFn: (kind: Kind) => api('/guest/service-requests', { guestToken: token, body: { kind, note: note.trim() || undefined } }),
    onSuccess: () => {
      toast(t('sent'));
      setNote('');
      void queryClient.invalidateQueries({ queryKey: ['guest-session'] });
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : tc('errorGeneric'), 'error'),
  });
  const requests = view.data?.requests ?? [];
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t('title')}</h1>
      <div className="grid grid-cols-2 gap-3">
        {KINDS.map(({ kind, icon: Icon }) => (
          <button
            key={kind}
            type="button"
            onClick={() => send.mutate(kind)}
            disabled={send.isPending}
            className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-paper p-3 text-center text-sm font-semibold text-ink transition active:scale-[0.98] disabled:opacity-60"
          >
            <Icon className="h-7 w-7 text-maroon" />
            {t(kind)}
          </button>
        ))}
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-ink-soft">{t('note')}</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className={inputClass} />
      </label>
      {requests.length > 0 ? (
        <Card>
          <h2 className="mb-2 text-base font-bold">{t('recent')}</h2>
          <ul className="space-y-1.5 text-sm">
            {requests.map((r) => (
              <li key={r.id} className="flex items-center justify-between">
                <span>
                  {t(r.kind as Kind)} <span className="text-ink-muted">· {formatTime(r.createdAt, locale)}</span>
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.status === 'ACKED' ? 'bg-success-soft text-success' : 'bg-warn-soft text-warn'}`}>
                  {r.status === 'ACKED' ? t('acked') : t('pending')}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {send.isPending ? <Button className="w-full" loading>{tc('loading')}</Button> : null}
    </div>
  );
}
