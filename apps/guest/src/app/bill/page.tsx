'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BellRing, ChevronRight, CreditCard, MessageSquareHeart, QrCode, ReceiptText, RefreshCw, Smartphone, Wallet } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useGuestSessionView, useGuestToken } from '@/lib/guest-data';
import { useGuestSession } from '@/lib/session-store';
import { formatTime, formatVnd, localizedName } from '@/lib/format';
import { SessionGate } from '@/components/SessionGate';
import { BillStatusBadge } from '@/components/StatusBadge';
import { Receipt, ReceiptDivider, ReceiptRow, ReceiptTotal } from '@/components/Receipt';
import { ListSkeleton } from '@/components/Skeletons';
import { Button, EmptyState, LinkButton, PageTitle, SectionTitle, useToast } from '@/components/ui';

export default function BillPage() {
  return (
    <SessionGate>
      <Bill />
    </SessionGate>
  );
}

const BILLABLE = ['SENT', 'PREPARING', 'READY', 'SERVED'];

function Bill() {
  const t = useTranslations('bill');
  const tc = useTranslations('common');
  const locale = useLocale();
  const token = useGuestToken();
  const table = useGuestSession((s) => s.table);
  const toast = useToast((s) => s.show);
  const queryClient = useQueryClient();
  const view = useGuestSessionView();
  const requestBill = useMutation({
    mutationFn: () => api('/guest/service-requests', { guestToken: token, body: { kind: 'BILL' } }),
    onSuccess: () => {
      toast(t('billRequested'));
      void queryClient.invalidateQueries({ queryKey: ['guest-session'] });
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : tc('errorGeneric'), 'error'),
  });

  if (view.isPending) return <ListSkeleton rows={2} />;
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
  const s = view.data;
  const totals = s.totals;
  const discount = totals.lineDiscountTotal + totals.billDiscountTotal;
  const closed = s.status === 'CLOSED';
  const requested = s.status === 'BILL_REQUESTED';

  // Gộp các dòng giống nhau để hóa đơn tạm tính gọn như bill in
  const grouped = new Map<string, { name: string; nameEn: string | null; quantity: number; total: number; unit: string }>();
  for (const o of s.orders) {
    if (o.status === 'CANCELLED') continue;
    for (const l of o.lines) {
      if (!BILLABLE.includes(l.status)) continue;
      const key = `${l.name}|${l.unitPrice}|${l.modifiers.map((m) => m.optionName).join(',')}`;
      const g = grouped.get(key);
      if (g) {
        g.quantity += l.quantity;
        g.total += l.lineTotal;
      } else grouped.set(key, { name: l.name, nameEn: l.nameEn, quantity: l.quantity, total: l.lineTotal, unit: l.unit });
    }
  }
  const rows = [...grouped.values()];
  const hasBillable = rows.length > 0;

  return (
    <div>
      <PageTitle eyebrow={table ? `${table.name} · ${s.code}` : s.code} title={t('title')} />

      {closed ? (
        <div className="mb-5 animate-rise rounded-[28px] bg-success-soft p-5 text-center">
          <p className="font-serif text-xl font-bold text-success">{t('thanks')}</p>
          <LinkButton href="/feedback" variant="secondary" className="mt-3">
            <MessageSquareHeart className="h-4 w-4" />
            {t('rate')}
          </LinkButton>
        </div>
      ) : null}

      {s.bills.length > 0 ? (
        <section className="mb-6">
          <SectionTitle>{t('bills')}</SectionTitle>
          <ul className="space-y-2.5">
            {s.bills.map((b) => (
              <li key={b.id}>
                <Link href={`/bill/${b.id}`} className="flex items-center gap-3 rounded-3xl bg-paper p-4 shadow-card ring-1 ring-line-soft transition hover:shadow-lift active:scale-[0.99]">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-maroon-soft text-maroon">
                    <ReceiptText className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-ink">{b.code}</span>
                    <span className="mt-1 flex items-center gap-2">
                      <BillStatusBadge status={b.status} />
                      <span className="text-xs text-ink-muted">{formatTime(b.createdAt, locale)}</span>
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="tabular block font-bold text-maroon">{formatVnd(b.total)}</span>
                    {b.paidTotal > 0 && b.paidTotal < b.total ? (
                      <span className="tabular block text-xs text-ink-muted">
                        {t('paid')} {formatVnd(b.paidTotal)}
                      </span>
                    ) : null}
                    {b.status !== 'PAID' && b.status !== 'VOID' ? <span className="block text-xs font-semibold text-maroon">{t('payNow')}</span> : null}
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-ink-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Receipt>
        <div className="text-center">
          <p className="font-serif text-xl font-bold text-maroon">{s.branch.name}</p>
          <p className="mt-0.5 text-xs tracking-wider text-ink-muted uppercase">{t('provisional')}</p>
          <p className="mt-1 text-xs text-ink-muted">
            {s.tables.map((x) => x.name).join(', ')} · {t('guests', { count: s.guestCount })} · {formatTime(s.openedAt, locale)}
          </p>
        </div>
        <ReceiptDivider />
        {hasBillable ? (
          <ul className="space-y-2">
            {rows.map((r, i) => (
              <li key={i} className="flex items-baseline gap-3 text-sm">
                <span className="tabular w-8 shrink-0 text-ink-muted">{r.quantity}×</span>
                <span className="min-w-0 flex-1 text-ink">{localizedName(locale, r.name, r.nameEn)}</span>
                <span className="tabular shrink-0 font-medium text-ink">{formatVnd(r.total)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-4 text-center text-sm text-ink-muted">{t('nothingYet')}</p>
        )}
        <ReceiptDivider />
        <dl className="space-y-0.5">
          <ReceiptRow label={t('subtotal')} value={formatVnd(totals.subtotal)} />
          {discount > 0 ? <ReceiptRow label={t('discount')} value={`−${formatVnd(discount)}`} accent="success" /> : null}
          {totals.minSpendSurcharge > 0 ? <ReceiptRow label={t('minSpend')} value={formatVnd(totals.minSpendSurcharge)} /> : null}
          {totals.serviceChargeAmount > 0 ? <ReceiptRow label={t('serviceCharge', { pct: totals.serviceChargeBps / 100 })} value={formatVnd(totals.serviceChargeAmount)} /> : null}
          <ReceiptRow label={s.branch.priceIncludesVat ? t('vat') : t('vatExcluded')} value={formatVnd(totals.vatAmount)} muted />
        </dl>
        <ReceiptDivider />
        <dl>
          <ReceiptTotal label={t('total')} value={formatVnd(totals.total)} />
        </dl>
      </Receipt>

      {!closed && hasBillable ? (
        <div className="mt-5 space-y-2.5">
          <Button size="lg" className="w-full" onClick={() => requestBill.mutate()} loading={requestBill.isPending} disabled={requested}>
            <BellRing className="h-5 w-5" />
            {requested ? t('billRequested') : t('requestBill')}
          </Button>
          {requested ? <p className="text-center text-xs text-ink-muted">{t('requestedHint')}</p> : null}
        </div>
      ) : null}

      {!closed ? (
        <section className="mt-6 rounded-3xl bg-paper p-4 ring-1 ring-line-soft">
          <p className="text-sm font-semibold text-ink">{t('methods')}</p>
          <div className="mt-3 grid grid-cols-4 gap-2 text-center text-[11px] font-medium text-ink-soft">
            {[
              { icon: QrCode, label: 'VietQR' },
              { icon: CreditCard, label: t('card') },
              { icon: Smartphone, label: 'Apple Pay' },
              { icon: Wallet, label: t('cash') },
            ].map(({ icon: Icon, label }) => (
              <span key={label} className="flex flex-col items-center gap-1.5">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cream text-maroon">
                  <Icon className="h-5 w-5" />
                </span>
                {label}
              </span>
            ))}
          </div>
          {s.bills.length === 0 ? <p className="mt-3 text-xs leading-relaxed text-ink-muted">{t('noQrYet')}</p> : null}
        </section>
      ) : null}
    </div>
  );
}
