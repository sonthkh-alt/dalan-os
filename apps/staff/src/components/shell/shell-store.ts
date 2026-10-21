'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ShellState {
  /** Thu gọn thanh bên chỉ còn biểu tượng (màn hình lớn). Lưu trên máy. */
  collapsed: boolean;
  /** Bảng lệnh Ctrl+K đang mở. */
  paletteOpen: boolean;
  toggleCollapsed: () => void;
  setPaletteOpen: (open: boolean) => void;
}

export const useShell = create<ShellState>()(
  persist(
    (set) => ({
      collapsed: false,
      paletteOpen: false,
      toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
    }),
    { name: 'dalan-staff-shell', partialize: (s) => ({ collapsed: s.collapsed }) },
  ),
);
