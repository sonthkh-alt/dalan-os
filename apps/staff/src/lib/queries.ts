'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post, patch } from './api';
import { useBranchId } from './auth-store';
import type { BillDetail, Branch, FloorView, KdsTicket, MenuView, ServiceRequest, SessionDetail, ShiftSummary, Station } from './types';

/** Khóa query thống nhất với invalidateForEvent trong socket.ts. */
export const keys = {
  floor: (branchId: string) => ['floor', branchId] as const,
  session: (id: string) => ['session', id] as const,
  menu: (branchId: string) => ['menu', branchId] as const,
  bill: (id: string) => ['bill', id] as const,
  kds: (branchId: string, station: string | null, view: string) => ['kds', branchId, station ?? 'all', view] as const,
  kdsAggregate: (branchId: string, station: string | null) => ['kds', 'aggregate', branchId, station ?? 'all'] as const,
  stations: (branchId: string) => ['stations', branchId] as const,
  requests: (branchId: string) => ['requests', branchId] as const,
  shift: (branchId: string) => ['shift', branchId] as const,
  branch: (branchId: string) => ['branch', branchId] as const,
};

export function useFloor() {
  const branchId = useBranchId();
  return useQuery({ queryKey: keys.floor(branchId), queryFn: () => get<FloorView>(`/branches/${branchId}/floor`), enabled: !!branchId, refetchInterval: 15_000 });
}

export function useSession(id: string) {
  return useQuery({ queryKey: keys.session(id), queryFn: () => get<SessionDetail>(`/sessions/${id}`), enabled: !!id, refetchInterval: 20_000 });
}

export function useMenu() {
  const branchId = useBranchId();
  return useQuery({ queryKey: keys.menu(branchId), queryFn: () => get<MenuView>(`/branches/${branchId}/menu`), enabled: !!branchId, staleTime: 60_000 });
}

export function useBranch() {
  const branchId = useBranchId();
  return useQuery({ queryKey: keys.branch(branchId), queryFn: () => get<Branch>(`/branches/${branchId}`), enabled: !!branchId, staleTime: 5 * 60_000 });
}

export function useBill(id: string | null) {
  return useQuery({ queryKey: keys.bill(id ?? ''), queryFn: () => get<BillDetail>(`/bills/${id}`), enabled: !!id, refetchInterval: 10_000 });
}

export function useStations() {
  const branchId = useBranchId();
  return useQuery({ queryKey: keys.stations(branchId), queryFn: () => get<Station[]>(`/branches/${branchId}/stations`), enabled: !!branchId, staleTime: 5 * 60_000 });
}

export function useKds(stationCode: string | null, view: 'active' | 'done') {
  const branchId = useBranchId();
  const qs = new URLSearchParams();
  if (stationCode) qs.set('stationCode', stationCode);
  qs.set('view', view);
  return useQuery({ queryKey: keys.kds(branchId, stationCode, view), queryFn: () => get<KdsTicket[]>(`/branches/${branchId}/kitchen/tickets?${qs}`), enabled: !!branchId, refetchInterval: 10_000 });
}

export function useKdsAggregate(stationCode: string | null) {
  const branchId = useBranchId();
  const qs = stationCode ? `?stationCode=${encodeURIComponent(stationCode)}` : '';
  return useQuery({ queryKey: keys.kdsAggregate(branchId, stationCode), queryFn: () => get<{ name: string; unit: string; quantity: number; tickets: number }[]>(`/branches/${branchId}/kitchen/aggregate${qs}`), enabled: !!branchId, refetchInterval: 15_000 });
}

export function useRequests() {
  const branchId = useBranchId();
  return useQuery({ queryKey: keys.requests(branchId), queryFn: () => get<ServiceRequest[]>(`/branches/${branchId}/service-requests`), enabled: !!branchId, refetchInterval: 15_000 });
}

export function useShift() {
  const branchId = useBranchId();
  return useQuery({ queryKey: keys.shift(branchId), queryFn: () => get<ShiftSummary | null>(`/branches/${branchId}/shifts/current`), enabled: !!branchId, refetchInterval: 30_000 });
}

/** Mutation tiện dụng: tự làm mới các khóa liên quan sau khi thành công. */
export function useAction<TInput, TOut = unknown>(fn: (input: TInput) => Promise<TOut>, invalidate: (input: TInput) => readonly (readonly unknown[])[], onSuccess?: (out: TOut, input: TInput) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (out, input) => {
      for (const key of invalidate(input)) void qc.invalidateQueries({ queryKey: key as unknown[] });
      onSuccess?.(out, input);
    },
  });
}

export const sessionApi = {
  open: (branchId: string, body: { tableIds: string[]; guestCount: number; source?: string; notes?: string }) => post<SessionDetail>(`/branches/${branchId}/sessions`, body),
  update: (id: string, body: { guestCount?: number; notes?: string | null }) => patch<SessionDetail>(`/sessions/${id}`, body),
  createOrder: (id: string, body: unknown) => post(`/sessions/${id}/orders`, body),
  confirmOrder: (id: string, orderId: string) => post(`/sessions/${id}/orders/${orderId}/confirm`),
  rejectOrder: (id: string, orderId: string, reason?: string) => post(`/sessions/${id}/orders/${orderId}/reject`, reason ? { reason } : undefined),
  fireCourse: (id: string, course: number) => post(`/sessions/${id}/fire-course`, { course }),
  updateLine: (id: string, lineId: string, body: unknown) => patch(`/sessions/${id}/lines/${lineId}`, body),
  voidLine: (id: string, lineId: string, body: unknown) => post(`/sessions/${id}/lines/${lineId}/void`, body),
  served: (id: string, lineId: string) => post(`/sessions/${id}/lines/${lineId}/served`),
  move: (id: string, tableIds: string[]) => post(`/sessions/${id}/move`, { tableIds }),
  merge: (id: string, otherSessionId: string) => post(`/sessions/${id}/merge`, { otherSessionId }),
  split: (id: string, body: { lineIds: string[]; tableIds: string[]; guestCount: number }) => post(`/sessions/${id}/split`, body),
  requestBill: (id: string) => post(`/sessions/${id}/request-bill`),
  reopen: (id: string) => post(`/sessions/${id}/reopen`),
  cancel: (id: string, reason?: string) => post(`/sessions/${id}/cancel`, reason ? { reason } : undefined),
  empties: (id: string, counts: { itemId: string; countedQty: number }[]) => post<{ adjustments: { itemId: string; delta: number }[] }>(`/sessions/${id}/empties`, { counts }),
  ackRequest: (requestId: string) => post(`/service-requests/${requestId}/ack`),
  doneRequest: (requestId: string) => post(`/service-requests/${requestId}/done`),
};

export const billApi = {
  create: (sessionId: string, body: { mode: 'ALL' | 'BY_ITEM' | 'BY_PARTICIPANT' | 'EQUAL'; lineIds?: string[]; participantId?: string; parts?: number }) => post<BillDetail[]>(`/sessions/${sessionId}/bills`, body),
  discount: (billId: string, body: unknown) => post<BillDetail>(`/bills/${billId}/discounts`, body),
  removeDiscount: (billId: string, discountId: string) => fetchDelete(`/bills/${billId}/discounts/${discountId}`),
  pay: (billId: string, body: unknown) => post<import('./types').AddPaymentResult>(`/bills/${billId}/payments`, body),
  confirm: (paymentId: string, body?: { externalRef?: string; note?: string }) => post<BillDetail>(`/payments/${paymentId}/confirm`, body ?? {}),
  cancelPayment: (paymentId: string) => post<BillDetail>(`/payments/${paymentId}/cancel`),
  refund: (paymentId: string, body: { amount: number; reason: string; managerPin?: string }) => post<BillDetail>(`/payments/${paymentId}/refund`, body),
  void: (billId: string, reason: string) => post(`/bills/${billId}/void`, { reason }),
  taxInfo: (billId: string, info: unknown) => import('./api').then((m) => m.put<BillDetail>(`/bills/${billId}/tax-invoice-info`, info)),
  printProvisional: (billId: string) => post(`/bills/${billId}/print-provisional`),
};

async function fetchDelete(path: string) {
  const { del } = await import('./api');
  return del(path);
}

export const kdsApi = {
  start: (ticketId: string) => post(`/kitchen/tickets/${ticketId}/start`),
  bump: (ticketId: string) => post(`/kitchen/tickets/${ticketId}/bump`),
  recall: (ticketId: string) => post(`/kitchen/tickets/${ticketId}/recall`),
  bumpLine: (ticketId: string, lineId: string) => post(`/kitchen/tickets/${ticketId}/lines/${lineId}/bump`),
  soldOut: (branchId: string, itemId: string, mode: 'today' | 'indefinite' | 'clear') => post(`/branches/${branchId}/menu-items/${itemId}/sold-out`, { mode }),
};

export const shiftApi = {
  open: (branchId: string, openingCash: number, notes?: string) => post(`/shifts`, { branchId, openingCash, notes }),
  close: (shiftId: string, closingCashCounted: number, notes?: string) => post<ShiftSummary>(`/shifts/${shiftId}/close`, { closingCashCounted, notes }),
  cash: (shiftId: string, body: { kind: 'IN' | 'OUT'; amount: number; reason: string; note?: string }) => post(`/shifts/${shiftId}/cash-movements`, body),
};
