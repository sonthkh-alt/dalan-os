'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

/** Đăng ký service worker và hiển thị thanh báo khi mất mạng. */
export function SwRegister() {
  const t = useTranslations('common');
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  if (!offline) return null;
  return (
    <div className="bg-warn px-4 py-2 text-center text-sm font-medium text-white" role="status">
      {t('offline')}
    </div>
  );
}
