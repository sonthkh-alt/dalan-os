'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { House, RefreshCw, TriangleAlert } from 'lucide-react';
import { Button, LinkButton } from '@/components/ui';

/** Lỗi bất ngờ khi hiển thị trang: cho thử lại hoặc về trang chủ. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('errors');
  const tc = useTranslations('common');
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="animate-rise py-12 text-center" role="alert">
      <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-maroon-soft text-maroon">
        <TriangleAlert className="h-9 w-9" />
      </span>
      <h1 className="mt-5 font-serif text-2xl font-bold text-ink">{t('errorTitle')}</h1>
      <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-ink-soft">{t('errorBody')}</p>
      {error.digest ? <p className="mt-2 font-mono text-[11px] text-ink-muted">#{error.digest}</p> : null}
      <div className="mx-auto mt-7 grid grid-cols-1 max-w-xs gap-2.5">
        <Button size="lg" onClick={reset}>
          <RefreshCw className="h-5 w-5" />
          {tc('retry')}
        </Button>
        <LinkButton href="/" variant="secondary">
          <House className="h-4 w-4" />
          {tc('goHome')}
        </LinkButton>
      </div>
    </div>
  );
}
