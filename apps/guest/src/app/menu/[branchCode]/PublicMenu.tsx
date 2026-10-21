'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CalendarDays, Navigation, Phone, ScanQrCode, Store } from 'lucide-react';
import type { BranchMenuItemView } from '@dalan/contracts';
import { usePublicMenu } from '@/lib/guest-data';
import { BRANCHES, findBranch, mapsUrl } from '@/lib/branches';
import { saveLastBranch } from '@/lib/nav';
import { cn } from '@/lib/format';
import { MenuBrowser } from '@/components/MenuBrowser';
import { ItemSheet } from '@/components/ItemSheet';
import { MenuSkeleton } from '@/components/Skeletons';
import { BranchMonogram } from '@/components/BranchPicker';
import { Button, EmptyState, LinkButton } from '@/components/ui';

/** Thực đơn tham khảo của một cơ sở (chỉ xem), có chuyển nhanh giữa các cơ sở. */
export function PublicMenu({ branchCode, onSwitchBranch }: { branchCode: string; onSwitchBranch?: (code: string | null) => void }) {
  const t = useTranslations('menu');
  const tc = useTranslations('common');
  const router = useRouter();
  const menu = usePublicMenu(branchCode);
  const info = findBranch(branchCode);
  const [selected, setSelected] = useState<BranchMenuItemView | null>(null);

  useEffect(() => {
    if (info) saveLastBranch(info.code);
  }, [info]);

  const switchTo = (code: string) => {
    if (onSwitchBranch) onSwitchBranch(code);
    else router.replace(`/menu/${code}`);
  };

  const switcher = (
    <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4" role="tablist" aria-label={t('branches')}>
      {BRANCHES.map((b) => {
        const on = b.code === info?.code;
        return (
          <button
            key={b.code}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => !on && switchTo(b.code)}
            className={cn('flex min-h-11 shrink-0 items-center gap-2 rounded-full py-1 pr-4 pl-1 text-sm font-semibold ring-1 transition', on ? 'bg-ink text-white ring-ink' : 'bg-paper text-ink-soft ring-line hover:ring-maroon/40')}
          >
            <BranchMonogram code={b.code} className="h-8 w-8 rounded-full text-sm" />
            {b.name.replace('Dạ Lan ', '')}
          </button>
        );
      })}
    </div>
  );

  if (menu.isPending) {
    return (
      <>
        {switcher}
        <MenuSkeleton />
      </>
    );
  }
  if (menu.isError || !menu.data) {
    return (
      <>
        {switcher}
        <EmptyState
          icon={<Store className="h-8 w-8" />}
          title={info ? tc('errorGeneric') : t('publicNotFound')}
          body={info ? t('publicError', { phone: info.phone }) : undefined}
          action={
            <>
              {info ? (
                <Button onClick={() => menu.refetch()} size="lg">
                  {tc('retry')}
                </Button>
              ) : null}
              {info ? (
                <a href={`tel:${info.phone}`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-paper font-semibold text-maroon ring-1 ring-maroon/25">
                  <Phone className="h-4 w-4" />
                  {tc('call')} {info.phone}
                </a>
              ) : null}
              <LinkButton href="/" variant="ghost">
                {tc('goHome')}
              </LinkButton>
            </>
          }
        />
      </>
    );
  }

  const name = info?.name ?? menu.data.branch.name;
  return (
    <>
      {switcher}
      <h1 className="sr-only">
        {t('title')} · {name}
      </h1>
      <MenuBrowser
        view={menu.data}
        readOnly
        onSelect={(item) => setSelected(item)}
        intro={
          <div className="mt-2 mb-1 overflow-hidden rounded-3xl bg-paper shadow-card ring-1 ring-line-soft">
            <div className="flex items-center gap-3 p-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-maroon-soft text-maroon">
                <ScanQrCode className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-ink">{t('readOnlyTitle')}</p>
                <p className="text-xs leading-snug text-ink-soft">{t('readOnly')}</p>
              </div>
            </div>
            {info ? (
              <div className="grid grid-cols-3 border-t border-line-soft text-[13px] font-semibold">
                <a href={`tel:${info.phone}`} className="flex min-h-11 items-center justify-center gap-1.5 text-maroon hover:bg-cream">
                  <Phone className="h-4 w-4" />
                  {tc('call')}
                </a>
                <a href={mapsUrl(info.name, info.address)} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-center gap-1.5 border-x border-line-soft text-maroon hover:bg-cream">
                  <Navigation className="h-4 w-4" />
                  {tc('directions')}
                </a>
                <LinkButton href="/reserve" variant="ghost" size="sm" className="rounded-none text-maroon">
                  <CalendarDays className="h-4 w-4" />
                  {tc('reserve')}
                </LinkButton>
              </div>
            ) : null}
          </div>
        }
      />
      <ItemSheet item={selected} open={selected !== null} onClose={() => setSelected(null)} readOnly />
    </>
  );
}
