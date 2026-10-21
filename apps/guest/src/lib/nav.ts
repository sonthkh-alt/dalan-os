'use client';

import { create } from 'zustand';

/** Ghi lại số bước điều hướng trong app để nút Quay lại biết còn lịch sử nội bộ hay không. */
interface NavHistoryState {
  depth: number;
  lastPath: string | null;
  record: (path: string) => void;
}

export const useNavHistory = create<NavHistoryState>((set, get) => ({
  depth: 0,
  lastPath: null,
  record: (path) => {
    const { lastPath, depth } = get();
    if (lastPath === null) set({ lastPath: path, depth: 0 });
    else if (lastPath !== path) set({ lastPath: path, depth: depth + 1 });
  },
}));

/** Trang gốc (không cần nút Quay lại). */
export function isRootPath(pathname: string): boolean {
  return pathname === '/';
}

/** Trang cha khi không có lịch sử (mở thẳng từ đường link). */
export function parentPath(pathname: string, hasSession: boolean): string {
  if (pathname.startsWith('/bill/')) return '/bill';
  if (pathname.startsWith('/menu/')) return '/menu';
  if (pathname === '/feedback') return hasSession ? '/bill' : '/';
  if (hasSession && ['/orders', '/bill', '/call'].includes(pathname)) return '/menu';
  return '/';
}

/** Ẩn thanh điều hướng dưới ở màn hình vào bàn bằng QR (đã có nút hành động riêng). */
export function hideBottomNav(pathname: string): boolean {
  return pathname.startsWith('/q/');
}

/** Ghi nhớ cơ sở khách xem thực đơn gần nhất. */
const LAST_BRANCH_KEY = 'dalan-last-branch';

export function readLastBranch(): string | null {
  try {
    return localStorage.getItem(LAST_BRANCH_KEY);
  } catch {
    return null;
  }
}

export function saveLastBranch(code: string): void {
  try {
    localStorage.setItem(LAST_BRANCH_KEY, code.toUpperCase());
  } catch {
    /* chế độ riêng tư */
  }
}

