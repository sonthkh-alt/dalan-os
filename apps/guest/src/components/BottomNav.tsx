'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BellRing, CalendarDays, House, ListChecks, ReceiptText, UserRound, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import { useHydrated } from '@/lib/hydrated';
import { isSessionValid, useGuestSession } from '@/lib/session-store';
import { useGuestSessionView } from '@/lib/guest-data';
import { hideBottomNav } from '@/lib/nav';
import { cn } from '@/lib/format';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

/** Thanh điều hướng dưới luôn hiện: chế độ khám phá (chưa vào bàn) hoặc chế độ tại bàn. */
export function BottomNav() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const hydrated = useHydrated();
  const session = useGuestSession();
  const active = hydrated && isSessionValid(session);
  const { data } = useGuestSessionView(active);
  if (hideBottomNav(pathname)) return null;

  const openRequests = data?.requests.filter((r) => r.status !== 'DONE').length ?? 0;
  const activeLines = data?.orders.flatMap((o) => (o.status === 'CANCELLED' ? [] : o.lines)).filter((l) => ['PENDING_CONFIRM', 'SENT', 'HOLD', 'PREPARING', 'READY'].includes(l.status)).length ?? 0;
  const items: NavItem[] = active
    ? [
        { href: '/menu', label: t('menu'), icon: UtensilsCrossed },
        { href: '/orders', label: t('orders'), icon: ListChecks, badge: activeLines },
        { href: '/bill', label: t('bill'), icon: ReceiptText },
        { href: '/call', label: t('call'), icon: BellRing, badge: openRequests },
      ]
    : [
        { href: '/', label: t('home'), icon: House },
        { href: '/menu', label: t('menu'), icon: UtensilsCrossed },
        { href: '/reserve', label: t('reserve'), icon: CalendarDays },
        { href: '/account', label: t('account'), icon: UserRound },
      ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-paper/90 pb-[var(--safe-bottom)] backdrop-blur-xl backdrop-saturate-150" aria-label={t('label')}>
      <div className="mx-auto grid h-[var(--nav-h)] w-full max-w-lg grid-cols-4 px-1 md:max-w-2xl">
        {items.map(({ href, label, icon: Icon, badge }) => {
          const current = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn('group relative flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition', current ? 'text-maroon' : 'text-ink-muted hover:text-ink-soft')}
              aria-current={current ? 'page' : undefined}
            >
              <span className={cn('relative flex h-8 w-14 items-center justify-center rounded-full transition-all duration-200', current ? 'bg-maroon-soft' : 'group-active:bg-cream-dark')}>
                <Icon className={cn('h-[22px] w-[22px] transition-transform', current && 'scale-105')} strokeWidth={current ? 2.4 : 2} />
                {badge ? (
                  <span key={badge} className="tabular absolute -top-1 right-1.5 flex h-4.5 min-w-4.5 animate-pop items-center justify-center rounded-full bg-maroon px-1 text-[10px] font-bold text-white ring-2 ring-paper">
                    {badge > 9 ? '9+' : badge}
                  </span>
                ) : null}
              </span>
              <span className="max-w-full truncate px-0.5">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
