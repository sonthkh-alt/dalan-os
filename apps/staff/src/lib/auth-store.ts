'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { StaffMe } from '@dalan/contracts';

export interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  me: StaffMe | null;
  activeBranchId: string | null;
  /** Token thiết bị dùng cho đăng nhập PIN trên máy chung (nhập một lần). */
  deviceToken: string | null;
  deviceName: string | null;
  hydrated: boolean;
  setSession: (input: { accessToken: string; refreshToken: string; me: StaffMe }) => void;
  setTokens: (input: { accessToken: string; refreshToken: string }) => void;
  setActiveBranch: (branchId: string) => void;
  setDevice: (token: string | null, name?: string | null) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      me: null,
      activeBranchId: null,
      deviceToken: null,
      deviceName: null,
      hydrated: false,
      setSession: ({ accessToken, refreshToken, me }) =>
        set((s) => {
          const keep = s.activeBranchId && me.branches.some((b) => b.id === s.activeBranchId) ? s.activeBranchId : null;
          const activeBranchId = me.activeBranchId ?? keep ?? me.branches.find((b) => b.isDefault)?.id ?? me.branches[0]?.id ?? null;
          return { accessToken, refreshToken, me, activeBranchId };
        }),
      setTokens: ({ accessToken, refreshToken }) => set({ accessToken, refreshToken }),
      setActiveBranch: (activeBranchId) => set({ activeBranchId }),
      setDevice: (deviceToken, deviceName = null) => set({ deviceToken, deviceName }),
      logout: () => set({ accessToken: null, refreshToken: null, me: null }),
    }),
    {
      name: 'dalan-staff-auth',
      partialize: (s) => ({ accessToken: s.accessToken, refreshToken: s.refreshToken, me: s.me, activeBranchId: s.activeBranchId, deviceToken: s.deviceToken, deviceName: s.deviceName }),
    },
  ),
);

// Đánh dấu đã nạp xong localStorage để tránh chuyển hướng sớm về /login
if (typeof window !== 'undefined') {
  useAuth.persist.onFinishHydration(() => useAuth.setState({ hydrated: true }));
  if (useAuth.persist.hasHydrated()) useAuth.setState({ hydrated: true });
}

export function hasPermissionIn(perms: readonly string[] | undefined, required: string): boolean {
  if (!perms) return false;
  if (perms.includes('*') || perms.includes(required)) return true;
  const [resource] = required.split('.');
  return perms.includes(`${resource}.*`);
}

export function hasPermission(required: string): boolean {
  return hasPermissionIn(useAuth.getState().me?.permissions, required);
}

export function useCan(required: string): boolean {
  const perms = useAuth((s) => s.me?.permissions);
  return hasPermissionIn(perms, required);
}

export function useBranchId(): string {
  const id = useAuth((s) => s.activeBranchId);
  return id ?? '';
}
