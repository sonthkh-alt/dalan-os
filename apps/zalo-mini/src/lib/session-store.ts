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
  qrToken: string | null;
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
    qrToken: string;
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

const EMPTY = {
  qrToken: null,
  guestToken: null,
  sessionId: null,
  sessionCode: null,
  participantId: null,
  nickname: null,
  joinPin: null,
  branch: null,
  table: null,
  expiresAt: null,
};

/** Phiên gọi món tại bàn (token khách 6 giờ sau khi quét QR). */
export const useGuestSession = create<GuestSessionState>()(
  persist(
    (set) => ({
      ...EMPTY,
      setSession: (input) => set({ ...input, expiresAt: Date.now() + GUEST_SESSION_TTL_MS }),
      clear: () => set(EMPTY),
    }),
    { name: 'dalan-zalo-session', version: 1 },
  ),
);

export function isSessionValid(
  state: Pick<GuestSessionState, 'guestToken' | 'expiresAt'>,
): boolean {
  return !!state.guestToken && !!state.expiresAt && state.expiresAt > Date.now();
}

export function useGuestToken(): string | null {
  const guestToken = useGuestSession((s) => s.guestToken);
  const expiresAt = useGuestSession((s) => s.expiresAt);
  return isSessionValid({ guestToken, expiresAt }) ? guestToken : null;
}
