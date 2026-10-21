'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import {
  BellRing,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  House,
  Languages,
  ListChecks,
  MapPin,
  Menu,
  MessageSquareHeart,
  Phone,
  ReceiptText,
  UserRound,
  UtensilsCrossed,
} from 'lucide-react';
import { setLocale } from '@/i18n/locale';
import { useHydrated } from '@/lib/hydrated';
import { isSessionValid, useGuestSession } from '@/lib/session-store';
import { isRootPath, parentPath, useNavHistory } from '@/lib/nav';
import { findBranch } from '@/lib/branches';
import { cn } from '@/lib/format';
import { Sheet } from './ui';

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-maroon to-maroon-deep font-serif text-[15px] font-bold text-gold-light shadow-sm ring-1 ring-gold/30', className)}>
      DL
    </span>
  );
}

/** Ngôn ngữ: chuyển VI/EN qua cookie rồi làm mới trang. */
export function useLocaleToggle() {
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const toggle = () => {
    startTransition(async () => {
      await setLocale(locale === 'vi' ? 'en' : 'vi');
      router.refresh();
    });
  };
  return { locale, pending, toggle };
}

export function Header() {
  const t = useTranslations('common');
  const tn = useTranslations('nav');
  const pathname = usePathname();
  const router = useRouter();
  const hydrated = useHydrated();
  const session = useGuestSession();
  const active = hydrated && isSessionValid(session);
  const depth = useNavHistory((s) => s.depth);
  const { locale, pending, toggle } = useLocaleToggle();
  const [menuOpen, setMenuOpen] = useState(false);
  const root = isRootPath(pathname);

  const goBack = () => {
    // Có lịch sử trong app → quay lại; mở thẳng từ link → về trang cha
    if (depth > 0 && typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push(parentPath(pathname, active));
  };

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line/60 bg-cream/85 pt-[var(--safe-top)] backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-[var(--header-h)] w-full max-w-lg items-center gap-1.5 px-2 md:max-w-2xl">
          {!root ? (
            <button type="button" onClick={goBack} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink transition hover:bg-cream-dark active:scale-95" aria-label={t('back')}>
              <ChevronLeft className="h-6 w-6" />
            </button>
          ) : (
            <span className="w-2" />
          )}
          <Link href="/" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl py-1" aria-label={t('home')}>
            <BrandMark />
            <span className="min-w-0 leading-tight">
              <span className="block font-serif text-[17px] font-bold text-maroon">{t('appName')}</span>
              {active && session.table ? (
                <span className="flex items-center gap-1 truncate text-xs font-medium text-ink-soft">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" aria-hidden />
                  <span className="truncate">
                    {session.table.name} · {session.branch?.name}
                  </span>
                </span>
              ) : (
                <span className="block truncate text-xs text-ink-muted">{t('slogan')}</span>
              )}
            </span>
          </Link>
          <button
            type="button"
            onClick={toggle}
            disabled={pending}
            className="flex h-10 shrink-0 items-center gap-1 rounded-full bg-paper px-3 text-[13px] font-semibold text-ink-soft ring-1 ring-line transition hover:ring-maroon/40 disabled:opacity-60"
            aria-label={t('language')}
          >
            <Languages className="h-4 w-4" />
            {locale === 'vi' ? 'EN' : 'VI'}
          </button>
          <button type="button" onClick={() => setMenuOpen(true)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink transition hover:bg-cream-dark" aria-label={tn('more')} aria-haspopup="dialog">
            <Menu className="h-6 w-6" />
          </button>
        </div>
      </header>
      <AppMenu open={menuOpen} onClose={() => setMenuOpen(false)} active={active} />
    </>
  );
}

/** Menu toàn cục: luôn có đường về trang chủ, tài khoản, đặt bàn; thêm mục của bàn khi đang ngồi. */
function AppMenu({ open, onClose, active }: { open: boolean; onClose: () => void; active: boolean }) {
  const tn = useTranslations('nav');
  const t = useTranslations('common');
  const pathname = usePathname();
  const session = useGuestSession();
  const { locale, pending, toggle } = useLocaleToggle();
  const branchInfo = session.branch ? findBranch(session.branch.code) : undefined;
  const phone = session.branch?.phone ?? branchInfo?.phone ?? null;

  const tableLinks = [
    { href: '/menu', label: tn('menu'), icon: UtensilsCrossed },
    { href: '/orders', label: tn('orders'), icon: ListChecks },
    { href: '/bill', label: tn('bill'), icon: ReceiptText },
    { href: '/call', label: tn('call'), icon: BellRing },
    { href: '/feedback', label: tn('feedback'), icon: MessageSquareHeart },
  ];
  const generalLinks = [
    { href: '/', label: tn('home'), icon: House },
    ...(active ? [] : [{ href: '/menu', label: tn('menu'), icon: UtensilsCrossed }]),
    { href: '/reserve', label: tn('reserve'), icon: CalendarDays },
    { href: '/account', label: tn('account'), icon: UserRound },
  ];

  const renderLink = ({ href, label, icon: Icon }: (typeof generalLinks)[number]) => {
    const current = pathname === href;
    return (
      <li key={href}>
        <Link
          href={href}
          onClick={onClose}
          className={cn('flex min-h-13 items-center gap-3 rounded-2xl px-3 py-3 font-semibold transition', current ? 'bg-maroon-soft text-maroon' : 'text-ink hover:bg-paper')}
          aria-current={current ? 'page' : undefined}
        >
          <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl', current ? 'bg-maroon text-white' : 'bg-paper text-maroon ring-1 ring-line')}>
            <Icon className="h-4.5 w-4.5" />
          </span>
          <span className="flex-1">{label}</span>
          <ChevronRight className="h-4 w-4 text-ink-muted" />
        </Link>
      </li>
    );
  };

  return (
    <Sheet open={open} onClose={onClose} title={tn('more')}>
      {active && session.table ? (
        <div className="brand-pattern mb-4 rounded-3xl p-4 text-cream shadow-lift">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-gold-light uppercase">{tn('atTable')}</p>
          <p className="mt-1 font-serif text-2xl font-bold">{session.table.name}</p>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-cream/85">
            <MapPin className="h-3.5 w-3.5" /> {session.branch?.name} · {session.table.area}
          </p>
          {session.joinPin ? <p className="mt-2 inline-block rounded-full bg-white/12 px-3 py-1 text-xs font-semibold">{tn('tablePin', { pin: session.joinPin })}</p> : null}
        </div>
      ) : null}
      {active ? (
        <>
          <p className="mb-1 px-1 text-xs font-semibold tracking-wider text-ink-muted uppercase">{tn('yourTable')}</p>
          <ul className="mb-4 space-y-1">{tableLinks.map(renderLink)}</ul>
        </>
      ) : null}
      <p className="mb-1 px-1 text-xs font-semibold tracking-wider text-ink-muted uppercase">{tn('explore')}</p>
      <ul className="space-y-1">{generalLinks.map(renderLink)}</ul>
      <div className="mt-4 grid grid-cols-2 gap-2 pb-2">
        <button type="button" onClick={toggle} disabled={pending} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-paper font-semibold text-ink-soft ring-1 ring-line">
          <Languages className="h-4 w-4" />
          {locale === 'vi' ? 'English' : 'Tiếng Việt'}
        </button>
        {phone ? (
          <a href={`tel:${phone}`} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-paper font-semibold text-maroon ring-1 ring-line">
            <Phone className="h-4 w-4" />
            {t('hotline')}
          </a>
        ) : (
          <Link href="/reserve" onClick={onClose} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-maroon font-semibold text-white">
            <CalendarDays className="h-4 w-4" />
            {tn('reserve')}
          </Link>
        )}
      </div>
    </Sheet>
  );
}
