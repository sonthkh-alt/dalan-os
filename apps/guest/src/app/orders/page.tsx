'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { ListChecks } from 'lucide-react';
import { useGuestSessionView, type GuestSessionView } from '@/lib/guest-data';
import { formatTime, formatVnd, localizedName } from '@/lib/format';
import { SessionGate } from '@/components/SessionGate';
import { LineStatusBadge } from '@/components/StatusBadge';
import { Button, Card, EmptyState, Spinner } from '@/components/ui';
import { CartBar } from '@/components/Cart';

export default function OrdersPage() {
  return (
    <SessionGate>
      <Orders />
    </SessionGate>
  );
}

function participantName(view: GuestSessionView, order: GuestSessionView['orders'][number], t: (k: 'you' | 'staff') => string): string {
  if (order.source === 'STAFF' || order.source === 'SYSTEM') return t('staff');
  if (order.placedByParticipantId === view.me.participantId) return t('you');
  const p = view.participants.find((x) => x.id === order.placedByParticipantId);
  return p?.nickname ?? `#${view.participants.findIndex((x) => x.id === order.placedByParticipantId) + 1}`;
}

function Orders() {
  const t = useTranslations('orders');
  const tc = useTranslations('common');
  const locale = useLocale();
  const view = useGuestSessionView();
  if (view.isPending) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }
  if (view.isError || !view.data) {
    return <EmptyState title={tc('errorGeneric')} action={<Button variant="secondary" onClick={() => view.refetch()}>{tc('retry')}</Button>} />;
  }
  const orders = [...view.data.orders].filter((o) => o.status !== 'CANCELLED').reverse();
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">{t('title')}</h1>
      {orders.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="h-12 w-12" />}
          title={t('empty')}
          action={
            <Link href="/menu">
              <Button>{tc('viewPublicMenu')}</Button>
            </Link>
          }
        />
      ) : null}
      {orders.map((o) => (
        <Card key={o.id}>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-semibold">{t('order', { seq: o.seq })}</span>
            <span className="text-ink-muted">
              {t('by', { name: participantName(view.data, o, t as never) })} · {formatTime(o.createdAt, locale)}
            </span>
          </div>
          <ul className="divide-y divide-line">
            {o.lines.map((l) => (
              <li key={l.id} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className={l.status === 'VOIDED' || l.status === 'CANCELLED' ? 'text-ink-muted line-through' : 'font-medium'}>
                    <span className="text-maroon">{l.quantity}</span> × {localizedName(locale, l.name, l.nameEn)}
                  </p>
                  {l.modifiers.length ? <p className="text-xs text-ink-soft">{l.modifiers.map((m) => m.optionName).join(', ')}</p> : null}
                  {l.note ? <p className="text-xs text-ink-muted">“{l.note}”</p> : null}
                  <p className="text-xs text-ink-muted">{formatVnd(l.lineTotal)}</p>
                </div>
                <LineStatusBadge status={l.status} orderStatus={o.status} />
              </li>
            ))}
          </ul>
        </Card>
      ))}
      <CartBar />
    </div>
  );
}
