'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Copy, ShieldCheck } from 'lucide-react';
import QRCode from 'qrcode';
import { findBankByBin } from '@dalan/domain';
import { formatVnd } from '@/lib/format';
import { useToast } from './ui';

export interface VietQrInfo {
  payload: string;
  amount: number;
  bankBin: string | null;
  accountNo: string | null;
  accountName: string | null;
  purpose: string;
}

/** Hiển thị mã VietQR từ chuỗi EMVCo (do API sinh) cùng thông tin chuyển khoản tay. */
export function QrPayment({ qr }: { qr: VietQrInfo }) {
  const t = useTranslations('bill');
  const toast = useToast((s) => s.show);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(qr.payload, { errorCorrectionLevel: 'M', margin: 1, width: 360, color: { dark: '#1f1a17', light: '#ffffff' } })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => setDataUrl(null));
    return () => {
      cancelled = true;
    };
  }, [qr.payload]);
  const bank = qr.bankBin ? findBankByBin(qr.bankBin) : undefined;
  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      toast(t('copied'));
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
    } catch {
      /* trình duyệt không cho phép */
    }
  };
  const rows: { key: string; label: string; value: string; copyable?: boolean }[] = [
    { key: 'bank', label: t('bank'), value: bank ? `${bank.shortName} (${bank.name})` : (qr.bankBin ?? '') },
    { key: 'account', label: t('account'), value: qr.accountNo ?? '', copyable: true },
    { key: 'name', label: t('accountName'), value: qr.accountName ?? '' },
    { key: 'amount', label: t('amount'), value: formatVnd(qr.amount), copyable: true },
    { key: 'purpose', label: t('purpose'), value: qr.purpose, copyable: true },
  ];
  return (
    <div className="overflow-hidden rounded-[28px] bg-paper shadow-card ring-1 ring-line-soft">
      <div className="bg-linear-to-b from-gold-soft to-paper px-5 pt-5 pb-4 text-center">
        <p className="text-sm text-ink-soft">{t('payQrHint')}</p>
        <div className="mx-auto mt-4 w-fit rounded-3xl bg-paper p-3 shadow-lift ring-1 ring-line-soft">
          {dataUrl ? (
            <img src={dataUrl} alt="VietQR" width={232} height={232} className="h-58 w-58" />
          ) : (
            <div className="skeleton h-58 w-58 rounded-2xl" />
          )}
        </div>
        <p className="tabular mt-3 font-serif text-2xl font-bold text-maroon">{formatVnd(qr.amount)}</p>
      </div>
      <dl className="divide-y divide-line-soft border-t border-line-soft">
        {rows.map((r) => (
          <div key={r.key} className="flex min-h-12 items-center justify-between gap-3 px-5 py-2 text-sm">
            <dt className="shrink-0 text-ink-muted">{r.label}</dt>
            <dd className="flex min-w-0 items-center gap-1 text-right font-semibold text-ink">
              <span className="tabular min-w-0 wrap-break-word">{r.value}</span>
              {r.copyable ? (
                <button type="button" onClick={() => copy(r.key, r.key === 'amount' ? String(qr.amount) : r.value)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-cream hover:text-maroon" aria-label={`${t('copy')} ${r.label}`}>
                  {copied === r.key ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                </button>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
      <p className="flex items-center justify-center gap-1.5 border-t border-line-soft px-5 py-3 text-xs text-ink-muted">
        <ShieldCheck className="h-4 w-4 text-success" />
        {t('autoConfirm')}
      </p>
    </div>
  );
}
