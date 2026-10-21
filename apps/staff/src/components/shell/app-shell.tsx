'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CloudUpload, LayoutDashboard, LogOut, MapPin, Menu, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Search, Wifi, WifiOff } from 'lucide-react';
import { useAuth } from '@/lib/auth-store';
import { useQueue } from '@/lib/offline-queue';
import { useRealtime } from '@/lib/socket';
import { useRequests } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { Kbd, Loading } from '@/components/ui/primitives';
import { Dialog } from '@/components/ui/dialog';
import { ADMIN_SECTIONS, canSeeSection } from '@/components/admin/admin-nav';
import { CommandPalette, type Command } from './command-palette';
import { isNavActive, navGroupsFor, type NavGroup, type NavItem } from './nav';
import { useShell } from './shell-store';
import { BranchSwitcher, UserMenu } from './user-menu';

/** Số mục hiện trực tiếp trên thanh điều hướng dưới của điện thoại. */
const PHONE_PRIMARY = 4;

/** Khung ứng dụng: bảo vệ đăng nhập, thanh trên (cơ sở, giờ, kết nối, tài khoản), thanh bên (tablet/máy tính), thanh dưới (điện thoại), bảng lệnh Ctrl+K. */
export function AppShell({ children, fullscreen }: { children: ReactNode; fullscreen?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const { accessToken, hydrated, me, activeBranchId, setActiveBranch, logout } = useAuth();
  const requests = useRequests();
  const openRequests = requests.data?.length ?? 0;
  const [moreOpen, setMoreOpen] = useState(false);
  const paletteOpen = useShell((s) => s.paletteOpen);
  const setPaletteOpen = useShell((s) => s.setPaletteOpen);

  useEffect(() => {
    if (hydrated && !accessToken) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [hydrated, accessToken, router, pathname]);

  // Ctrl/⌘ + K mở bảng lệnh ở mọi màn hình
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(!useShell.getState().paletteOpen);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [setPaletteOpen]);

  // Đóng các lớp phủ khi chuyển trang
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  const perms = me?.permissions;
  const groups = useMemo(() => navGroupsFor(perms), [perms]);
  const doLogout = () => {
    logout();
    router.replace('/login');
  };

  const commands = useMemo<Command[]>(() => {
    if (!me) return [];
    const list: Command[] = groups.flatMap((g) => g.items.map((n) => ({ id: `nav:${n.href}`, label: n.label, group: g.label, icon: n.icon, hint: n.hint, keywords: n.keywords, href: n.href, active: isNavActive(pathname, n.href) })));
    const sections = ADMIN_SECTIONS.filter((s) => canSeeSection(perms, s));
    if (sections.length) {
      list.push({ id: 'admin:home', label: 'Tổng quan hôm nay', group: 'Quản trị', icon: LayoutDashboard, hint: 'Doanh thu, bàn đang phục vụ, khách, đặt bàn', keywords: 'dashboard kpi hom nay', href: '/admin', active: pathname === '/admin' });
      for (const s of sections) list.push({ id: `admin:${s.id}`, label: `Quản trị · ${s.label}`, group: 'Quản trị', icon: s.icon, hint: s.description, href: s.href, active: pathname.startsWith(s.href) });
    }
    if (me.branches.length > 1)
      for (const b of me.branches)
        list.push({ id: `branch:${b.id}`, label: `Chuyển sang ${b.name}`, group: 'Cơ sở', icon: MapPin, hint: b.id === activeBranchId ? 'Đang làm việc tại cơ sở này' : `Mã ${b.code}`, keywords: `co so chi nhanh ${b.code}`, run: () => setActiveBranch(b.id), active: b.id === activeBranchId });
    list.push({ id: 'logout', label: 'Đăng xuất', group: 'Tài khoản', icon: LogOut, hint: me.fullName, keywords: 'thoat dang xuat logout', run: doLogout });
    return list;
  }, [me, groups, perms, pathname, activeBranchId, setActiveBranch]);

  if (!hydrated) return <Loading />;
  if (!accessToken || !me) return <Loading label="Đang chuyển tới đăng nhập..." />;

  const branch = me.branches.find((b) => b.id === activeBranchId);
  const flat = groups.flatMap((g) => g.items);
  const isActive = (href: string) => isNavActive(pathname, href);
  // Điện thoại: tối đa PHONE_PRIMARY mục chính, phần còn lại vào sheet "Thêm"
  const split = flat.length > PHONE_PRIMARY;
  const primary = split ? flat.slice(0, PHONE_PRIMARY) : flat;
  const overflow = split ? flat.slice(PHONE_PRIMARY) : [];
  const overflowGroups = groups.map((g) => ({ ...g, items: g.items.filter((n) => overflow.includes(n)) })).filter((g) => g.items.length > 0);
  const activeOverflow = overflow.some((n) => isActive(n.href));
  const overflowHasRequests = openRequests > 0 && overflow.some((n) => n.href === '/requests');

  const topBar = (
    <TopBar
      fullscreen={fullscreen}
      onMenu={() => setMoreOpen(true)}
      onSearch={() => setPaletteOpen(true)}
      branchSwitcher={<BranchSwitcher branches={me.branches} activeId={activeBranchId} onChange={setActiveBranch} />}
      userMenu={<UserMenu me={me} branchName={branch?.name} onLogout={doLogout} onSearch={() => setPaletteOpen(true)} />}
    />
  );

  const overlays = (
    <>
      <Dialog open={moreOpen} onClose={() => setMoreOpen(false)} title={fullscreen ? 'Điều hướng' : 'Chức năng khác'} mode="sheet" size="sm">
        <NavSheet groups={fullscreen ? groups : overflowGroups} isActive={isActive} openRequests={openRequests} onNavigate={() => setMoreOpen(false)} />
      </Dialog>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
    </>
  );

  if (fullscreen) {
    return (
      <div className="flex h-dvh flex-col bg-canvas">
        <SkipLink />
        {topBar}
        <main id="noi-dung" className="min-h-0 flex-1">
          {children}
        </main>
        {overlays}
      </div>
    );
  }

  return (
    <div className="flex h-dvh bg-canvas">
      <SkipLink />
      <Sidebar groups={groups} isActive={isActive} openRequests={openRequests} onSearch={() => setPaletteOpen(true)} />
      <div className="flex min-w-0 flex-1 flex-col">
        {topBar}
        <main id="noi-dung" className="min-h-0 flex-1 overflow-y-auto">
          {children}
        </main>
        <nav className="safe-bottom flex shrink-0 border-t border-ink-100 bg-white/95 px-1 md:hidden" aria-label="Điều hướng chính">
          {primary.map((n) => (
            <BottomItem key={n.href} item={n} active={isActive(n.href)} badge={n.href === '/requests' ? openRequests : 0} />
          ))}
          {overflow.length > 0 && (
            <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog" aria-expanded={moreOpen} className={cn('group relative flex min-h-[64px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', activeOverflow ? 'text-brand-800' : 'text-ink-500')}>
              <span className={cn('flex h-8 w-14 items-center justify-center rounded-full transition-colors', activeOverflow ? 'bg-brand-100' : 'group-active:bg-ink-100')}>
                <MoreHorizontal className="h-6 w-6" />
              </span>
              <span className="max-w-full truncate px-0.5">Thêm</span>
              {overflowHasRequests && <CountBadge n={openRequests} className="absolute top-1.5 right-[calc(50%-26px)]" />}
            </button>
          )}
        </nav>
      </div>
      {overlays}
    </div>
  );
}

function SkipLink() {
  return (
    <a href="#noi-dung" className="sr-only z-[70] rounded-xl bg-brand-700 px-4 py-2 font-semibold text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
      Bỏ qua tới nội dung
    </a>
  );
}

function CountBadge({ n, className }: { n: number; className?: string }) {
  if (n <= 0) return null;
  return <span className={cn('flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] leading-none font-bold text-white tabular-nums ring-2 ring-white', className)}>{n > 99 ? '99+' : n}</span>;
}

function LogoMark({ className }: { className?: string }) {
  return (
    <span className={cn('flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 font-extrabold tracking-tight text-gold-100 shadow-brand', className)} aria-hidden>
      DL
    </span>
  );
}

// ───────── Thanh bên (tablet/máy tính) ─────────

function Sidebar({ groups, isActive, openRequests, onSearch }: { groups: NavGroup[]; isActive: (href: string) => boolean; openRequests: number; onSearch: () => void }) {
  const collapsed = useShell((s) => s.collapsed);
  const toggle = useShell((s) => s.toggleCollapsed);
  // md: luôn là dải biểu tượng; lg trở lên: mở rộng trừ khi người dùng thu gọn
  const wide = !collapsed;
  return (
    <aside className={cn('hidden shrink-0 flex-col border-r border-ink-100 bg-white transition-[width] duration-200 md:flex', wide ? 'w-[84px] lg:w-64' : 'w-[84px]')} aria-label="Điều hướng chính">
      <Link href="/" className={cn('flex h-16 shrink-0 items-center gap-3 border-b border-ink-100 px-4', 'justify-center', wide && 'lg:justify-start lg:px-5')} title="DaLan OS · Sơ đồ bàn">
        <LogoMark className="h-10 w-10 text-base" />
        <span className={cn('hidden min-w-0 leading-tight', wide && 'lg:block')}>
          <span className="block text-[15px] font-extrabold tracking-tight text-ink-900">DaLan OS</span>
          <span className="block truncate text-xs text-ink-500">Nhà hàng Dạ Lan</span>
        </span>
      </Link>

      <div className="px-3 pt-3">
        <button type="button" onClick={onSearch} className={cn('flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-ink-900/[0.04] px-3 text-sm text-ink-500 ring-1 ring-ink-900/[0.06] ring-inset transition hover:bg-ink-900/[0.07] hover:text-ink-900', wide && 'lg:justify-start')} title="Tìm nhanh (Ctrl K)" aria-label="Tìm nhanh">
          <Search className="h-5 w-5 shrink-0" />
          <span className={cn('hidden flex-1 text-left', wide && 'lg:inline')}>Tìm nhanh...</span>
          <Kbd className={cn('hidden', wide && 'lg:inline-flex')}>Ctrl K</Kbd>
        </button>
      </div>

      <nav className="scrollbar-thin flex-1 overflow-y-auto px-3 py-2">
        {groups.map((g, gi) => (
          <div key={g.id} className={cn(gi > 0 && 'mt-2')}>
            <div className={cn('hidden px-3 pt-3 pb-1.5 text-[11px] font-semibold tracking-wider text-ink-500 uppercase', wide && 'lg:block')}>{g.label}</div>
            {gi > 0 && <div className={cn('mx-3 my-2 h-px bg-ink-100', wide && 'lg:hidden')} aria-hidden />}
            <ul className="space-y-1">
              {g.items.map((n) => (
                <li key={n.href}>
                  <SideItem item={n} active={isActive(n.href)} wide={wide} badge={n.href === '/requests' ? openRequests : 0} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="hidden border-t border-ink-100 p-3 lg:block">
        <button type="button" onClick={toggle} className={cn('flex min-h-[44px] w-full items-center justify-center gap-3 rounded-xl px-3 text-sm font-medium text-ink-500 transition hover:bg-ink-900/[0.05] hover:text-ink-900', wide && 'justify-start')} aria-label={wide ? 'Thu gọn thanh bên' : 'Mở rộng thanh bên'} title={wide ? 'Thu gọn thanh bên' : 'Mở rộng thanh bên'}>
          {wide ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeftOpen className="h-5 w-5" />}
          {wide && <span>Thu gọn</span>}
        </button>
      </div>
    </aside>
  );
}

function SideItem({ item, active, wide, badge }: { item: NavItem; active: boolean; wide: boolean; badge: number }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      title={item.label}
      className={cn(
        'group relative flex flex-col items-center justify-center gap-1 rounded-xl py-2 text-[11px] font-semibold transition-colors',
        wide && 'lg:min-h-[44px] lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:py-0 lg:text-[15px] lg:font-medium',
        active ? 'bg-brand-50 text-brand-800' : 'text-ink-500 hover:bg-ink-900/[0.04] hover:text-ink-900',
      )}
    >
      {active && <span className="absolute top-2 bottom-2 -left-3 w-1 rounded-r-full bg-brand-700" aria-hidden />}
      <item.icon className={cn('h-6 w-6 shrink-0', wide && 'lg:h-5 lg:w-5', active ? 'text-brand-700' : 'text-ink-500 group-hover:text-ink-700')} />
      <span className={cn('max-w-full truncate px-1', wide && 'lg:flex-1 lg:px-0', active && wide && 'lg:font-semibold')}>{item.label}</span>
      {badge > 0 && <CountBadge n={badge} className={cn('absolute top-1 right-2', wide && 'lg:static lg:ring-0')} />}
    </Link>
  );
}

// ───────── Thanh trên ─────────

function TopBar({ fullscreen, onMenu, onSearch, branchSwitcher, userMenu }: { fullscreen?: boolean; onMenu: () => void; onSearch: () => void; branchSwitcher: ReactNode; userMenu: ReactNode }) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-1.5 border-b border-ink-100 bg-white px-2 sm:gap-2 md:px-4">
      {fullscreen ? (
        <>
          <button type="button" onClick={onMenu} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-700 transition hover:bg-ink-900/[0.05]" aria-label="Mở điều hướng">
            <Menu className="h-6 w-6" />
          </button>
          <Link href="/" className="hidden sm:block" aria-label="Về sơ đồ bàn" title="Về sơ đồ bàn">
            <LogoMark className="h-9 w-9 text-sm" />
          </Link>
        </>
      ) : (
        <Link href="/" className="md:hidden" aria-label="Về sơ đồ bàn">
          <LogoMark className="h-9 w-9 text-sm" />
        </Link>
      )}
      <div className="min-w-0 shrink">{branchSwitcher}</div>
      <div className="flex-1" />
      {/* Thanh bên (md–lg) đã có nút tìm; màn toàn khung (bếp) không có thanh bên nên luôn hiện */}
      <button type="button" onClick={onSearch} className={cn('hidden min-h-[40px] items-center gap-2 rounded-xl bg-ink-900/[0.04] px-3 text-sm text-ink-500 ring-1 ring-ink-900/[0.06] ring-inset transition hover:bg-ink-900/[0.07] hover:text-ink-900 sm:flex', !fullscreen && 'md:hidden xl:flex')} aria-label="Tìm nhanh">
        <Search className="h-4 w-4" />
        <span className="hidden lg:inline">Tìm nhanh</span>
        <Kbd>Ctrl K</Kbd>
      </button>
      <button type="button" onClick={onSearch} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-700 transition hover:bg-ink-900/[0.05] sm:hidden" aria-label="Tìm nhanh">
        <Search className="h-5 w-5" />
      </button>
      <LiveClock />
      <StatusPills />
      {userMenu}
    </header>
  );
}

function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(t);
  }, []);
  const time = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
  const day = now.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
  return (
    <div className="hidden shrink-0 px-2 text-right leading-tight lg:block" aria-label={`Bây giờ là ${time}, ${day}`}>
      <div className="text-[15px] font-bold text-ink-900 tabular-nums">{time}</div>
      <div className="text-[11px] font-medium text-ink-500 capitalize">{day}</div>
    </div>
  );
}

function StatusPills() {
  const { online, pending, replaying } = useQueue();
  const connected = useRealtime((s) => s.connected);
  const state = online && connected ? 'ok' : online ? 'connecting' : 'offline';
  const label = state === 'ok' ? 'Trực tuyến' : state === 'connecting' ? 'Đang kết nối' : 'Mất mạng';
  const title = state === 'ok' ? 'Đã kết nối realtime' : state === 'connecting' ? 'Có mạng, đang kết nối realtime' : 'Mất mạng — thao tác được lưu và gửi lại khi có mạng';
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {pending > 0 && (
        <span className={cn('flex h-8 items-center gap-1 rounded-full bg-amber-50 px-2.5 text-sm font-semibold text-amber-800 ring-1 ring-amber-200 ring-inset', replaying && 'animate-pulse')} title={`${pending} lệnh đang chờ gửi`}>
          <CloudUpload className="h-4 w-4" /> <span className="tabular-nums">{pending}</span>
          <span className="sr-only">lệnh đang chờ gửi</span>
        </span>
      )}
      <span
        className={cn(
          'flex h-8 items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold ring-1 ring-inset',
          state === 'ok' ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : state === 'connecting' ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-red-50 text-red-800 ring-red-200',
        )}
        title={title}
        role="status"
      >
        {state === 'offline' ? <WifiOff className="h-4 w-4" /> : state === 'connecting' ? <Wifi className="h-4 w-4" /> : <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" /></span>}
        <span className="hidden sm:inline">{label}</span>
        <span className="sr-only sm:hidden">{label}</span>
      </span>
    </div>
  );
}

// ───────── Điện thoại ─────────

function BottomItem({ item, active, badge }: { item: NavItem; active: boolean; badge: number }) {
  return (
    <Link href={item.href} aria-current={active ? 'page' : undefined} className={cn('group relative flex min-h-[64px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', active ? 'text-brand-800' : 'text-ink-500')}>
      <span className={cn('flex h-8 w-14 items-center justify-center rounded-full transition-colors', active ? 'bg-brand-100' : 'group-active:bg-ink-100')}>
        <item.icon className="h-6 w-6" />
      </span>
      <span className="max-w-full truncate px-0.5">{item.label}</span>
      <CountBadge n={badge} className="absolute top-1.5 right-[calc(50%-26px)]" />
    </Link>
  );
}

function NavSheet({ groups, isActive, openRequests, onNavigate }: { groups: NavGroup[]; isActive: (href: string) => boolean; openRequests: number; onNavigate: () => void }) {
  return (
    <div className="space-y-4 pb-2">
      {groups.map((g) => (
        <div key={g.id}>
          <div className="mb-2 text-[11px] font-semibold tracking-wider text-ink-500 uppercase">{g.label}</div>
          <div className="grid grid-cols-3 gap-2">
            {g.items.map((n) => {
              const active = isActive(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={cn('relative flex min-h-[84px] flex-col items-center justify-center gap-1.5 rounded-2xl text-sm font-semibold ring-1 ring-inset transition', active ? 'bg-brand-50 text-brand-800 ring-brand-300' : 'bg-white text-ink-700 shadow-card ring-ink-900/[0.06] hover:bg-ink-50')}
                >
                  <n.icon className={cn('h-7 w-7', active ? 'text-brand-700' : 'text-ink-500')} />
                  {n.label}
                  {n.href === '/requests' && <CountBadge n={openRequests} className="absolute top-1.5 right-2" />}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
