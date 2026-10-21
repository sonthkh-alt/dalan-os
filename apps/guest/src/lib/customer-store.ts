'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CustomerState {
  accessToken: string | null;
  refreshToken: string | null;
  customerId: string | null;
  phone: string | null;
  fullName: string | null;
  signIn: (input: { accessToken: string; refreshToken: string; customerId: string; phone: string; fullName: string | null }) => void;
  signOut: () => void;
}

/** Tài khoản thành viên (đăng nhập OTP). */
export const useCustomer = create<CustomerState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      customerId: null,
      phone: null,
      fullName: null,
      signIn: (input) => set(input),
      signOut: () => set({ accessToken: null, refreshToken: null, customerId: null, phone: null, fullName: null }),
    }),
    { name: 'dalan-customer', version: 1 },
  ),
);
