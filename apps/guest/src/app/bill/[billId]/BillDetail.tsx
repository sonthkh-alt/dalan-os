'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { billTransferPurpose } from '@dalan/domain';
import { PAYMENT_METHOD_LABELS, type PaymentMethod, type TaxInvoiceInfo } from '@dalan/contracts';
import { api, ApiError, isNotFound } from '@/lib/api';
import { useGuestToken } from '@/lib/guest-data';
import { formatVnd, localizedName } from '@/lib/format';
import { SessionGate } from '@/components/SessionGate';
import { BillStatusBadge } from '@/components/StatusBadge';
import { QrPayment } from '@/components/QrPayment';
import { TaxInvoiceForm } from '@/components/TaxInvoiceForm';
import { Button, Card, EmptyState, Spinner, useToast } from '@/components/ui';

interface BillView {
  id: string;
  code: string;
  status: string;
  sessionId: string;
  subtotal: number;
  lineDiscountTotal: number;
  billDiscountTotal: number;
  serviceChargeBps: number;
  serviceChargeAmount: number;
  vatAmount: number;
  roundingAdjustment: number;
  total: number;
  paidTotal: number;
  due: number;
  taxInvoiceInfo: Partial<TaxInvoiceInfo> | null;
  branch: { name: string; bankBin: string | null; bankAccountNo: string | null; bankAccountName: string | null; priceIncludesVat: boolean };
  lines: { id: string; amount: number; discountAmount: number; quantityShare: number; orderLine: { nameSnapshot: string; unitSnapshot: string; quantity: number; unitPrice: number; isAdjustment: boolean } }[];
  discounts: { id: string; kind: string; amount: number; reason: string | null }[];
  payments: { id: string; method: PaymentMethod; subMethod: string | null; amount: number; status: string; qrPayload: string | null }[];
  eInvoice: { status: string; invoiceNo: string | null; lookupUrl: string | null; lookupCode: string | null } | null;
}

export function BillDetail({ billId }: { billId: string }) {
  return (
    <SessionGate>
      <Detail billId={billId} />
    </SessionGate>
  );
}

function Detail({ billId }: { billId: string }) {
  const t = useTranslations('bill');
  const tc = useTranslations('common');
  const locale = useLocale();
  const token = useGuestToken();
  const toast = useToast((s) => s.show);
  const queryClient = useQueryClient();
  const [showTax, setShowTax] = useState(false);
  const bill = useQuery({
    queryKey: ['bill', billId],
    queryFn: () => api<BillView>(`/bills/${billId}`, { guestToken: token }),
    refetchInterval: 10_000,
  });

  // Tự thanh toán online: endpoint do mô-đun thanh toán cung cấp; nếu chưa có (404) thì hướng dẫn gọi nhân viên.
  const selfPay = useMutation({
    mutationFn: () => api<{ redirectUrl?: string; qrCode?: string }>(`/bills/${billId}/payment-intents`, { guestToken: token, body: { method: 'VNPAY' } }),
    onSuccess: (r) => {
      if (r.redirectUrl) window.location.href = r.redirectUrl;
      else void queryClient.invalidateQueries({ queryKey: ['bill', billId] });
    },
    onError: (err) => toast(isNotFound(err) ? t('selfPayUnavailable') : err instanceof ApiError ? err.message : tc('errorGeneric'), 'warn'),
  });

  if (bill.isPending) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }
  if (bill.isError || !bill.data) {
    return <EmptyState title={tc('errorGeneric')} action={<Button variant="secondary" onClick={() => bill.refetch()}>{tc('retry')}</Button>} />;
  }
  const b = bill.data;
  const pendingTransfer = b.payments.find((p) => p.method === 'BANK_TRANSFER' && p.status === 'PENDING' && p.qrPayload);
  const discount = b.lineDiscountTotal + b.billDiscountTotal;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/bill" className="rounded-full p-2 text-ink-soft hover:bg-cream-dark" aria-label={tc('back')}>
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold">{b.code}</h1>
        <BillStatusBadge status={b.status} />
      </div>

      {b.status === 'PAID' ? (
        <Card className="bg-success-soft text-center">
          <p className="font-bold text-success">{t('thanks')}</p>
          {b.eInvoice?.lookupUrl ? (
            <a href={b.eInvoice.lookupUrl} target="_blank" rel="noreferrer" className="mt-1 block text-sm text-maroon underline">
              {t('lookup')} {b.eInvoice.invoiceNo ? `#${b.eInvoice.invoiceNo}` : ''}
            </a>
          ) : null}
          <Link href="/feedback" className="mt-2 inline-block">
            <Button variant="secondary">{t('rate')}</Button>
          </Link>
        </Card>
      ) : null}

      {pendingTransfer && b.status !== 'PAID' ? (
        <section>
          <h2 className="mb-2 text-base font-bold">{t('payQr')}</h2>
          <QrPayment
            qr={{
              payload: pendingTransfer.qrPayload!,
              amount: pendingTransfer.amount,
              bankBin: b.branch.bankBin,
              accountNo: b.branch.bankAccountNo,
              accountName: b.branch.bankAccountName,
              purpose: billTransferPurpose(b.code),
            }}
          />
        </section>
      ) : null}

      {b.status !== 'PAID' && !pendingTransfer ? (
        <Card>
          <p className="text-sm text-ink-soft">{t('noQrYet')}</p>
          <Button variant="secondary" className="mt-3 w-full" onClick={() => selfPay.mutate()} loading={selfPay.isPending}>
            {t('selfPay')}
          </Button>
        </Card>
      ) : null}

      <Card>
        <h2 className="mb-2 text-base font-bold">{t('lines')}</h2>
        <ul className="divide-y divide-line text-sm">
          {b.lines.map((l) => (
            <li key={l.id} className="flex items-start justify-between gap-2 py-2">
              <span>
                <span className="text-maroon">{Math.round(l.orderLine.quantity * l.quantityShare * 1000) / 1000}</span> × {localizedName(locale, l.orderLine.nameSnapshot)}
                {l.discountAmount > 0 ? <span className="block text-xs text-success">-{formatVnd(l.discountAmount)}</span> : null}
              </span>
              <span className="font-medium">{formatVnd(l.amount)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1 border-t border-line pt-2 text-sm">
          <Row label={t('subtotal')} value={formatVnd(b.subtotal)} />
          {discount > 0 ? <Row label={t('discount')} value={`-${formatVnd(discount)}`} /> : null}
          {b.serviceChargeAmount > 0 ? <Row label={t('serviceCharge', { pct: b.serviceChargeBps / 100 })} value={formatVnd(b.serviceChargeAmount)} /> : null}
          <Row label={b.branch.priceIncludesVat ? t('vat') : t('vatExcluded')} value={formatVnd(b.vatAmount)} muted />
          {b.roundingAdjustment !== 0 ? <Row label="Làm tròn" value={formatVnd(b.roundingAdjustment)} muted /> : null}
          <div className="flex items-center justify-between pt-1 text-base">
            <dt className="font-bold">{t('total')}</dt>
            <dd className="text-xl font-bold text-maroon">{formatVnd(b.total)}</dd>
          </div>
          {b.paidTotal > 0 ? <Row label={t('paid')} value={formatVnd(b.paidTotal)} /> : null}
          {b.due > 0 && b.paidTotal > 0 ? <Row label={t('due')} value={formatVnd(b.due)} /> : null}
        </dl>
      </Card>

      {b.payments.filter((p) => p.status === 'SUCCEEDED').length > 0 ? (
        <Card>
          <h2 className="mb-2 text-base font-bold">{t('payments')}</h2>
          <ul className="space-y-1 text-sm">
            {b.payments
              .filter((p) => p.status === 'SUCCEEDED')
              .map((p) => (
                <li key={p.id} className="flex items-center justify-between">
                  <span>{p.subMethod === 'APPLE_PAY' ? 'Apple Pay' : PAYMENT_METHOD_LABELS[p.method]}</span>
                  <span className="font-medium">{formatVnd(p.amount)}</span>
                </li>
              ))}
          </ul>
        </Card>
      ) : null}

      {b.status !== 'PAID' ? (
        <Card>
          <button type="button" className="flex w-full items-center justify-between text-left font-semibold" onClick={() => setShowTax((v) => !v)} aria-expanded={showTax}>
            {t('taxInvoice')}
            <span className="text-ink-muted">{showTax ? '−' : '+'}</span>
          </button>
          {showTax ? (
            <div className="mt-3">
              <TaxInvoiceForm billId={b.id} initial={b.taxInvoiceInfo} />
            </div>
          ) : b.taxInvoiceInfo?.buyerName ? (
            <p className="mt-1 text-xs text-ink-muted">
              {b.taxInvoiceInfo.buyerName} {b.taxInvoiceInfo.buyerTaxCode ? `· MST ${b.taxInvoiceInfo.buyerTaxCode}` : ''}
            </p>
          ) : null}
        </Card>
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
