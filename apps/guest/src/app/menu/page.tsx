'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { RefreshCw } from 'lucide-react';
import type { BranchMenuItemView } from '@dalan/contracts';
import { api } from '@/lib/api';
import { useCart } from '@/lib/cart-store';
import { useGuestMenu, useGuestToken } from '@/lib/guest-data';
import { useHydrated } from '@/lib/hydrated';
import { readLastBranch, saveLastBranch } from '@/lib/nav';
import { findBranch } from '@/lib/branches';
import { isSessionValid, useGuestSession } from '@/lib/session-store';
import { SessionGate } from '@/components/SessionGate';
import { MenuBrowser } from '@/components/MenuBrowser';
import { ItemSheet } from '@/components/ItemSheet';
import { CartBar } from '@/components/Cart';
import { MenuSkeleton } from '@/components/Skeletons';
import { BranchPicker } from '@/components/BranchPicker';
import { Button, EmptyState, useToast } from '@/components/ui';
import { PublicMenu } from './[branchCode]/PublicMenu';

export default function MenuPage() {
  const hydrated = useHydrated();
  const session = useGuestSession();
  if (!hydrated) return <MenuSkeleton />;
  if (isSessionValid(session)) {
    return (
      <SessionGate>
        <SessionMenu />
      </SessionGate>
    );
  }
  return <PublicMenuHub />;
}

/** Chưa vào bàn: chọn cơ sở rồi xem thực đơn tham khảo (nhớ cơ sở gần nhất). */
function PublicMenuHub() {
  const [branch, setBranch] = useState<string | null>(() => {
    const last = readLastBranch();
    return last && findBranch(last) ? last : null;
  });
  const choose = useCallback((code: string | null) => {
    if (code) saveLastBranch(code);
    setBranch(code);
    window.scrollTo({ top: 0 });
  }, []);
  if (!branch) return <BranchPicker onPick={choose} />;
  return <PublicMenu branchCode={branch} onSwitchBranch={choose} />;
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

  if (menu.isPending) return <MenuSkeleton />;
  if (menu.isError || !menu.data) {
    return (
      <EmptyState
        icon={<RefreshCw className="h-8 w-8" />}
        title={tc('errorGeneric')}
        action={
          <Button variant="secondary" onClick={() => menu.refetch()}>
            {tc('retry')}
          </Button>
        }
      />
    );
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
      <CartBar onSelectItem={setSelected} />
    </>
  );
}
