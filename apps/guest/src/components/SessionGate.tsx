'use client';

import { useTranslations } from 'next-intl';
import { CalendarDays, House, ScanQrCode, UtensilsCrossed } from 'lucide-react';
import type { ReactNode } from 'react';
import { useHydrated } from '@/lib/hydrated';
import { isSessionValid, useGuestSession } from '@/lib/session-store';
import { useGuestRealtime } from '@/lib/realtime';
import { LinkButton, PageSpinner } from './ui';

/** Chỉ hiển thị nội dung khi khách đã vào bàn; đồng thời giữ kết nối realtime. */
export function SessionGate({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  const session = useGuestSession();
  const valid = hydrated && isSessionValid(session);
  useGuestRealtime(valid ? session.guestToken : null);

  if (!hydrated) return <PageSpinner />;
  if (!valid) return <NoSessionState expired={!!session.guestToken} />;
  return <>{children}</>;
}

/** Trạng thái chưa vào bàn: không bao giờ là ngõ cụt — luôn có thực đơn, đặt bàn, trang chủ. */
export function NoSessionState({ expired }: { expired?: boolean }) {
  const t = useTranslations('gate');
  return (
    <div className="animate-rise py-6">
      <div className="relative overflow-hidden rounded-[28px] bg-paper p-6 text-center shadow-card ring-1 ring-line-soft">
        <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-[28px] bg-linear-to-br from-maroon-soft to-gold-soft">
          <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-paper shadow-card">
            <ScanQrCode className="h-11 w-11 text-maroon" strokeWidth={1.6} />
            <span className="absolute inset-x-3 top-1/2 h-0.5 animate-pulse rounded-full bg-gold-light/80" aria-hidden />
          </div>
        </div>
        <h1 className="mt-5 font-serif text-2xl font-bold text-ink">{expired ? t('expiredTitle') : t('title')}</h1>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-ink-soft">{expired ? t('expiredBody') : t('body')}</p>
        <ol className="mx-auto mt-5 max-w-xs space-y-2 text-left text-sm text-ink-soft">
          {(['step1', 'step2', 'step3'] as const).map((k, i) => (
            <li key={k} className="flex items-center gap-3">
              <span className="tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-maroon text-xs font-bold text-white">{i + 1}</span>
              {t(k)}
            </li>
          ))}
        </ol>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2.5">
        <LinkButton href="/menu" size="lg">
          <UtensilsCrossed className="h-5 w-5" />
          {t('viewMenu')}
        </LinkButton>
        <div className="grid grid-cols-2 gap-2.5">
          <LinkButton href="/reserve" variant="secondary">
            <CalendarDays className="h-4.5 w-4.5" />
            {t('reserve')}
          </LinkButton>
          <LinkButton href="/" variant="secondary">
            <House className="h-4.5 w-4.5" />
            {t('home')}
          </LinkButton>
        </div>
      </div>
    </div>
  );
}
