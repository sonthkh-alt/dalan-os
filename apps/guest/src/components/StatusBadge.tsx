'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/format';

const TONES: Record<string, string> = {
  PENDING_CONFIRM: 'bg-warn-soft text-warn',
  SENT: 'bg-cream-dark text-ink-soft',
  HOLD: 'bg-cream-dark text-ink-soft',
  PREPARING: 'bg-warn-soft text-warn',
  READY: 'bg-success-soft text-success',
  SERVED: 'bg-success text-white',
  VOIDED: 'bg-line text-ink-muted line-through',
  CANCELLED: 'bg-line text-ink-muted line-through',
  DRAFT: 'bg-cream-dark text-ink-muted',
};

const LINE_KEYS = ['DRAFT', 'PENDING_CONFIRM', 'SENT', 'HOLD', 'PREPARING', 'READY', 'SERVED', 'VOIDED', 'CANCELLED'] as const;

export function effectiveLineStatus(status: string, orderStatus?: string): (typeof LINE_KEYS)[number] {
  const effective = orderStatus === 'PENDING_CONFIRM' && !['VOIDED', 'CANCELLED'].includes(status) ? 'PENDING_CONFIRM' : status;
  return (LINE_KEYS as readonly string[]).includes(effective) ? (effective as (typeof LINE_KEYS)[number]) : 'SENT';
}

export function LineStatusBadge({ status, orderStatus }: { status: string; orderStatus?: string }) {
  const t = useTranslations('orders.status');
  const key = effectiveLineStatus(status, orderStatus);
  const live = key === 'PREPARING' || key === 'PENDING_CONFIRM' || key === 'READY';
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none', TONES[key])}>
      {live ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" aria-hidden /> : null}
      {t(key)}
    </span>
  );
}

export function BillStatusBadge({ status }: { status: string }) {
  const t = useTranslations('bill.status');
  const tone = status === 'PAID' ? 'bg-success text-white' : status === 'VOID' ? 'bg-line text-ink-muted' : status === 'PARTIALLY_PAID' ? 'bg-warn-soft text-warn' : 'bg-maroon-soft text-maroon';
  const key = (['OPEN', 'PARTIALLY_PAID', 'PAID', 'VOID'] as const).includes(status as never) ? status : 'OPEN';
  return <span className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] leading-none font-semibold', tone)}>{t(key as 'OPEN')}</span>;
}
