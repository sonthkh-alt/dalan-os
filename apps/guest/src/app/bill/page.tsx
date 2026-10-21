'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, ReceiptText } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useGuestSessionView, useGuestToken } from '@/lib/guest-data';
import { formatVnd } from '@/lib/format';
import { SessionGate } from '@/components/SessionGate';
import { BillStatusBadge } from '@/components/StatusBadge';
import { Button, Card, EmptyState, Spinner, useToast } from '@/components/ui';

export default function BillPage() {
  return (
    <SessionGate>
      <Bill />
    </SessionGate>
  );
}

function Bill() {
  const t = useTranslations('bill');
  const tc = useTranslations('common');
  const token = useGuestToken();
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
  const s = view.data;
  const totals = s.totals;
  const discount = totals.lineDiscountTotal + totals.billDiscountTotal;
  const closed = s.status === 'CLOSED';
  const hasBillable = s.orders.some((o) => o.lines.some((l) => ['SENT', 'PREPARING', 'READY', 'SERVED'].includes(l.status)));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t('title')}</h1>
      {closed ? (
        <Card className="bg-success-soft text-center">
          <p className="text-lg font-bold text-success">{t('thanks')}</p>
          <Link href="/feedback" className="mt-2 inline-block">
            <Button variant="secondary">{t('rate')}</Button>
          </Link>
        </Card>
      ) : null}

      <Card>
        <h2 className="mb-2 text-base font-bold">{t('provisional')}</h2>
        <dl className="space-y-1.5 text-sm">
          <Row label={t('subtotal')} value={formatVnd(totals.subtotal)} />
          {discount > 0 ? <Row label={t('discount')} value={`-${formatVnd(discount)}`} /> : null}
          {totals.minSpendSurcharge > 0 ? <Row label="Phụ thu" value={formatVnd(totals.minSpendSurcharge)} /> : null}
          {totals.serviceChargeAmount > 0 ? <Row label={t('serviceCharge', { pct: totals.serviceChargeBps / 100 })} value={formatVnd(totals.serviceChargeAmount)} /> : null}
          <Row label={s.branch.priceIncludesVat ? t('vat') : t('vatExcluded')} value={formatVnd(totals.vatAmount)} muted />
          <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-base">
            <dt className="font-bold">{t('total')}</dt>
            <dd className="text-xl font-bold text-maroon">{formatVnd(totals.total)}</dd>
          </div>
        </dl>
        {!closed && hasBillable ? (
          <Button
            size="lg"
            className="mt-4 w-full"
            onClick={() => requestBill.mutate()}
            loading={requestBill.isPending}
            disabled={s.status === 'BILL_REQUESTED'}
          >
            {s.status === 'BILL_REQUESTED' ? t('billRequested') : t('requestBill')}
          </Button>
        ) : null}
        {!closed && s.bills.length === 0 ? <p className="mt-3 text-xs text-ink-muted">{t('noQrYet')}</p> : null}
      </Card>

      {s.bills.length > 0 ? (
        <section>
          <h2 className="mb-2 text-base font-bold">{t('bills')}</h2>
          <ul className="space-y-2">
            {s.bills.map((b) => (
              <li key={b.id}>
                <Link href={`/bill/${b.id}`} className="flex items-center justify-between rounded-2xl border border-line bg-paper p-4">
                  <span>
                    <span className="flex items-center gap-2 font-semibold">
                      <ReceiptText className="h-4 w-4 text-maroon" />
                      {b.code}
                    </span>
                    <span className="mt-1 block">
                      <BillStatusBadge status={b.status} />
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-right">
                      <span className="block font-bold text-maroon">{formatVnd(b.total)}</span>
                      {b.paidTotal > 0 && b.paidTotal < b.total ? <span className="block text-xs text-ink-muted">{t('paid')} {formatVnd(b.paidTotal)}</span> : null}
                    </span>
                    <ChevronRight className="h-5 w-5 text-ink-muted" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${muted ? 'text-ink-muted' : ''}`}>
      <dt>{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
