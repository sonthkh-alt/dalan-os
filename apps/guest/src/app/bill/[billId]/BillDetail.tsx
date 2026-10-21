'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, ChevronDown, CreditCard, ExternalLink, FileText, MessageSquareHeart, RefreshCw } from 'lucide-react';
import { billTransferPurpose } from '@dalan/domain';
import { PAYMENT_METHOD_LABELS, type PaymentMethod, type TaxInvoiceInfo } from '@dalan/contracts';
import { api, ApiError, isNotFound } from '@/lib/api';
import { useGuestToken } from '@/lib/guest-data';
import { cn, formatVnd, localizedName } from '@/lib/format';
import { SessionGate } from '@/components/SessionGate';
import { BillStatusBadge } from '@/components/StatusBadge';
import { QrPayment } from '@/components/QrPayment';
import { TaxInvoiceForm } from '@/components/TaxInvoiceForm';
import { Receipt, ReceiptDivider, ReceiptRow, ReceiptTotal } from '@/components/Receipt';
import { ListSkeleton } from '@/components/Skeletons';
import { Button, Card, EmptyState, LinkButton, PageTitle, SectionTitle, useToast } from '@/components/ui';

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

  if (bill.isPending) return <ListSkeleton rows={2} />;
  if (bill.isError || !bill.data) {
    return (
      <EmptyState
        icon={<RefreshCw className="h-8 w-8" />}
        title={tc('errorGeneric')}
        action={
          <>
            <Button variant="secondary" onClick={() => bill.refetch()}>
              {tc('retry')}
            </Button>
            <LinkButton href="/bill" variant="ghost">
              {t('backToBill')}
            </LinkButton>
          </>
        }
      />
    );
  }
  const b = bill.data;
  const pendingTransfer = b.payments.find((p) => p.method === 'BANK_TRANSFER' && p.status === 'PENDING' && p.qrPayload);
  const discount = b.lineDiscountTotal + b.billDiscountTotal;
  const paid = b.status === 'PAID';
  const succeeded = b.payments.filter((p) => p.status === 'SUCCEEDED');

  return (
    <div>
      <PageTitle eyebrow={b.branch.name} title={b.code} action={<BillStatusBadge status={b.status} />} />

      {paid ? (
        <div className="mb-5 animate-rise rounded-[28px] bg-success-soft p-5 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success text-white">
            <BadgeCheck className="h-7 w-7" />
          </span>
          <p className="mt-3 font-serif text-xl font-bold text-success">{t('thanks')}</p>
          {b.eInvoice?.lookupUrl ? (
            <a href={b.eInvoice.lookupUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-maroon underline underline-offset-4">
              {t('lookup')} {b.eInvoice.invoiceNo ? `#${b.eInvoice.invoiceNo}` : ''}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}
          <div className="mt-3">
            <LinkButton href="/feedback" variant="secondary">
              <MessageSquareHeart className="h-4 w-4" />
              {t('rate')}
            </LinkButton>
          </div>
        </div>
      ) : null}

      {!paid ? (
        <section className="mb-5 rounded-[28px] bg-linear-to-br from-maroon to-maroon-deep p-5 text-cream shadow-lift">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-gold-light uppercase">{b.paidTotal > 0 ? t('due') : t('total')}</p>
          <p className="tabular mt-1 font-serif text-4xl font-bold">{formatVnd(b.paidTotal > 0 ? b.due : b.total)}</p>
          {b.paidTotal > 0 ? (
            <p className="tabular mt-1 text-sm text-cream/80">
              {t('paid')} {formatVnd(b.paidTotal)} / {formatVnd(b.total)}
            </p>
          ) : null}
        </section>
      ) : null}

      {pendingTransfer && !paid ? (
        <section className="mb-5">
          <SectionTitle>{t('payQr')}</SectionTitle>
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

      {!paid && !pendingTransfer ? (
        <Card className="mb-5">
          <p className="text-sm leading-relaxed text-ink-soft">{t('noQrYet')}</p>
          <Button variant="secondary" className="mt-3 w-full" onClick={() => selfPay.mutate()} loading={selfPay.isPending}>
            <CreditCard className="h-4 w-4" />
            {t('selfPay')}
          </Button>
        </Card>
      ) : null}

      <Receipt>
        <p className="text-center text-xs tracking-wider text-ink-muted uppercase">{t('lines')}</p>
        <ReceiptDivider />
        <ul className="space-y-2">
          {b.lines.map((l) => (
            <li key={l.id} className="flex items-baseline gap-3 text-sm">
              <span className="tabular w-10 shrink-0 text-ink-muted">{Math.round(l.orderLine.quantity * l.quantityShare * 1000) / 1000}×</span>
              <span className="min-w-0 flex-1 text-ink">
                {localizedName(locale, l.orderLine.nameSnapshot)}
                {l.discountAmount > 0 ? <span className="tabular block text-xs text-success">−{formatVnd(l.discountAmount)}</span> : null}
              </span>
              <span className="tabular shrink-0 font-medium">{formatVnd(l.amount)}</span>
            </li>
          ))}
        </ul>
        <ReceiptDivider />
        <dl className="space-y-0.5">
          <ReceiptRow label={t('subtotal')} value={formatVnd(b.subtotal)} />
          {discount > 0 ? <ReceiptRow label={t('discount')} value={`−${formatVnd(discount)}`} accent="success" /> : null}
          {b.serviceChargeAmount > 0 ? <ReceiptRow label={t('serviceCharge', { pct: b.serviceChargeBps / 100 })} value={formatVnd(b.serviceChargeAmount)} /> : null}
          <ReceiptRow label={b.branch.priceIncludesVat ? t('vat') : t('vatExcluded')} value={formatVnd(b.vatAmount)} muted />
          {b.roundingAdjustment !== 0 ? <ReceiptRow label={t('rounding')} value={formatVnd(b.roundingAdjustment)} muted /> : null}
        </dl>
        <ReceiptDivider />
        <dl className="space-y-1">
          <ReceiptTotal label={t('total')} value={formatVnd(b.total)} />
          {b.paidTotal > 0 ? <ReceiptRow label={t('paid')} value={formatVnd(b.paidTotal)} accent="success" /> : null}
          {b.due > 0 && b.paidTotal > 0 ? <ReceiptRow label={t('due')} value={formatVnd(b.due)} strong /> : null}
        </dl>
        {succeeded.length > 0 ? (
          <>
            <ReceiptDivider />
            <p className="mb-1 text-xs font-semibold tracking-wider text-ink-muted uppercase">{t('payments')}</p>
            <dl>
              {succeeded.map((p) => (
                <ReceiptRow key={p.id} label={p.subMethod === 'APPLE_PAY' ? 'Apple Pay' : PAYMENT_METHOD_LABELS[p.method]} value={formatVnd(p.amount)} />
              ))}
            </dl>
          </>
        ) : null}
      </Receipt>

      {!paid ? (
        <section className="mt-5 overflow-hidden rounded-3xl bg-paper shadow-card ring-1 ring-line-soft">
          <button type="button" className="flex min-h-14 w-full items-center gap-3 px-4 text-left" onClick={() => setShowTax((v) => !v)} aria-expanded={showTax}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold-soft text-gold">
              <FileText className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-ink">{t('taxInvoice')}</span>
              {b.taxInvoiceInfo?.buyerName && !showTax ? (
                <span className="block truncate text-xs text-ink-muted">
                  {b.taxInvoiceInfo.buyerName} {b.taxInvoiceInfo.buyerTaxCode ? `· MST ${b.taxInvoiceInfo.buyerTaxCode}` : ''}
                </span>
              ) : (
                <span className="block text-xs text-ink-muted">{t('taxInvoiceHint')}</span>
              )}
            </span>
            <ChevronDown className={cn('h-5 w-5 text-ink-muted transition-transform', showTax && 'rotate-180')} />
          </button>
          {showTax ? (
            <div className="border-t border-line-soft px-4 pt-3 pb-4">
              <TaxInvoiceForm billId={b.id} initial={b.taxInvoiceInfo} />
            </div>
          ) : null}
        </section>
      ) : null}

      {!paid ? (
        <div className="mt-4 text-center">
          <LinkButton href="/feedback" variant="ghost" size="sm">
            <MessageSquareHeart className="h-4 w-4" />
            {t('rate')}
          </LinkButton>
        </div>
      ) : null}
    </div>
  );
}
