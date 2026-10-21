/** Danh tính của người gọi API sau khi xác thực. */

export interface StaffPrincipal {
  kind: 'staff';
  staffId: string;
  orgId: string;
  roleCode: string;
  permissions: string[];
  /** Cơ sở nhân viên được phép thao tác. */
  branchIds: string[];
  /** Cơ sở đang làm việc (từ thiết bị hoặc chọn khi đăng nhập). */
  activeBranchId: string | null;
  deviceId: string | null;
  fullName: string;
}

export interface CustomerPrincipal {
  kind: 'customer';
  customerId: string;
  orgId: string;
  phone: string;
}

export interface GuestPrincipal {
  kind: 'guest';
  sessionId: string;
  participantId: string;
  branchId: string;
}

export type Principal = StaffPrincipal | CustomerPrincipal | GuestPrincipal;

/**
 * Kiểm tra quyền theo chuỗi `tai_nguyen.hanh_dong`. Hỗ trợ `*` toàn quyền và `tai_nguyen.*`.
 */
export function hasPermission(permissions: readonly string[], required: string): boolean {
  if (permissions.includes('*')) return true;
  if (permissions.includes(required)) return true;
  const [resource] = required.split('.');
  return permissions.includes(`${resource}.*`);
}

export function canAccessBranch(principal: StaffPrincipal, branchId: string): boolean {
  return hasPermission(principal.permissions, '*') || principal.branchIds.includes(branchId);
}
