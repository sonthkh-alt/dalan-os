'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Bell, ChefHat, LayoutGrid, LogOut, Wallet, WifiOff, Wifi, CloudUpload, CalendarClock, Users, PartyPopper, Package, MoreHorizontal } from 'lucide-react';
import { useAuth } from '@/lib/auth-store';
import { useQueue } from '@/lib/offline-queue';
import { useRealtime } from '@/lib/socket';
import { useRequests } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { Loading } from '@/components/ui/primitives';
import { Dialog } from '@/components/ui/dialog';
import { ADMIN_NAV_ITEM, canSeeAdmin } from '@/components/admin/admin-nav';

const NAV = [
  { href: '/', label: 'Sơ đồ bàn', icon: LayoutGrid },
  { href: '/kds', label: 'Bếp', icon: ChefHat },
  { href: '/requests', label: 'Yêu cầu', icon: Bell },
  { href: '/shift', label: 'Ca', icon: Wallet },
  { href: '/reservations', label: 'Đặt bàn', icon: CalendarClock },
  { href: '/customers', label: 'Khách hàng', icon: Users },
  { href: '/events', label: 'Tiệc', icon: PartyPopper },
  { href: '/inventory', label: 'Kho', icon: Package },
];

/** Số mục hiện trực tiếp trên thanh điều hướng dưới của điện thoại. */
const PHONE_PRIMARY = 4;

/** Khung ứng dụng: bảo vệ đăng nhập, thanh trạng thái, điều hướng dưới (điện thoại) / bên (tablet). */
export function AppShell({ children, fullscreen }: { children: ReactNode; fullscreen?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const { accessToken, hydrated, me, activeBranchId, setActiveBranch, logout } = useAuth();
  const { online, pending, replaying } = useQueue();
  const connected = useRealtime((s) => s.connected);
  const requests = useRequests();
  const openRequests = requests.data?.length ?? 0;
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (hydrated && !accessToken) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [hydrated, accessToken, router, pathname]);

  if (!hydrated) return <Loading />;
  if (!accessToken || !me) return <Loading label="Đang chuyển tới đăng nhập..." />;

  const branch = me.branches.find((b) => b.id === activeBranchId);
  // Mục "Quản trị" chỉ hiện khi có ít nhất một quyền quản trị
  const nav = canSeeAdmin(me.permissions) ? [...NAV, ADMIN_NAV_ITEM] : NAV;
  const isActive = (href: string) => (href === '/' ? pathname === '/' || pathname.startsWith('/sessions') : pathname.startsWith(href));
  // Điện thoại: tối đa PHONE_PRIMARY mục chính, phần còn lại vào sheet "Thêm"
  const split = nav.length > PHONE_PRIMARY;
  const primary = split ? nav.slice(0, PHONE_PRIMARY) : nav;
  const overflow = split ? nav.slice(PHONE_PRIMARY) : [];
  const activeOverflow = overflow.find((n) => isActive(n.href));
  const overflowHasRequests = openRequests > 0 && overflow.some((n) => n.href === '/requests');

  const statusBar = (
    <div className="flex items-center gap-2 border-b border-ink-100 bg-white px-3 py-2 text-sm">
      <span className="truncate font-bold text-brand-800">{branch?.name ?? 'Chưa chọn cơ sở'}</span>
      {me.branches.length > 1 && (
        <select value={activeBranchId ?? ''} onChange={(e) => setActiveBranch(e.target.value)} className="min-h-[36px] rounded-lg border border-ink-300 bg-white px-2 text-sm" aria-label="Chọn cơ sở">
          {me.branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.code}
            </option>
          ))}
        </select>
      )}
      <span className="ml-auto flex items-center gap-2">
        {pending > 0 && (
          <span className={cn('flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800', replaying && 'animate-pulse')} title="Lệnh đang chờ gửi">
            <CloudUpload className="h-4 w-4" /> {pending}
          </span>
        )}
        <span className={cn('flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold', online && connected ? 'bg-emerald-100 text-emerald-800' : online ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800')} title={online ? (connected ? 'Đã kết nối realtime' : 'Có mạng, đang kết nối realtime') : 'Mất mạng'}>
          {online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
          <span className="hidden sm:inline">{online ? (connected ? 'Trực tuyến' : 'Đang kết nối') : 'Mất mạng'}</span>
        </span>
        <span className="hidden max-w-[140px] truncate text-ink-700 md:inline">{me.fullName}</span>
        <button type="button" onClick={() => { logout(); router.replace('/login'); }} className="flex h-9 w-9 items-center justify-center rounded-full text-ink-500 hover:bg-ink-100" aria-label="Đăng xuất">
          <LogOut className="h-5 w-5" />
        </button>
      </span>
    </div>
  );

  if (fullscreen) {
    return (
      <div className="flex h-dvh flex-col">
        {statusBar}
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col md:flex-row">
      <aside className="hidden w-20 flex-col items-center gap-1 border-r border-ink-100 bg-white py-3 md:flex lg:w-24">
        <Link href="/" className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-700 text-lg font-black text-white">
          DL
        </Link>
        {nav.map((n) => {
          const active = isActive(n.href);
          return (
            <Link key={n.href} href={n.href} className={cn('relative flex w-16 flex-col items-center gap-1 rounded-xl py-2 text-xs font-semibold', active ? 'bg-brand-50 text-brand-800' : 'text-ink-500 hover:bg-ink-100')}>
              <n.icon className="h-6 w-6" />
              {n.label}
              {n.href === '/requests' && openRequests > 0 && <span className="absolute top-1 right-2 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] text-white">{openRequests}</span>}
            </Link>
          );
        })}
      </aside>
      <div className="flex min-h-0 flex-1 flex-col">
        {statusBar}
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
        <nav className="safe-bottom flex border-t border-ink-100 bg-white md:hidden">
          {primary.map((n) => {
            const active = isActive(n.href);
            return (
              <Link key={n.href} href={n.href} className={cn('relative flex min-h-[56px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-semibold', active ? 'text-brand-800' : 'text-ink-500')}>
                <n.icon className="h-6 w-6" />
                <span className="max-w-full truncate px-0.5">{n.label}</span>
                {n.href === '/requests' && openRequests > 0 && <span className="absolute top-1 right-1/4 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] text-white">{openRequests}</span>}
              </Link>
            );
          })}
          {overflow.length > 0 && (
            <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog" aria-expanded={moreOpen} className={cn('relative flex min-h-[56px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-semibold', activeOverflow ? 'text-brand-800' : 'text-ink-500')}>
              <MoreHorizontal className="h-6 w-6" />
              <span className="max-w-full truncate px-0.5">Thêm</span>
              {overflowHasRequests && <span className="absolute top-1 right-1/4 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] text-white">{openRequests}</span>}
            </button>
          )}
        </nav>
      </div>
      <Dialog open={moreOpen} onClose={() => setMoreOpen(false)} title="Chức năng khác" mode="sheet" size="sm">
        <div className="grid grid-cols-3 gap-2 pb-2">
          {overflow.map((n) => {
            const active = isActive(n.href);
            return (
              <Link key={n.href} href={n.href} onClick={() => setMoreOpen(false)} className={cn('relative flex min-h-[80px] flex-col items-center justify-center gap-1 rounded-xl border text-sm font-semibold', active ? 'border-brand-700 bg-brand-50 text-brand-800' : 'border-ink-100 text-ink-700 hover:bg-ink-100')}>
                <n.icon className="h-7 w-7" />
                {n.label}
                {n.href === '/requests' && openRequests > 0 && <span className="absolute top-1 right-2 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] text-white">{openRequests}</span>}
              </Link>
            );
          })}
        </div>
      </Dialog>
    </div>
  );
}
