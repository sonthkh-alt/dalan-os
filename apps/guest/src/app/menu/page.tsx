'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { BranchMenuItemView } from '@dalan/contracts';
import { api } from '@/lib/api';
import { useCart } from '@/lib/cart-store';
import { useGuestMenu, useGuestToken } from '@/lib/guest-data';
import { useGuestSession } from '@/lib/session-store';
import { SessionGate } from '@/components/SessionGate';
import { MenuBrowser } from '@/components/MenuBrowser';
import { ItemSheet } from '@/components/ItemSheet';
import { CartBar } from '@/components/Cart';
import { Button, EmptyState, Spinner, useToast } from '@/components/ui';

export default function MenuPage() {
  return (
    <SessionGate>
      <SessionMenu />
    </SessionGate>
  );
}

function SessionMenu() {
  const t = useTranslations('menu');
  const tc = useTranslations('common');
  const toast = useToast((s) => s.show);
  const token = useGuestToken();
  const sessionId = useGuestSession((s) => s.sessionId);
  const bindCart = useCart((s) => s.bindSession);
  const menu = useGuestMenu();
  const [selected, setSelected] = useState<BranchMenuItemView | null>(null);

  useEffect(() => {
    bindCart(sessionId);
  }, [sessionId, bindCart]);

  if (menu.isPending) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }
  if (menu.isError || !menu.data) {
    return <EmptyState title={tc('errorGeneric')} action={<Button variant="secondary" onClick={() => menu.refetch()}>{tc('retry')}</Button>} />;
  }

  const askStaff = async (item: BranchMenuItemView) => {
    await api('/guest/service-requests', { guestToken: token, body: { kind: 'OTHER', note: `Hỏi giá / tư vấn món: ${item.name}` } });
  };

  return (
    <>
      <h1 className="sr-only">{t('title')}</h1>
      <MenuBrowser
        view={menu.data}
        onSelect={(item, open) => {
          if (!open) {
            toast(t('closedNow'), 'warn');
            return;
          }
          setSelected(item);
        }}
      />
      <ItemSheet item={selected} open={selected !== null} onClose={() => setSelected(null)} onAskStaff={askStaff} />
      <CartBar />
    </>
  );
}
