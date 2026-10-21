import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { House, WifiOff } from 'lucide-react';

export default async function OfflinePage() {
  const t = await getTranslations('offline');
  const tc = await getTranslations('common');
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center">
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-cream-dark text-ink-muted">
        <WifiOff className="h-9 w-9" />
      </span>
      <h1 className="mt-2 font-serif text-2xl font-bold">{t('title')}</h1>
      <p className="max-w-sm text-sm text-ink-soft">{t('body')}</p>
      <Link href="/" className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-maroon px-5 font-semibold text-white">
        <House className="h-4 w-4" />
        {tc('goHome')}
      </Link>
    </div>
  );
}
