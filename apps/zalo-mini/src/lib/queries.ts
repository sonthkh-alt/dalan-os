/** Truy vấn dữ liệu dùng chung (react-query) — cùng endpoint với app khách web. */
import { useQuery } from '@tanstack/react-query';
import type { AvailabilityResult, BranchMenuView } from '@dalan/contracts';
import { api, isMissingEndpoint } from './api';
import { useCustomer } from './customer-store';
import { useGuestToken } from './session-store';

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
  branch: {
    id: string;
    code: string;
    name: string;
    vatRateBps: number;
    priceIncludesVat: boolean;
    serviceChargeBps: number;
    qrOrderMode: string;
  };
  tables: { id: string; name: string; area: string }[];
  participants: { id: string; nickname: string | null; isHost: boolean }[];
  orders: GuestOrder[];
  bills: {
    id: string;
    code: string;
    status: string;
    total: number;
    paidTotal: number;
    splitType: string;
    createdAt: string;
  }[];
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

export interface PublicBranch {
  id: string;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  openingHours: { default?: { from: string; to: string } } | null;
  defaultDiningMinutes: number;
  depositPolicy: unknown;
}

export interface CustomerMe {
  id: string;
  phone: string;
  fullName: string | null;
  pointsBalance: number;
  lifetimeSpend: number | string;
  visitCount: number;
  tier: { code: string; name: string; benefits?: unknown } | null;
  vouchers: {
    id: string;
    code: string;
    kind: string;
    value: number | string;
    minBill?: number | string | null;
    maxDiscount?: number | string | null;
    validTo: string | null;
  }[];
  pointsTx: {
    id: string;
    kind?: string;
    points: number;
    reason?: string | null;
    createdAt: string;
  }[];
  bills: {
    id: string;
    code: string;
    total: number | string;
    closedAt: string | null;
    branch: { name: string };
  }[];
}

export interface MyReservation {
  id: string;
  code: string;
  status: string;
  reservedAt: string;
  partySize: number;
  customerName: string;
  specialRequests: string | null;
  branch?: { name: string; address: string | null; phone: string | null };
  area?: { name: string } | null;
}

export function useGuestSessionView(enabled = true) {
  const token = useGuestToken();
  return useQuery({
    queryKey: ['guest-session', token],
    queryFn: () => api<GuestSessionView>('/guest/session', { guestToken: token }),
    enabled: enabled && !!token,
    refetchInterval: 15_000,
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
    retry: (count, err) => !isMissingEndpoint(err) && count < 2,
  });
}

export function usePublicBranches() {
  return useQuery({
    queryKey: ['public-branches'],
    queryFn: () => api<PublicBranch[]>('/public/branches'),
    staleTime: 300_000,
    retry: 1,
  });
}

export function useAvailability(branchCode: string, date: string, partySize: number) {
  return useQuery({
    queryKey: ['availability', branchCode, date, partySize],
    queryFn: () =>
      api<AvailabilityResult>(
        `/public/branches/${encodeURIComponent(branchCode)}/reservations/availability?date=${date}&partySize=${partySize}`,
      ),
    enabled: !!branchCode && !!date && partySize > 0,
    staleTime: 30_000,
    retry: (count, err) => !isMissingEndpoint(err) && count < 1,
  });
}

/** Hồ sơ thành viên; trả null nếu API chưa có /me. */
export function useCustomerMe() {
  const accessToken = useCustomer((s) => s.accessToken);
  const customerId = useCustomer((s) => s.profile?.id);
  return useQuery({
    queryKey: ['customer-me', customerId],
    queryFn: async () => {
      try {
        return await api<CustomerMe>('/me', { auth: true });
      } catch (err) {
        if (isMissingEndpoint(err)) return null;
        throw err;
      }
    },
    enabled: !!accessToken,
  });
}

export function useMyReservations() {
  const accessToken = useCustomer((s) => s.accessToken);
  const customerId = useCustomer((s) => s.profile?.id);
  return useQuery({
    queryKey: ['my-reservations', customerId],
    queryFn: async () => {
      try {
        return await api<MyReservation[]>('/me/reservations', { auth: true });
      } catch (err) {
        if (isMissingEndpoint(err)) return null;
        throw err;
      }
    },
    enabled: !!accessToken,
  });
}
