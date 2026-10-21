'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BellRing, Check, Clock, GlassWater, MessageSquareMore, ReceiptText, Send, Utensils, type LucideIcon } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useGuestSessionView, useGuestToken } from '@/lib/guest-data';
import { cn, formatTime } from '@/lib/format';
import { SessionGate } from '@/components/SessionGate';
import { Button, PageTitle, SectionTitle, Sheet, inputClass, useToast } from '@/components/ui';

type Kind = 'CALL_STAFF' | 'WATER' | 'UTENSILS' | 'BILL' | 'OTHER';
const KINDS: { kind: Kind; icon: LucideIcon; tone: string }[] = [
  { kind: 'CALL_STAFF', icon: BellRing, tone: 'from-maroon to-maroon-deep text-white' },
  { kind: 'WATER', icon: GlassWater, tone: 'bg-paper text-ink' },
  { kind: 'UTENSILS', icon: Utensils, tone: 'bg-paper text-ink' },
  { kind: 'BILL', icon: ReceiptText, tone: 'bg-paper text-ink' },
  { kind: 'OTHER', icon: MessageSquareMore, tone: 'bg-paper text-ink' },
];
const SUGGESTIONS = ['babyChair', 'wetTowel', 'sauce', 'toothpick', 'takeaway'] as const;

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
  const [otherOpen, setOtherOpen] = useState(false);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState<Kind | null>(null);
  const send = useMutation({
    mutationFn: (input: { kind: Kind; note?: string }) => api('/guest/service-requests', { guestToken: token, body: { kind: input.kind, note: input.note?.trim() || undefined } }),
    onMutate: (input) => setSending(input.kind),
    onSuccess: () => {
      toast(t('sent'));
      setNote('');
      setOtherOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['guest-session'] });
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : tc('errorGeneric'), 'error'),
    onSettled: () => setSending(null),
  });
  const requests = [...(view.data?.requests ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const openByKind = new Map<string, (typeof requests)[number]>();
  for (const r of requests) if (r.status !== 'DONE' && !openByKind.has(r.kind)) openByKind.set(r.kind, r);

  return (
    <div>
      <PageTitle eyebrow={t('eyebrow')} title={t('title')} subtitle={t('subtitle')} />
      <div className="grid grid-cols-2 gap-3">
        {KINDS.map(({ kind, icon: Icon, tone }, i) => {
          const open = openByKind.get(kind);
          const primary = i === 0;
          const busy = sending === kind;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => (kind === 'OTHER' ? setOtherOpen(true) : send.mutate({ kind }))}
              disabled={send.isPending}
              aria-busy={busy || undefined}
              className={cn(
                'relative flex min-h-32 flex-col justify-between overflow-hidden rounded-[26px] p-4 text-left shadow-card ring-1 transition active:scale-[0.97] disabled:opacity-70',
                primary ? 'col-span-2 min-h-28 bg-linear-to-br ring-maroon/20' : 'ring-line-soft',
                tone,
              )}
            >
              <span className={cn('flex h-12 w-12 items-center justify-center rounded-2xl', primary ? 'bg-white/15 text-gold-light' : 'bg-maroon-soft text-maroon')}>
                <Icon className={cn('h-6 w-6', busy && 'animate-pulse')} />
              </span>
              <span className={cn('mt-3 block leading-tight font-bold', primary ? 'text-lg' : 'text-[15px]')}>{t(kind)}</span>
              {open ? (
                <span
                  className={cn(
                    'inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap',
                    primary ? 'absolute top-3 right-3' : 'mt-2',
                    open.status === 'ACKED' ? 'bg-success text-white' : primary ? 'bg-white/20 text-white' : 'bg-warn-soft text-warn',
                  )}
                >
                  {open.status === 'ACKED' ? <Check className="h-3 w-3" strokeWidth={3} /> : <Clock className="h-3 w-3" />}
                  {open.status === 'ACKED' ? t('acked') : t('pending')}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {requests.length > 0 ? (
        <section className="mt-7">
          <SectionTitle>{t('recent')}</SectionTitle>
          <ul className="overflow-hidden rounded-3xl bg-paper shadow-card ring-1 ring-line-soft">
            {requests.slice(0, 8).map((r, idx) => {
              const status = r.status === 'DONE' ? 'done' : r.status === 'ACKED' ? 'acked' : 'pending';
              return (
                <li key={r.id} className={cn('flex min-h-14 items-center gap-3 px-4 py-3', idx > 0 && 'border-t border-line-soft')}>
                  <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', status === 'done' ? 'bg-line' : status === 'acked' ? 'bg-success' : 'animate-pulse bg-warn')} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">{t((['CALL_STAFF', 'WATER', 'UTENSILS', 'BILL', 'OTHER'].includes(r.kind) ? r.kind : 'OTHER') as Kind)}</span>
                    <span className="tabular block text-xs text-ink-muted">{formatTime(r.createdAt, locale)}</span>
                  </span>
                  <span className={cn('text-xs font-semibold', status === 'done' ? 'text-ink-muted' : status === 'acked' ? 'text-success' : 'text-warn')}>{t(status)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <Sheet
        open={otherOpen}
        onClose={() => setOtherOpen(false)}
        title={t('OTHER')}
        footer={
          <Button size="lg" className="w-full" disabled={!note.trim()} loading={send.isPending} onClick={() => send.mutate({ kind: 'OTHER', note })}>
            <Send className="h-5 w-5" />
            {t('sendRequest')}
          </Button>
        }
      >
        <div className="mb-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((k) => (
            <button key={k} type="button" onClick={() => setNote((n) => [n.trim(), t(`suggest.${k}`)].filter(Boolean).join(', ').slice(0, 200))} className="min-h-10 rounded-full bg-paper px-3.5 text-sm font-medium text-ink-soft ring-1 ring-line hover:ring-maroon/40">
              + {t(`suggest.${k}`)}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-ink">{t('note')}</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} rows={3} placeholder={t('notePlaceholder')} className={cn(inputClass, 'resize-none')} autoFocus />
        </label>
      </Sheet>
    </div>
  );
}
