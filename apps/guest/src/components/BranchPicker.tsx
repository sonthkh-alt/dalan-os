'use client';

import { useLocale, useTranslations } from 'next-intl';
import { ChevronRight, MapPin, ScanQrCode, Users } from 'lucide-react';
import { BRANCHES } from '@/lib/branches';
import { cn } from '@/lib/format';
import { PageTitle } from './ui';

/** Ký hiệu từng cơ sở (không có ảnh thật nên dùng chữ + nền thương hiệu). */
export const BRANCH_ACCENT: Record<string, string> = {
  CENTER: 'from-maroon to-maroon-deep',
  STAR: 'from-[#5b1a2b] to-[#2d0a12]',
  EVENT: 'from-[#9a6a12] to-[#5e3d05]',
};

export function BranchMonogram({ code, className }: { code: string; className?: string }) {
  const label = code === 'CENTER' ? 'C' : code === 'STAR' ? 'S' : code === 'EVENT' ? 'E' : code.charAt(0);
  return (
    <span className={cn('flex shrink-0 items-center justify-center rounded-2xl bg-linear-to-br font-serif font-bold text-gold-light ring-1 ring-gold/30', BRANCH_ACCENT[code] ?? BRANCH_ACCENT.CENTER, className)}>
      {label}
    </span>
  );
}

/** Chọn cơ sở để xem thực đơn khi khách chưa quét QR tại bàn. */
export function BranchPicker({ onPick }: { onPick: (code: string) => void }) {
  const t = useTranslations('branchPicker');
  const th = useTranslations('home');
  const locale = useLocale();
  return (
    <div className="animate-rise">
      <PageTitle eyebrow={t('eyebrow')} title={t('title')} subtitle={t('subtitle')} />
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {BRANCHES.map((b) => (
          <li key={b.code}>
            <button type="button" onClick={() => onPick(b.code)} className="group flex h-full w-full items-center gap-4 rounded-3xl bg-paper p-4 text-left shadow-card ring-1 ring-line-soft transition hover:shadow-lift active:scale-[0.99] md:flex-col md:items-stretch">
              <BranchMonogram code={b.code} className="h-14 w-14 text-2xl" />
              <span className="min-w-0 flex-1">
                <span className="block font-serif text-lg font-bold text-ink">{b.name}</span>
                <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-ink-soft">{locale === 'en' ? b.highlight.en : b.highlight.vi}</span>
                <span className="mt-1.5 flex items-center gap-1 text-xs text-ink-muted">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{b.address}</span>
                </span>
                {b.capacity ? (
                  <span className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
                    <Users className="h-3.5 w-3.5 shrink-0" />
                    {th('capacity', { count: b.capacity.toLocaleString('vi-VN') })}
                  </span>
                ) : null}
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-ink-muted transition group-hover:translate-x-0.5 md:hidden" />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex items-center gap-3 rounded-3xl bg-gold-soft p-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-paper text-gold">
          <ScanQrCode className="h-5 w-5" />
        </span>
        <p className="text-[13px] leading-snug text-ink-soft">{t('scanHint')}</p>
      </div>
    </div>
  );
}
