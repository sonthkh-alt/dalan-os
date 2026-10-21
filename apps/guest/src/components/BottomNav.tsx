'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BellRing, ReceiptText, UtensilsCrossed, ListChecks } from 'lucide-react';
import { useHydrated } from '@/lib/hydrated';
import { isSessionValid, useGuestSession } from '@/lib/session-store';
import { useGuestSessionView } from '@/lib/guest-data';
import { cn } from '@/lib/format';

export function BottomNav() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const hydrated = useHydrated();
  const session = useGuestSession();
  const active = hydrated && isSessionValid(session);
  const { data } = useGuestSessionView(active);
  if (!active) return null;
  const openRequests = data?.requests.filter((r) => r.status !== 'DONE').length ?? 0;
  const items = [
    { href: '/menu', label: t('menu'), icon: UtensilsCrossed },
    { href: '/orders', label: t('orders'), icon: ListChecks },
    { href: '/bill', label: t('bill'), icon: ReceiptText },
    { href: '/call', label: t('call'), icon: BellRing, badge: openRequests },
  ];
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 backdrop-blur" aria-label="Điều hướng">
      <div className="mx-auto grid max-w-lg grid-cols-4">
        {items.map(({ href, label, icon: Icon, badge }) => {
          const current = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link key={href} href={href} className={cn('relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium', current ? 'text-maroon' : 'text-ink-muted')} aria-current={current ? 'page' : undefined}>
              <Icon className="h-5 w-5" />
              {label}
              {badge ? <span className="absolute top-1.5 right-[22%] rounded-full bg-maroon px-1.5 text-[10px] font-bold text-white">{badge}</span> : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
