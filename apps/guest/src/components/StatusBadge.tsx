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

export function LineStatusBadge({ status, orderStatus }: { status: string; orderStatus?: string }) {
  const t = useTranslations('orders.status');
  const effective = orderStatus === 'PENDING_CONFIRM' ? 'PENDING_CONFIRM' : status;
  const key = (['DRAFT', 'PENDING_CONFIRM', 'SENT', 'HOLD', 'PREPARING', 'READY', 'SERVED', 'VOIDED', 'CANCELLED'] as const).includes(effective as never) ? effective : 'SENT';
  return <span className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-semibold', TONES[key])}>{t(key as 'SENT')}</span>;
}

export function BillStatusBadge({ status }: { status: string }) {
  const t = useTranslations('bill.status');
  const tone = status === 'PAID' ? 'bg-success text-white' : status === 'VOID' ? 'bg-line text-ink-muted' : status === 'PARTIALLY_PAID' ? 'bg-warn-soft text-warn' : 'bg-maroon-soft text-maroon';
  const key = (['OPEN', 'PARTIALLY_PAID', 'PAID', 'VOID'] as const).includes(status as never) ? status : 'OPEN';
  return <span className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-semibold', tone)}>{t(key as 'OPEN')}</span>;
}
