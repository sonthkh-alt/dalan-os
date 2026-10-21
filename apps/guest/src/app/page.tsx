import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { CalendarDays, ChevronRight, MapPin, Navigation, Phone, Sparkles, Users, UtensilsCrossed } from 'lucide-react';
import { BRANCHES, mapsUrl } from '@/lib/branches';
import { ActiveTableBanner, QuickActions } from '@/components/HomeClient';
import { BranchMonogram } from '@/components/BranchPicker';

function formatPhone(p: string): string {
  return p.length === 11 ? `${p.slice(0, 4)} ${p.slice(4, 7)} ${p.slice(7)}` : p;
}

export default async function HomePage() {
  const t = await getTranslations('home');
  const tc = await getTranslations('common');
  const locale = await getLocale();
  return (
    <div className="space-y-7">
      {/* Hero */}
      <section className="brand-pattern relative -mx-1 mt-1 overflow-hidden rounded-4xl px-6 pt-8 pb-7 text-cream shadow-lift">
        <div className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full border border-gold-light/20" aria-hidden />
        <div className="pointer-events-none absolute -top-8 -right-8 h-40 w-40 rounded-full border border-gold-light/15" aria-hidden />
        <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.2em] text-gold-light uppercase">
          <Sparkles className="h-3.5 w-3.5" />
          {tc('slogan')}
        </p>
        <h1 className="mt-3 font-serif text-[40px] leading-[1.05] font-bold">
          {t('heroLine1')}
          <br />
          <span className="gold-text">{t('heroLine2')}</span>
        </h1>
        <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-cream/85">{t('intro')}</p>
        <div className="mt-6 flex flex-wrap gap-2.5">
          <Link href="/menu" className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-linear-to-br from-[#f3d488] to-gold px-5 font-bold text-maroon-deep shadow-[0_8px_20px_-8px_rgb(226_183_79/0.7)] transition active:scale-[0.97]">
            <UtensilsCrossed className="h-4.5 w-4.5" />
            {t('qaMenu')}
          </Link>
          <Link href="/reserve" className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-white/12 px-5 font-semibold text-cream ring-1 ring-white/25 backdrop-blur transition hover:bg-white/20 active:scale-[0.97]">
            <CalendarDays className="h-4.5 w-4.5" />
            {t('reserve')}
          </Link>
        </div>
        <dl className="mt-7 grid grid-cols-3 gap-2 border-t border-white/15 pt-5 text-center">
          <div>
            <dt className="text-[11px] text-cream/65">{t('statBranches')}</dt>
            <dd className="font-serif text-2xl font-bold">3</dd>
          </div>
          <div>
            <dt className="text-[11px] text-cream/65">{t('statGuests')}</dt>
            <dd className="tabular font-serif text-2xl font-bold">1.100</dd>
          </div>
          <div>
            <dt className="text-[11px] text-cream/65">{t('statArea')}</dt>
            <dd className="tabular font-serif text-2xl font-bold">11.000m²</dd>
          </div>
        </dl>
      </section>

      <ActiveTableBanner />

      <section aria-label={t('quickActions')}>
        <QuickActions />
      </section>

      {/* Cơ sở */}
      <section>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-gold uppercase">{t('branchesEyebrow')}</p>
            <h2 className="font-serif text-2xl font-bold text-ink">{t('branches')}</h2>
          </div>
        </div>
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {BRANCHES.map((b) => (
            <li key={b.code} className="overflow-hidden rounded-[28px] bg-paper shadow-card ring-1 ring-line-soft">
              <Link href={`/menu/${b.code}`} className="flex items-center gap-3.5 p-4 pb-3">
                <BranchMonogram code={b.code} className="h-14 w-14 text-2xl" />
                <span className="min-w-0 flex-1">
                  <span className="block font-serif text-xl font-bold text-ink">{b.name}</span>
                  <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-ink-soft">{locale === 'en' ? b.highlight.en : b.highlight.vi}</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-ink-muted" />
              </Link>
              <div className="space-y-1 px-4 pb-3 text-xs text-ink-muted">
                <p className="flex items-start gap-1.5">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {b.address}
                </p>
                {b.capacity ? (
                  <p className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 shrink-0" />
                    {t('capacity', { count: b.capacity.toLocaleString('vi-VN') })}
                  </p>
                ) : null}
              </div>
              <div className="grid grid-cols-3 border-t border-line-soft text-[13px] font-semibold">
                <Link href={`/menu/${b.code}`} className="flex min-h-12 items-center justify-center gap-1.5 text-maroon transition hover:bg-cream">
                  <UtensilsCrossed className="h-4 w-4" />
                  {tc('viewMenu')}
                </Link>
                <a href={`tel:${b.phone}`} className="flex min-h-12 items-center justify-center gap-1.5 border-x border-line-soft text-maroon transition hover:bg-cream" aria-label={`${tc('call')} ${formatPhone(b.phone)}`}>
                  <Phone className="h-4 w-4" />
                  {tc('call')}
                </a>
                <a href={mapsUrl(b.name, b.address)} target="_blank" rel="noreferrer" className="flex min-h-12 items-center justify-center gap-1.5 text-maroon transition hover:bg-cream">
                  <Navigation className="h-4 w-4" />
                  {tc('directions')}
                </a>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Đặt tiệc */}
      <section className="relative overflow-hidden rounded-[28px] bg-ink p-6 text-cream">
        <div className="pointer-events-none absolute -right-10 -bottom-10 h-40 w-40 rounded-full bg-gold/20 blur-2xl" aria-hidden />
        <p className="text-[11px] font-semibold tracking-[0.18em] text-gold-light uppercase">{t('eventEyebrow')}</p>
        <h2 className="mt-1 font-serif text-2xl font-bold">{t('eventTitle')}</h2>
        <p className="mt-2 text-sm text-cream/75">{t('eventBody')}</p>
        <div className="mt-4 flex flex-wrap gap-2.5">
          <Link href="/reserve" className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-cream px-4 text-sm font-bold text-ink transition active:scale-[0.97]">
            <CalendarDays className="h-4 w-4" />
            {t('reserve')}
          </Link>
          <a href="tel:02378886999" className="inline-flex min-h-11 items-center gap-2 rounded-2xl px-4 text-sm font-semibold text-cream ring-1 ring-white/25">
            <Phone className="h-4 w-4" />
            0237 888 6999
          </a>
        </div>
      </section>

      <footer className="pt-2 pb-4 text-center text-xs text-ink-muted">
        <p className="font-serif text-base font-bold text-maroon">Dạ Lan</p>
        <p className="mt-1">{t('footer')}</p>
      </footer>
    </div>
  );
}
