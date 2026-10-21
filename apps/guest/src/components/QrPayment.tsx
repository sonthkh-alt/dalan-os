'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Copy } from 'lucide-react';
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
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(qr.payload, { errorCorrectionLevel: 'M', margin: 1, width: 320, color: { dark: '#1f1a17', light: '#ffffff' } })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => setDataUrl(null));
    return () => {
      cancelled = true;
    };
  }, [qr.payload]);
  const bank = qr.bankBin ? findBankByBin(qr.bankBin) : undefined;
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast(t('copied'));
    } catch {
      /* trình duyệt không cho phép */
    }
  };
  const rows: [string, string][] = [
    [t('bank'), bank ? `${bank.shortName} (${bank.name})` : (qr.bankBin ?? '')],
    [t('account'), qr.accountNo ?? ''],
    [t('accountName'), qr.accountName ?? ''],
    [t('amount'), formatVnd(qr.amount)],
    [t('purpose'), qr.purpose],
  ];
  return (
    <div className="rounded-2xl border border-line bg-paper p-4">
      <p className="text-sm text-ink-soft">{t('payQrHint')}</p>
      <div className="my-3 flex justify-center">
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dataUrl} alt="VietQR" width={240} height={240} className="h-60 w-60 rounded-xl border border-line" />
        ) : (
          <div className="h-60 w-60 animate-pulse rounded-xl bg-cream-dark" />
        )}
      </div>
      <dl className="space-y-1.5 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-2">
            <dt className="text-ink-muted">{label}</dt>
            <dd className="flex items-center gap-1 font-medium text-ink">
              {value}
              {label === t('account') || label === t('purpose') ? (
                <button type="button" onClick={() => copy(value)} className="rounded p-1 text-ink-muted hover:text-maroon" aria-label={t('copy')}>
                  <Copy className="h-4 w-4" />
                </button>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
