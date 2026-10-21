import { getTranslations } from 'next-intl/server';
import { WifiOff } from 'lucide-react';

export default async function OfflinePage() {
  const t = await getTranslations('offline');
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center">
      <WifiOff className="h-12 w-12 text-ink-muted" />
      <h1 className="text-xl font-bold">{t('title')}</h1>
      <p className="max-w-sm text-sm text-ink-soft">{t('body')}</p>
    </div>
  );
}
