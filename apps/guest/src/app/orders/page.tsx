'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Check, ChefHat, CookingPot, HandPlatter, ListChecks, Plus, RefreshCw, Send } from 'lucide-react';
import { useGuestSessionView, type GuestLine, type GuestOrder, type GuestSessionView } from '@/lib/guest-data';
import { cn, formatTime, formatVnd, localizedName } from '@/lib/format';
import { SessionGate } from '@/components/SessionGate';
import { LineStatusBadge, effectiveLineStatus } from '@/components/StatusBadge';
import { ListSkeleton } from '@/components/Skeletons';
import { Button, EmptyState, LinkButton, PageTitle } from '@/components/ui';
import { CartBar } from '@/components/Cart';

export default function OrdersPage() {
  return (
    <SessionGate>
      <Orders />
    </SessionGate>
  );
}

const STEPS = [
  { key: 'sent', icon: Send },
  { key: 'accepted', icon: ChefHat },
  { key: 'cooking', icon: CookingPot },
  { key: 'served', icon: HandPlatter },
] as const;

const INACTIVE = new Set(['VOIDED', 'CANCELLED']);

/** Bước tiến độ đạt tới của một dòng món (0..3) và đã hoàn tất hay chưa. */
function lineStage(status: string): { reached: number; done: boolean } {
  switch (status) {
    case 'DRAFT':
    case 'PENDING_CONFIRM':
      return { reached: 0, done: false };
    case 'SENT':
    case 'HOLD':
      return { reached: 1, done: false };
    case 'PREPARING':
      return { reached: 2, done: false };
    case 'READY':
      return { reached: 3, done: false };
    case 'SERVED':
      return { reached: 3, done: true };
    default:
      return { reached: 1, done: false };
  }
}

/** Điểm tiến độ (0..4) để vẽ thanh tổng. */
function lineScore(status: string): number {
  const { reached, done } = lineStage(status);
  return done ? 4 : reached + 0.5;
}

function participantName(view: GuestSessionView, order: GuestOrder, t: (k: 'you' | 'staff') => string): string {
  if (order.source === 'STAFF' || order.source === 'SYSTEM') return t('staff');
  if (order.placedByParticipantId === view.me.participantId) return t('you');
  const p = view.participants.find((x) => x.id === order.placedByParticipantId);
  return p?.nickname ?? `#${view.participants.findIndex((x) => x.id === order.placedByParticipantId) + 1}`;
}

function Orders() {
  const t = useTranslations('orders');
  const tc = useTranslations('common');
  const view = useGuestSessionView();
  if (view.isPending) return <ListSkeleton rows={3} />;
  if (view.isError || !view.data) {
    return (
      <EmptyState
        icon={<RefreshCw className="h-8 w-8" />}
        title={tc('errorGeneric')}
        action={
          <Button variant="secondary" onClick={() => view.refetch()}>
            {tc('retry')}
          </Button>
        }
      />
    );
  }
  const orders = [...view.data.orders].filter((o) => o.status !== 'CANCELLED').reverse();
  const activeLines = orders.flatMap((o) => o.lines.map((l) => ({ ...l, status: effectiveLineStatus(l.status, o.status) }))).filter((l) => !INACTIVE.has(l.status));
  const served = activeLines.filter((l) => l.status === 'SERVED').length;
  const pct = activeLines.length ? Math.round((activeLines.reduce((s, l) => s + lineScore(l.status), 0) / (activeLines.length * 4)) * 100) : 0;

  return (
    <div>
      <PageTitle eyebrow={tc('liveTracking')} title={t('title')} action={<AddMore label={t('addMore')} />} />
      {orders.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="h-8 w-8" />}
          title={t('empty')}
          body={t('emptyBody')}
          action={
            <LinkButton href="/menu" size="lg">
              {t('startOrdering')}
            </LinkButton>
          }
        />
      ) : (
        <>
          <section className="brand-pattern mb-5 rounded-[28px] p-5 text-cream shadow-lift" aria-live="polite">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.16em] text-gold-light uppercase">{t('progress')}</p>
                <p className="mt-1 font-serif text-3xl font-bold">
                  <span className="tabular">{served}</span>
                  <span className="text-cream/60">/{activeLines.length}</span>
                </p>
                <p className="text-sm text-cream/80">{served === activeLines.length && activeLines.length > 0 ? t('allServed') : t('servedSummary')}</p>
              </div>
              <span className="tabular text-sm font-semibold text-gold-light">{pct}%</span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-linear-to-r from-gold-light to-[#f3d488] transition-[width] duration-700" style={{ width: `${pct}%` }} />
            </div>
          </section>
          <ul className="space-y-4">
            {orders.map((o) => (
              <li key={o.id}>
                <RoundCard order={o} view={view.data} />
              </li>
            ))}
          </ul>
        </>
      )}
      <CartBar />
    </div>
  );
}

function AddMore({ label }: { label: string }) {
  return (
    <LinkButton href="/menu" variant="soft" size="sm" className="shrink-0 rounded-full">
      <Plus className="h-4 w-4" />
      {label}
    </LinkButton>
  );
}

function RoundCard({ order, view }: { order: GuestOrder; view: GuestSessionView }) {
  const t = useTranslations('orders');
  const locale = useLocale();
  const active = order.lines.filter((l) => !INACTIVE.has(effectiveLineStatus(l.status, order.status)));
  const stages = active.map((l) => lineStage(effectiveLineStatus(l.status, order.status)));
  const reached = stages.length ? Math.min(...stages.map((s) => s.reached)) : 0;
  const done = stages.length > 0 && stages.every((s) => s.done);
  const roundTotal = active.reduce((s, l) => s + l.lineTotal, 0);

  return (
    <article className="overflow-hidden rounded-card bg-paper shadow-card ring-1 ring-line-soft">
      <header className="flex items-center justify-between gap-2 px-4 pt-4">
        <div>
          <h2 className="font-serif text-lg font-bold text-ink">{t('order', { seq: order.seq })}</h2>
          <p className="text-xs text-ink-muted">
            {t('by', { name: participantName(view, order, t as never) })} · {formatTime(order.createdAt, locale)}
          </p>
        </div>
        <span className="tabular text-sm font-bold text-ink">{formatVnd(roundTotal)}</span>
      </header>

      {active.length > 0 ? <Tracker reached={reached} done={done} pending={order.status === 'PENDING_CONFIRM'} /> : null}

      <ul className="divide-y divide-line-soft border-t border-line-soft">
        {order.lines.map((l) => (
          <LineRow key={l.id} line={l} orderStatus={order.status} locale={locale} />
        ))}
      </ul>
    </article>
  );
}

/** Thanh tiến độ 4 bước kiểu Domino's. */
function Tracker({ reached, done, pending }: { reached: number; done: boolean; pending: boolean }) {
  const t = useTranslations('orders.steps');
  return (
    <div className="px-4 pt-4 pb-4">
      <ol className="relative grid grid-cols-4">
        <div className="absolute top-[18px] right-[12.5%] left-[12.5%] h-1 rounded-full bg-cream-dark" aria-hidden />
        <div className="absolute top-[18px] left-[12.5%] h-1 rounded-full bg-maroon transition-[width] duration-700" style={{ width: `${(reached / 3) * 75}%` }} aria-hidden />
        {STEPS.map(({ key, icon: Icon }, i) => {
          const complete = i < reached || (done && i === reached);
          const current = !done && i === reached;
          return (
            <li key={key} className="relative flex flex-col items-center gap-1.5 text-center" aria-current={current ? 'step' : undefined}>
              <span
                className={cn(
                  'relative z-10 flex h-9 w-9 items-center justify-center rounded-full ring-4 ring-paper transition',
                  complete ? 'bg-maroon text-white' : current ? 'animate-soft-pulse bg-gold-light text-maroon-deep' : 'bg-cream-dark text-ink-muted',
                )}
              >
                {complete ? <Check className="h-4 w-4" strokeWidth={3} /> : <Icon className="h-4 w-4" />}
              </span>
              <span className={cn('text-[11px] leading-tight font-semibold', complete || current ? 'text-ink' : 'text-ink-muted')}>
                {current && i === 0 && pending ? t('waiting') : current && i === 3 ? t('onTheWay') : t(key)}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function LineRow({ line, orderStatus, locale }: { line: GuestLine; orderStatus: string; locale: string }) {
  const inactive = INACTIVE.has(line.status);
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span className={cn('tabular flex h-7 min-w-7 items-center justify-center rounded-lg px-1 text-sm font-bold', inactive ? 'bg-cream-dark text-ink-muted' : 'bg-maroon-soft text-maroon')}>{line.quantity}</span>
      <div className="min-w-0 flex-1">
        <p className={cn('leading-snug', inactive ? 'text-ink-muted line-through' : 'font-semibold text-ink')}>{localizedName(locale, line.name, line.nameEn)}</p>
        {line.modifiers.length ? <p className="text-xs text-ink-soft">{line.modifiers.map((m) => m.optionName).join(' · ')}</p> : null}
        {line.note ? <p className="text-xs text-ink-muted italic">“{line.note}”</p> : null}
        <p className="tabular mt-0.5 text-xs text-ink-muted">{formatVnd(line.lineTotal)}</p>
      </div>
      <LineStatusBadge status={line.status} orderStatus={orderStatus} />
    </li>
  );
}
