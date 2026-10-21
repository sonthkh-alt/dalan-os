'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import { usePublicMenu } from '@/lib/guest-data';
import { findBranch } from '@/lib/branches';
import { MenuBrowser } from '@/components/MenuBrowser';
import { Button, EmptyState, Spinner } from '@/components/ui';

export function PublicMenu({ branchCode }: { branchCode: string }) {
  const t = useTranslations('menu');
  const tc = useTranslations('common');
  const menu = usePublicMenu(branchCode);
  const info = findBranch(branchCode);
  if (menu.isPending) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }
  if (menu.isError || !menu.data) {
    return (
      <EmptyState
        title={t('publicNotFound')}
        action={
          <Link href="/">
            <Button variant="secondary">{tc('back')}</Button>
          </Link>
        }
      />
    );
  }
  return (
    <>
      <div className="mb-2 flex items-center gap-2">
        <Link href="/" className="rounded-full p-2 text-ink-soft hover:bg-cream-dark" aria-label={tc('back')}>
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold">{info?.name ?? menu.data.branch.name}</h1>
      </div>
      <p className="mb-2 text-xs text-ink-muted">{t('readOnly')}</p>
      <MenuBrowser view={menu.data} readOnly />
    </>
  );
}
