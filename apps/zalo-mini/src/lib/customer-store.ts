import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CustomerProfile {
  id: string;
  phone: string;
  fullName: string | null;
  avatarUrl: string | null;
  zaloUserId: string | null;
}

export interface CustomerState {
  accessToken: string | null;
  refreshToken: string | null;
  profile: CustomerProfile | null;
  signIn: (input: { accessToken: string; refreshToken: string; profile: CustomerProfile }) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  signOut: () => void;
}

/** Tài khoản thành viên (đăng nhập bằng Zalo). */
export const useCustomer = create<CustomerState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      profile: null,
      signIn: (input) => set(input),
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      signOut: () => set({ accessToken: null, refreshToken: null, profile: null }),
    }),
    { name: 'dalan-zalo-customer', version: 1 },
  ),
);
