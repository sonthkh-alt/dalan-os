import type { LucideIcon } from 'lucide-react';
import { ChartColumn, Map as MapIcon, ScrollText, Settings, Users, UtensilsCrossed } from 'lucide-react';
import { hasPermissionIn } from '@/lib/auth-store';

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

/** Các mục quản trị (dùng chung cho khung quản trị, thanh bên và bảng lệnh Ctrl+K). */
export const ADMIN_SECTIONS: AdminSection[] = [
  { id: 'menu', href: '/admin/menu', label: 'Thực đơn', description: 'Thực đơn, danh mục, món, tùy chọn, giá theo cơ sở', icon: UtensilsCrossed, perms: ['menu.manage', 'menu.read'] },
  { id: 'floor', href: '/admin/floor', label: 'Sơ đồ bàn', description: 'Khu vực, bàn, kéo thả sơ đồ, mã QR bàn', icon: MapIcon, perms: ['branch.update'] },
  { id: 'staff', href: '/admin/staff', label: 'Nhân sự', description: 'Nhân viên, vai trò và phân quyền, thiết bị', icon: Users, perms: ['staff.read', 'staff.manage', 'staff.device'] },
  { id: 'settings', href: '/admin/settings', label: 'Cấu hình', description: 'Thuế, phí, VietQR, trạm bếp, máy in, tích hợp', icon: Settings, perms: ['branch.read', 'branch.update', 'print.manage'] },
  { id: 'reports', href: '/admin/reports', label: 'Báo cáo', description: 'Doanh thu, bếp, giảm giá và hủy món, ca', icon: ChartColumn, perms: ['report.branch', 'report.all'] },
  { id: 'audit', href: '/admin/audit', label: 'Nhật ký', description: 'Nhật ký thao tác nhạy cảm', icon: ScrollText, perms: ['audit.read'] },
];

/** Quyền mở được ít nhất một mục quản trị (suy ra từ ADMIN_SECTIONS). */
export const ADMIN_NAV_PERMS = [...new Set(ADMIN_SECTIONS.flatMap((s) => s.perms))];

export const ADMIN_NAV_ITEM = { href: '/admin', label: 'Quản trị', icon: Settings };

export function canSeeAdmin(perms: readonly string[] | undefined): boolean {
  return ADMIN_NAV_PERMS.some((p) => hasPermissionIn(perms, p));
}

export function canSeeSection(perms: readonly string[] | undefined, section: Pick<AdminSection, 'perms'>): boolean {
  return section.perms.some((p) => hasPermissionIn(perms, p));
}
