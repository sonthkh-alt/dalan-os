import { Settings } from 'lucide-react';
import { hasPermissionIn } from '@/lib/auth-store';

/** Quyền mở được ít nhất một mục quản trị (đồng bộ với ADMIN_SECTIONS trong admin-shell.tsx). */
export const ADMIN_NAV_PERMS = ['menu.manage', 'menu.read', 'branch.update', 'branch.read', 'print.manage', 'staff.read', 'staff.manage', 'staff.device', 'report.branch', 'report.all', 'audit.read'];

export const ADMIN_NAV_ITEM = { href: '/admin', label: 'Quản trị', icon: Settings };

export function canSeeAdmin(perms: readonly string[] | undefined): boolean {
  return ADMIN_NAV_PERMS.some((p) => hasPermissionIn(perms, p));
}
