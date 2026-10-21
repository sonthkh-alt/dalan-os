'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarDays, Camera, ChevronRight, Crown, ScanQrCode, UtensilsCrossed } from 'lucide-react';
import { useHydrated } from '@/lib/hydrated';
import { isSessionValid, useGuestSession } from '@/lib/session-store';
import { Sheet } from './ui';

/** Thẻ "đang ngồi bàn" trên trang chủ để quay lại gọi món nhanh. */
export function ActiveTableBanner() {
  const t = useTranslations('home');
  const hydrated = useHydrated();
  const session = useGuestSession();
  if (!hydrated || !isSessionValid(session) || !session.table) return null;
  return (
    <Link href="/menu" className="flex animate-rise items-center gap-3 rounded-3xl bg-paper p-3.5 shadow-lift ring-2 ring-success/40 transition active:scale-[0.99]">
      <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-success-soft text-success">
        <UtensilsCrossed className="h-5 w-5" />
        <span className="absolute -top-0.5 -right-0.5 h-3 w-3 animate-pulse rounded-full bg-success ring-2 ring-paper" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-success">{t('atTable')}</span>
        <span className="block truncate font-bold text-ink">
          {session.table.name} · {session.branch?.name}
        </span>
      </span>
      <span className="flex items-center gap-1 rounded-full bg-maroon px-3.5 py-2 text-sm font-semibold text-white">
        {t('continueOrder')}
        <ChevronRight className="h-4 w-4" />
      </span>
    </Link>
  );
}

/** Lối tắt chính: quét QR, đặt bàn, thực đơn, thành viên. */
export function QuickActions() {
  const t = useTranslations('home');
  const [qrOpen, setQrOpen] = useState(false);
  const tile = 'group flex min-h-28 flex-col justify-between rounded-3xl bg-paper p-4 text-left shadow-card ring-1 ring-line-soft transition hover:shadow-lift active:scale-[0.98]';
  const icon = 'flex h-11 w-11 items-center justify-center rounded-2xl';
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <button type="button" onClick={() => setQrOpen(true)} className={tile}>
          <span className={`${icon} bg-maroon text-white`}>
            <ScanQrCode className="h-5 w-5" />
          </span>
          <span>
            <span className="block font-bold text-ink">{t('qaOrder')}</span>
            <span className="block text-xs text-ink-muted">{t('qaOrderHint')}</span>
          </span>
        </button>
        <Link href="/reserve" className={tile}>
          <span className={`${icon} bg-gold-soft text-gold`}>
            <CalendarDays className="h-5 w-5" />
          </span>
          <span>
            <span className="block font-bold text-ink">{t('reserve')}</span>
            <span className="block text-xs text-ink-muted">{t('qaReserveHint')}</span>
          </span>
        </Link>
        <Link href="/menu" className={tile}>
          <span className={`${icon} bg-maroon-soft text-maroon`}>
            <UtensilsCrossed className="h-5 w-5" />
          </span>
          <span>
            <span className="block font-bold text-ink">{t('qaMenu')}</span>
            <span className="block text-xs text-ink-muted">{t('qaMenuHint')}</span>
          </span>
        </Link>
        <Link href="/account" className={tile}>
          <span className={`${icon} bg-ink text-gold-light`}>
            <Crown className="h-5 w-5" />
          </span>
          <span>
            <span className="block font-bold text-ink">{t('account')}</span>
            <span className="block text-xs text-ink-muted">{t('qaMemberHint')}</span>
          </span>
        </Link>
      </div>
      <Sheet open={qrOpen} onClose={() => setQrOpen(false)} title={t('qrTitle')}>
        <div className="pb-4 text-center">
          <div className="mx-auto flex h-36 w-36 items-center justify-center rounded-4xl bg-linear-to-br from-maroon-soft to-gold-soft">
            <div className="relative flex h-24 w-24 items-center justify-center rounded-3xl bg-paper shadow-card">
              <ScanQrCode className="h-14 w-14 text-maroon" strokeWidth={1.5} />
              <span className="absolute inset-x-4 top-1/2 h-0.5 animate-pulse rounded-full bg-gold-light" />
            </div>
          </div>
          <ol className="mx-auto mt-6 max-w-xs space-y-3 text-left text-sm text-ink-soft">
            {(['qrStep1', 'qrStep2', 'qrStep3'] as const).map((k, i) => (
              <li key={k} className="flex items-start gap-3">
                <span className="tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-maroon text-xs font-bold text-white">{i + 1}</span>
                <span className="pt-1">{t(k)}</span>
              </li>
            ))}
          </ol>
          <p className="mx-auto mt-5 flex max-w-xs items-center justify-center gap-2 rounded-2xl bg-cream-dark px-3 py-2.5 text-xs text-ink-soft">
            <Camera className="h-4 w-4 shrink-0" />
            {t('qrCameraHint')}
          </p>
        </div>
      </Sheet>
    </>
  );
}
