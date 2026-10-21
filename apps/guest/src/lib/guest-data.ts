'use client';

import { useQuery } from '@tanstack/react-query';
import type { BranchMenuView } from '@dalan/contracts';
import { api } from './api';
import { isSessionValid, useGuestSession } from './session-store';

export interface GuestLine {
  id: string;
  name: string;
  nameEn: string | null;
  unit: string;
  quantity: number;
  unitPrice: number;
  modifiers: { groupName: string; optionName: string; priceDelta: number }[];
  lineTotal: number;
  status: string;
  course: number;
  note: string | null;
  participantId: string | null;
  sentAt: string | null;
  readyAt: string | null;
  servedAt: string | null;
}

export interface GuestOrder {
  id: string;
  seq: number;
  source: string;
  status: string;
  createdAt: string;
  placedByParticipantId: string | null;
  lines: GuestLine[];
}

export interface GuestSessionView {
  id: string;
  code: string;
  status: 'PENDING' | 'OPEN' | 'BILL_REQUESTED' | 'CLOSED' | 'CANCELLED';
  guestCount: number;
  openedAt: string;
  branch: { id: string; code: string; name: string; vatRateBps: number; priceIncludesVat: boolean; serviceChargeBps: number; qrOrderMode: string };
  tables: { id: string; name: string; area: string }[];
  participants: { id: string; nickname: string | null; isHost: boolean }[];
  orders: GuestOrder[];
  bills: { id: string; code: string; status: string; total: number; paidTotal: number; splitType: string; createdAt: string }[];
  requests: { id: string; kind: string; status: string; createdAt: string }[];
  totals: {
    subtotal: number;
    lineDiscountTotal: number;
    billDiscountTotal: number;
    minSpendSurcharge: number;
    serviceChargeBps: number;
    serviceChargeAmount: number;
    vatAmount: number;
    total: number;
  };
  me: { participantId: string };
}

export function useGuestToken(): string | null {
  const state = useGuestSession();
  return isSessionValid(state) ? state.guestToken : null;
}

export function useGuestSessionView(enabled = true) {
  const token = useGuestToken();
  return useQuery({
    queryKey: ['guest-session', token],
    queryFn: () => api<GuestSessionView>('/guest/session', { guestToken: token }),
    enabled: enabled && !!token,
    refetchInterval: 20_000,
  });
}

export function useGuestMenu() {
  const token = useGuestToken();
  return useQuery({
    queryKey: ['guest-menu', token],
    queryFn: () => api<BranchMenuView>('/guest/menu', { guestToken: token }),
    enabled: !!token,
    staleTime: 60_000,
  });
}

export function usePublicMenu(branchCode: string) {
  return useQuery({
    queryKey: ['public-menu', branchCode],
    queryFn: () => api<BranchMenuView>(`/public/branches/${encodeURIComponent(branchCode)}/menu`),
    staleTime: 120_000,
  });
}
