'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight, Banknote, Bell, CalendarClock, ChartColumn, ChefHat, LayoutGrid, PartyPopper, RefreshCw, ShieldOff, Users } from 'lucide-react';
import { AppShell } from '@/components/shell/app-shell';
import { PageHeader } from '@/components/ui/page-header';
import { Card, EmptyState, StatCard } from '@/components/ui/primitives';
import { useAuth, useCan } from '@/lib/auth-store';
import { useFloor, useRequests } from '@/lib/queries';
import { useRealtimeReport } from '@/lib/queries-admin';
import { useReservations } from '@/lib/queries-ops';
import { dateLabel, vnToday } from '@/lib/ops-utils';
import { cn, money, moneyShort } from '@/lib/utils';
import { ADMIN_SECTIONS, canSeeSection, type AdminSection, type AdminSectionId } from './admin-nav';

// Giữ các export cũ để không vỡ chỗ đang import từ admin-shell
export { ADMIN_SECTIONS, type AdminSection, type AdminSectionId } from './admin-nav';

/** Tất cả quyền mở được khu quản trị (dùng cho menu điều hướng chính). */
export const ADMIN_PERMS = [...new Set(ADMIN_SECTIONS.flatMap((s) => s.perms))];

export function canSee(perms: readonly string[] | undefined, section: Pick<AdminSection, 'perms'>): boolean {
  return canSeeSection(perms, section);
}

export function useAdminSections(): AdminSection[] {
  const perms = useAuth((s) => s.me?.permissions);
  return ADMIN_SECTIONS.filter((s) => canSee(perms, s));
}

/** Khung trang quản trị: tiêu đề + đường dẫn phân cấp, thanh mục con (ẩn mục không có quyền), chặn truy cập khi thiếu quyền. */
export function AdminShell({ section, children }: { section?: AdminSectionId; children: ReactNode }) {
  return (
    <AppShell>
      <AdminFrame section={section}>{children}</AdminFrame>
    </AppShell>
  );
}

function AdminFrame({ section, children }: { section?: AdminSectionId; children: ReactNode }) {
  const sections = useAdminSections();
  const allowed = !section || sections.some((s) => s.id === section);
  const current = ADMIN_SECTIONS.find((s) => s.id === section);
  const branchName = useAuth((s) => s.me?.branches.find((b) => b.id === s.activeBranchId)?.name);
  return (
    // w-0 + min-w-full: bảng rộng (ma trận quyền, sơ đồ) cuộn trong khung, không kéo giãn cả trang
    <div className="flex min-h-full w-0 min-w-full flex-col">
      <div className="border-b border-ink-100 bg-white">
        {current ? (
          <PageHeader back="/admin" breadcrumb={[{ label: 'Quản trị', href: '/admin' }, { label: current.label }]} title={current.label} subtitle={current.description} />
        ) : (
          <PageHeader breadcrumb={[{ label: 'Quản trị' }]} title="Tổng quan hôm nay" subtitle={`${branchName ?? 'Chưa chọn cơ sở'} · ${dateLabel(vnToday())}`} />
        )}
        <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-2 md:px-5" aria-label="Mục quản trị">
          <TabLink href="/admin" active={!section} icon={<LayoutGrid className="h-4 w-4" />}>
            Tổng quan
          </TabLink>
          {sections.map((s) => (
            <TabLink key={s.id} href={s.href} active={section === s.id} icon={<s.icon className="h-4 w-4" />}>
              {s.label}
            </TabLink>
          ))}
        </nav>
      </div>
      <div className="flex-1 p-3 md:p-5">
        {allowed ? (
          children
        ) : (
          <EmptyState
            icon={ShieldOff}
            title="Bạn không có quyền truy cập mục này"
            hint="Liên hệ quản trị viên để được cấp quyền."
            action={
              <Link href="/admin" className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-white px-4 font-semibold text-ink-900 shadow-card ring-1 ring-ink-200 ring-inset hover:bg-ink-50">
                Về tổng quan quản trị
              </Link>
            }
          />
        )}
      </div>
    </div>
  );
}

function TabLink({ href, active, icon, children }: { href: string; active: boolean; icon: ReactNode; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn('flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition', active ? 'bg-brand-700 text-white shadow-brand' : 'text-ink-700 hover:bg-ink-900/[0.05]')}
    >
      {icon}
      {children}
    </Link>
  );
}

// ───────── Tổng quan "Hôm nay" cho quản lý ─────────

export function AdminHome() {
  const sections = useAdminSections();
  const canBranchReport = useCan('report.branch');
  const canAllReport = useCan('report.all');
  const canReport = canBranchReport || canAllReport;
  if (sections.length === 0) return <EmptyState icon={ShieldOff} title="Bạn chưa được cấp quyền quản trị" hint="Liên hệ quản trị viên để được cấp quyền." />;
  return (
    <div className="space-y-5">
      {canReport ? <RealtimeKpis /> : <BasicKpis />}
      <section>
        <h2 className="mb-2 text-sm font-semibold tracking-wider text-ink-500 uppercase">Quản lý</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sections.map((s) => (
            <Link key={s.id} href={s.href} className="group flex items-start gap-4 rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink-900/[0.06] transition hover:-translate-y-0.5 hover:shadow-raised">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100 ring-inset transition group-hover:bg-brand-700 group-hover:text-white">
                <s.icon className="h-6 w-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 text-base font-bold text-ink-900">
                  {s.label}
                  <ArrowRight className="h-4 w-4 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-brand-700" />
                </span>
                <span className="block text-sm text-ink-500">{s.description}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

/** KPI theo thời gian thực từ GET /reports/realtime (cần quyền báo cáo), theo cơ sở đang chọn. */
function RealtimeKpis() {
  const branchId = useAuth((s) => s.activeBranchId) ?? undefined;
  const rt = useRealtimeReport(branchId);
  const d = rt.data;
  const loading = rt.isLoading;
  if (rt.isError)
    return (
      <Card>
        <p className="text-sm text-red-700">Không tải được số liệu hôm nay. Kiểm tra kết nối rồi thử lại.</p>
        <button type="button" onClick={() => void rt.refetch()} className="mt-2 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold shadow-card ring-1 ring-ink-200 ring-inset hover:bg-ink-50">
          <RefreshCw className="h-4 w-4" /> Thử lại
        </button>
      </Card>
    );
  const perGuest = d && d.todayGuests > 0 ? Math.round(d.todayRevenue / d.todayGuests) : 0;
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-semibold tracking-wider text-ink-500 uppercase">Hôm nay</h2>
        <span className="text-xs text-ink-500">{d ? `Ngày kinh doanh ${d.businessDate} · tự cập nhật mỗi 30 giây` : ''}</span>
        <button type="button" onClick={() => void rt.refetch()} className="ml-auto flex h-10 w-10 items-center justify-center rounded-full text-ink-500 hover:bg-ink-900/[0.05]" aria-label="Làm mới số liệu">
          <RefreshCw className={cn('h-4 w-4', rt.isFetching && 'animate-spin')} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          className="col-span-2"
          label="Doanh thu hôm nay"
          icon={Banknote}
          tone="brand"
          loading={loading}
          value={d ? money(d.todayRevenue) : '—'}
          trend={d?.changePct}
          hint={d ? (d.changePct === null ? `${d.todayBills} hóa đơn · cùng kỳ tuần trước ${moneyShort(d.lastWeekSameDayRevenue)}` : `so với cùng ngày tuần trước · ${d.todayBills} hóa đơn`) : undefined}
          href="/admin/reports"
        />
        <StatCard label="Bàn đang phục vụ" icon={LayoutGrid} tone="info" loading={loading} value={d?.openSessions ?? '—'} hint={d ? `${d.seatedGuests} khách đang ngồi` : undefined} href="/" />
        <StatCard label="Khách hôm nay" icon={Users} tone="success" loading={loading} value={d?.todayGuests ?? '—'} hint={d && d.todayGuests > 0 ? `TB ${moneyShort(perGuest)}/khách` : undefined} />
        <StatCard label="Đặt bàn 2 giờ tới" icon={CalendarClock} loading={loading} value={d?.upcomingReservations ?? '—'} hint="Đang chờ / đã xác nhận" href="/reservations" />
        <StatCard label="Yêu cầu chờ xử lý" icon={Bell} tone={d && d.openServiceRequests > 0 ? 'warning' : 'neutral'} loading={loading} value={d?.openServiceRequests ?? '—'} hint={d && d.openServiceRequests > 0 ? 'Cần nhân viên phản hồi' : 'Không có yêu cầu tồn'} href="/requests" />
        <StatCard label="Phiếu bếp quá hạn" icon={ChefHat} tone={d && d.overdueTickets > 0 ? 'danger' : 'neutral'} loading={loading} value={d?.overdueTickets ?? '—'} hint={d && d.overdueTickets > 0 ? 'Đôn đốc bếp ngay' : 'Bếp đúng tiến độ'} href="/kds" />
        <StatCard label="Tiệc hôm nay" icon={PartyPopper} loading={loading} value={d?.eventsToday ?? '—'} href="/events" />
      </div>
      <Link href="/admin/reports" className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-brand-700 hover:bg-brand-50">
        <ChartColumn className="h-4 w-4" /> Xem báo cáo chi tiết
      </Link>
    </section>
  );
}

/** KPI cơ bản khi không có quyền báo cáo: tính từ sơ đồ bàn, yêu cầu phục vụ và đặt bàn hôm nay. */
function BasicKpis() {
  const floor = useFloor();
  const requests = useRequests();
  const canResRead = useCan('reservation.read');
  const canResManage = useCan('reservation.manage');
  const canReservations = canResRead || canResManage;
  const tables = (floor.data?.areas ?? []).flatMap((a) => a.tables);
  // Một phiên có thể ghép nhiều bàn: đếm theo phiên, không theo bàn
  const sessions = new Map(tables.filter((t) => t.session).map((t) => [t.session!.id, t.session!]));
  const guests = [...sessions.values()].reduce((s, x) => s + x.guestCount, 0);
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold tracking-wider text-ink-500 uppercase">Hôm nay</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Bàn đang phục vụ" icon={LayoutGrid} tone="info" loading={floor.isLoading} value={floor.data ? sessions.size : '—'} hint={floor.data ? `${tables.length} bàn trong sơ đồ` : undefined} href="/" />
        <StatCard label="Khách đang ngồi" icon={Users} tone="success" loading={floor.isLoading} value={floor.data ? guests : '—'} />
        {canReservations && <UpcomingReservationsCard />}
        <StatCard label="Yêu cầu chờ xử lý" icon={Bell} tone={(requests.data?.length ?? 0) > 0 ? 'warning' : 'neutral'} loading={requests.isLoading} value={requests.data?.length ?? '—'} href="/requests" />
      </div>
    </section>
  );
}

function UpcomingReservationsCard() {
  const q = useReservations(vnToday());
  const now = Date.now();
  const upcoming = (q.data ?? []).filter((r) => ['PENDING', 'CONFIRMED'].includes(r.status) && new Date(r.reservedAt).getTime() >= now);
  return <StatCard label="Đặt bàn sắp tới" icon={CalendarClock} loading={q.isLoading} value={q.data ? upcoming.length : '—'} hint={q.data ? `${upcoming.reduce((s, r) => s + r.partySize, 0)} khách còn lại hôm nay` : undefined} href="/reservations" />;
}
