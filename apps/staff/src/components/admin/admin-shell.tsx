'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChartColumn, Map as MapIcon, ScrollText, Settings, Users, UtensilsCrossed } from 'lucide-react';
import { AppShell } from '@/components/shell/app-shell';
import { EmptyState } from '@/components/ui/primitives';
import { hasPermissionIn, useAuth } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

export type AdminSectionId = 'menu' | 'floor' | 'staff' | 'settings' | 'reports' | 'audit';

export interface AdminSection {
  id: AdminSectionId;
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Chỉ cần một trong các quyền. */
  perms: string[];
}

export const ADMIN_SECTIONS: AdminSection[] = [
  { id: 'menu', href: '/admin/menu', label: 'Thực đơn', description: 'Thực đơn, danh mục, món, tùy chọn, giá theo cơ sở', icon: UtensilsCrossed, perms: ['menu.manage', 'menu.read'] },
  { id: 'floor', href: '/admin/floor', label: 'Sơ đồ bàn', description: 'Khu vực, bàn, kéo thả sơ đồ, mã QR bàn', icon: MapIcon, perms: ['branch.update'] },
  { id: 'staff', href: '/admin/staff', label: 'Nhân sự', description: 'Nhân viên, vai trò và phân quyền, thiết bị', icon: Users, perms: ['staff.read', 'staff.manage', 'staff.device'] },
  { id: 'settings', href: '/admin/settings', label: 'Cấu hình', description: 'Thuế, phí, VietQR, trạm bếp, máy in, tích hợp', icon: Settings, perms: ['branch.read', 'branch.update', 'print.manage'] },
  { id: 'reports', href: '/admin/reports', label: 'Báo cáo', description: 'Doanh thu, bếp, giảm giá và hủy món, ca', icon: ChartColumn, perms: ['report.branch', 'report.all'] },
  { id: 'audit', href: '/admin/audit', label: 'Nhật ký', description: 'Nhật ký thao tác nhạy cảm', icon: ScrollText, perms: ['audit.read'] },
];

/** Tất cả quyền mở được khu quản trị (dùng cho menu điều hướng chính). */
export const ADMIN_PERMS = [...new Set(ADMIN_SECTIONS.flatMap((s) => s.perms))];

export function canSee(perms: readonly string[] | undefined, section: Pick<AdminSection, 'perms'>): boolean {
  return section.perms.some((p) => hasPermissionIn(perms, p));
}

export function useAdminSections(): AdminSection[] {
  const perms = useAuth((s) => s.me?.permissions);
  return ADMIN_SECTIONS.filter((s) => canSee(perms, s));
}

/** Khung trang quản trị: thanh mục con (ẩn mục không có quyền) và chặn truy cập khi thiếu quyền. */
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
  return (
    // w-0 + min-w-full: bảng rộng (ma trận quyền, sơ đồ) cuộn trong khung, không kéo giãn cả trang
    <div className="flex min-h-full w-0 min-w-full flex-col">
      <nav className="no-scrollbar sticky top-0 z-20 flex gap-1 overflow-x-auto border-b border-ink-100 bg-white/95 px-3 py-2 backdrop-blur" aria-label="Quản trị">
        <Link href="/admin" className={cn('flex min-h-[40px] shrink-0 items-center rounded-lg px-3 text-sm font-semibold', !section ? 'bg-brand-700 text-white' : 'text-ink-700 hover:bg-ink-100')}>
          Tổng quan
        </Link>
        {sections.map((s) => (
          <Link key={s.id} href={s.href} className={cn('flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold', section === s.id ? 'bg-brand-700 text-white' : 'text-ink-700 hover:bg-ink-100')}>
            <s.icon className="h-4 w-4" />
            {s.label}
          </Link>
        ))}
      </nav>
      <div className="flex-1 p-3 md:p-4">{allowed ? children : <EmptyState title="Bạn không có quyền truy cập mục này" hint="Liên hệ quản trị viên để được cấp quyền." />}</div>
    </div>
  );
}

export function AdminHome() {
  const sections = useAdminSections();
  if (sections.length === 0) return <EmptyState title="Bạn chưa được cấp quyền quản trị" />;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {sections.map((s) => (
        <Link key={s.id} href={s.href} className="flex items-start gap-3 rounded-2xl border border-ink-100 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <s.icon className="h-6 w-6" />
          </span>
          <span>
            <span className="block text-lg font-bold text-ink-900">{s.label}</span>
            <span className="block text-sm text-ink-500">{s.description}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}
