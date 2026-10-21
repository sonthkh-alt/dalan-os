import type { LucideIcon } from 'lucide-react';
import { Bell, CalendarClock, ChefHat, LayoutGrid, Package, PartyPopper, Users, Wallet } from 'lucide-react';
import { ADMIN_NAV_ITEM, canSeeAdmin } from '@/components/admin/admin-nav';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Mô tả ngắn hiện trong bảng lệnh Ctrl+K. */
  hint?: string;
  /** Từ khóa tìm kiếm bổ sung (không dấu). */
  keywords?: string;
}

export interface NavGroup {
  id: 'service' | 'guests' | 'ops';
  label: string;
  items: NavItem[];
}

/** Điều hướng chính, nhóm theo luồng công việc như các chuỗi nhà hàng lớn (phục vụ → khách → vận hành). */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'service',
    label: 'Phục vụ',
    items: [
      { href: '/', label: 'Sơ đồ bàn', icon: LayoutGrid, hint: 'Mở bàn, gọi món, thanh toán', keywords: 'trang chu home ban pos goi mon' },
      { href: '/kds', label: 'Bếp', icon: ChefHat, hint: 'Màn hình bếp (KDS)', keywords: 'kds bep phieu' },
      { href: '/requests', label: 'Yêu cầu', icon: Bell, hint: 'Khách gọi phục vụ, xin hóa đơn', keywords: 'goi phuc vu chuong' },
      { href: '/shift', label: 'Ca', icon: Wallet, hint: 'Mở/đóng ca, két tiền', keywords: 'ca lam ket tien thu ngan' },
    ],
  },
  {
    id: 'guests',
    label: 'Khách & đặt chỗ',
    items: [
      { href: '/reservations', label: 'Đặt bàn', icon: CalendarClock, hint: 'Lịch đặt bàn, danh sách chờ', keywords: 'dat cho booking' },
      { href: '/customers', label: 'Khách hàng', icon: Users, hint: 'Hồ sơ khách, điểm, voucher', keywords: 'crm thanh vien diem' },
      { href: '/events', label: 'Tiệc', icon: PartyPopper, hint: 'Tiệc cưới, hội nghị, BEO', keywords: 'su kien cuoi hoi nghi beo' },
    ],
  },
  {
    id: 'ops',
    label: 'Vận hành',
    items: [{ href: '/inventory', label: 'Kho', icon: Package, hint: 'Tồn kho, nhập xuất, định lượng', keywords: 'ton kho nguyen lieu' }],
  },
];

/** Nhóm điều hướng theo quyền: "Quản trị" chỉ hiện khi có ít nhất một quyền quản trị. */
export function navGroupsFor(perms: readonly string[] | undefined): NavGroup[] {
  if (!canSeeAdmin(perms)) return NAV_GROUPS;
  return NAV_GROUPS.map((g) => (g.id === 'ops' ? { ...g, items: [...g.items, { ...ADMIN_NAV_ITEM, hint: 'Thực đơn, nhân sự, cấu hình, báo cáo', keywords: 'admin cai dat' }] } : g));
}

export function isNavActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/' || pathname.startsWith('/sessions');
  return pathname === href || pathname.startsWith(`${href}/`);
}
