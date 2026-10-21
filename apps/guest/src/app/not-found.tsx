import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { CalendarDays, House, UtensilsCrossed } from 'lucide-react';

export default async function NotFound() {
  const t = await getTranslations('errors');
  const tc = await getTranslations('common');
  return (
    <div className="animate-rise py-10 text-center">
      <p className="tabular font-serif text-[96px] leading-none font-bold">
        <span className="gold-text">404</span>
      </p>
      <h1 className="mt-4 font-serif text-2xl font-bold text-ink">{t('notFoundTitle')}</h1>
      <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-ink-soft">{t('notFoundBody')}</p>
      <div className="mx-auto mt-7 grid grid-cols-1 max-w-xs gap-2.5">
        <Link href="/" className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-maroon px-6 font-semibold text-white shadow-[0_6px_16px_-6px_rgb(139_30_45/0.6)] transition active:scale-[0.97]">
          <House className="h-5 w-5" />
          {tc('goHome')}
        </Link>
        <div className="grid grid-cols-2 gap-2.5">
          <Link href="/menu" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-paper font-semibold text-maroon ring-1 ring-maroon/25">
            <UtensilsCrossed className="h-4 w-4" />
            {tc('viewMenu')}
          </Link>
          <Link href="/reserve" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-paper font-semibold text-maroon ring-1 ring-maroon/25">
            <CalendarDays className="h-4 w-4" />
            {tc('reserve')}
          </Link>
        </div>
      </div>
    </div>
  );
}
