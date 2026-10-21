import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { CalendarDays, MapPin, Phone, QrCode, UserRound, UtensilsCrossed } from 'lucide-react';
import { BRANCHES } from '@/lib/branches';

export default async function HomePage() {
  const t = await getTranslations('home');
  const tc = await getTranslations('common');
  const locale = await getLocale();
  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-maroon px-5 py-7 text-cream shadow-md">
        <p className="text-xs font-semibold tracking-widest text-cream/70 uppercase">{tc('slogan')}</p>
        <h1 className="mt-1 font-serif text-3xl font-bold">{t('title')}</h1>
        <p className="mt-2 text-sm text-cream/85">{t('intro')}</p>
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm">
          <QrCode className="h-5 w-5 shrink-0" />
          {t('scanHint')}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/reserve" className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-paper p-4 text-center font-semibold text-maroon">
          <CalendarDays className="h-7 w-7" />
          {t('reserve')}
        </Link>
        <Link href="/account" className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-paper p-4 text-center font-semibold text-maroon">
          <UserRound className="h-7 w-7" />
          {t('account')}
        </Link>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-bold">{t('branches')}</h2>
        <ul className="space-y-3">
          {BRANCHES.map((b) => (
            <li key={b.code} className="rounded-2xl border border-line bg-paper p-4">
              <h3 className="text-base font-bold text-ink">{b.name}</h3>
              <p className="mt-1 text-sm text-ink-soft">{locale === 'en' ? b.highlight.en : b.highlight.vi}</p>
              <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-muted">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {b.address}
              </p>
              {b.capacity ? <p className="mt-1 text-xs text-ink-muted">{t('capacity', { count: b.capacity.toLocaleString('vi-VN') })}</p> : null}
              <div className="mt-3 flex gap-2">
                <Link href={`/menu/${b.code}`} className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-maroon-soft text-sm font-semibold text-maroon">
                  <UtensilsCrossed className="h-4 w-4" />
                  {tc('viewPublicMenu')}
                </Link>
                <a href={`tel:${b.phone}`} className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-line px-3 text-sm font-semibold text-ink-soft">
                  <Phone className="h-4 w-4" />
                  {b.phone}
                </a>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
