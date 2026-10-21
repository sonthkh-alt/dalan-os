'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const GUEST_SESSION_TTL_MS = 6 * 3600 * 1000;

export interface GuestBranch {
  id: string;
  code: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  qrOrderMode: string;
  guestJoinMode: string;
}

export interface GuestTable {
  id: string;
  code: string;
  name: string;
  area: string;
  isPrivateRoom: boolean;
  maxSeats: number;
}

export interface GuestSessionState {
  guestToken: string | null;
  sessionId: string | null;
  sessionCode: string | null;
  participantId: string | null;
  nickname: string | null;
  joinPin: string | null;
  branch: GuestBranch | null;
  table: GuestTable | null;
  expiresAt: number | null;
  setSession: (input: {
    guestToken: string;
    sessionId: string;
    sessionCode: string;
    participantId: string;
    nickname: string | null;
    joinPin: string | null;
    branch: GuestBranch;
    table: GuestTable;
  }) => void;
  clear: () => void;
}

export const useGuestSession = create<GuestSessionState>()(
  persist(
    (set) => ({
      guestToken: null,
      sessionId: null,
      sessionCode: null,
      participantId: null,
      nickname: null,
      joinPin: null,
      branch: null,
      table: null,
      expiresAt: null,
      setSession: (input) => set({ ...input, expiresAt: Date.now() + GUEST_SESSION_TTL_MS }),
      clear: () =>
        set({ guestToken: null, sessionId: null, sessionCode: null, participantId: null, nickname: null, joinPin: null, branch: null, table: null, expiresAt: null }),
    }),
    { name: 'dalan-guest-session', version: 1 },
  ),
);

/** Token còn hiệu lực (6 giờ kể từ khi vào bàn). */
export function isSessionValid(state: Pick<GuestSessionState, 'guestToken' | 'expiresAt'>): boolean {
  return !!state.guestToken && !!state.expiresAt && state.expiresAt > Date.now();
}
