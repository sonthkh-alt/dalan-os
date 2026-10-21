'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { Languages, MapPin } from 'lucide-react';
import { setLocale } from '@/i18n/locale';
import { useHydrated } from '@/lib/hydrated';
import { isSessionValid, useGuestSession } from '@/lib/session-store';

export function Header() {
  const t = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const hydrated = useHydrated();
  const session = useGuestSession();
  const active = hydrated && isSessionValid(session);

  const toggle = () => {
    startTransition(async () => {
      await setLocale(locale === 'vi' ? 'en' : 'vi');
      router.refresh();
    });
  };

  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-cream/95 backdrop-blur">
      <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-4 py-2.5">
        <Link href={active ? '/menu' : '/'} className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-maroon font-serif text-sm font-bold text-cream">DL</span>
          <span className="leading-tight">
            <span className="block text-base font-bold text-maroon">{t('appName')}</span>
            {active && session.table ? (
              <span className="flex items-center gap-1 text-xs text-ink-soft">
                <MapPin className="h-3 w-3" />
                {session.branch?.name} · {session.table.name}
              </span>
            ) : (
              <span className="block text-xs text-ink-muted">{t('slogan')}</span>
            )}
          </span>
        </Link>
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          className="flex min-h-10 items-center gap-1.5 rounded-full border border-line bg-paper px-3 text-sm font-medium text-ink-soft"
          aria-label={t('language')}
        >
          <Languages className="h-4 w-4" />
          {locale === 'vi' ? 'EN' : 'VI'}
        </button>
      </div>
    </header>
  );
}
