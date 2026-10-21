'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { QrCode } from 'lucide-react';
import type { ReactNode } from 'react';
import { useHydrated } from '@/lib/hydrated';
import { isSessionValid, useGuestSession } from '@/lib/session-store';
import { useGuestRealtime } from '@/lib/realtime';
import { Button, EmptyState, Spinner } from './ui';

/** Chỉ hiển thị nội dung khi khách đã vào bàn; đồng thời giữ kết nối realtime. */
export function SessionGate({ children }: { children: ReactNode }) {
  const t = useTranslations('common');
  const hydrated = useHydrated();
  const session = useGuestSession();
  const valid = hydrated && isSessionValid(session);
  useGuestRealtime(valid ? session.guestToken : null);

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  if (!valid) {
    return (
      <EmptyState
        icon={<QrCode className="h-12 w-12" />}
        title={session.guestToken ? t('sessionExpired') : t('noSession')}
        action={
          <Link href="/">
            <Button variant="secondary">{t('viewPublicMenu')}</Button>
          </Link>
        }
      />
    );
  }
  return <>{children}</>;
}
