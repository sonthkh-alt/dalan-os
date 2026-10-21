'use client';

/**
 * Hook dữ liệu và lệnh ghi cho các màn hình vận hành: đặt bàn, khách hàng, tiệc/sự kiện, kho.
 * Khóa query bắt đầu bằng 'reservations' | 'customers' | 'customer' | 'events' | 'event' | 'inventory'
 * để invalidateForEvent (socket.ts) làm mới đúng nhóm khi có sự kiện realtime.
 */

import { useQuery } from '@tanstack/react-query';
import type { AvailabilityResult } from '@dalan/contracts';
import { get, patch, post, put } from './api';
import { useBranchId } from './auth-store';

// ───────────────────────── Kiểu dữ liệu ─────────────────────────

export type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'SEATED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW' | 'WAITLIST';
export type DepositStatus = 'NOT_REQUIRED' | 'PENDING' | 'PAID' | 'REFUNDED' | 'FORFEITED';

export interface Reservation {
  id: string;
  branchId: string;
  code: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  partySize: number;
  reservedAt: string;
  durationMinutes: number;
  areaId: string | null;
  tableIds: string[];
  status: ReservationStatus;
  source: string;
  occasion: string | null;
  specialRequests: string | null;
  depositRequired: number | null;
  depositPaid: number;
  depositStatus: DepositStatus;
  preorderLines: { itemId: string; quantity: number; note?: string }[] | null;
  notes: string | null;
  waitlistPosition: number | null;
  confirmedAt: string | null;
  seatedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  area: { id: string; name: string; kind: string } | null;
  customer: { id: string; fullName: string | null; tierId: string | null; visitCount: number; tags: string[]; allergies?: string | null; preferences?: string | null; notes?: string | null } | null;
  session: { id: string; code: string; status: string } | null;
  tables: { id: string; code: string; name: string }[];
  isUpcoming?: boolean;
  isLate?: boolean;
}

export interface ReservationCreateBody {
  customerName: string;
  customerPhone: string;
  partySize: number;
  reservedAt: string;
  areaId?: string;
  occasion?: string;
  specialRequests?: string;
  source?: 'PHONE' | 'WALK_IN' | 'STAFF' | 'WEB' | 'ZALO' | 'MINI_APP';
  durationMinutes?: number;
  tableIds?: string[];
  customerId?: string;
  notes?: string;
  depositRequired?: number;
  force?: boolean;
  autoConfirm?: boolean;
  /** Hết chỗ thì đưa vào danh sách chờ thay vì trả 409 NO_AVAILABILITY. */
  waitlist?: boolean;
}

export type DepositMethod = 'CASH' | 'BANK_TRANSFER' | 'CARD_TERMINAL';
export interface ReservationDepositBody {
  amount: number;
  method: DepositMethod;
  externalRef?: string;
  note?: string;
}

export interface CustomerSummary {
  id: string;
  phone: string;
  phoneMasked: boolean;
  fullName: string | null;
  email: string | null;
  birthday: string | null;
  gender: 'M' | 'F' | 'O' | null;
  companyName: string | null;
  taxCode: string | null;
  companyAddress: string | null;
  tags: string[];
  notes: string | null;
  allergies: string | null;
  preferences: string | null;
  marketingConsent: boolean;
  tierId: string | null;
  pointsBalance: number;
  lifetimeSpend: number;
  visitCount: number;
  firstVisitAt: string | null;
  lastVisitAt: string | null;
  source: string | null;
  isAnonymized: boolean;
  createdAt: string;
  tier?: { code: string; name: string } | null;
}

export interface PointsTx {
  id: string;
  kind: string;
  points: number;
  balanceAfter: number;
  reason: string | null;
  createdAt: string;
  bill?: { code: string; total: number } | null;
}

export interface Voucher {
  id: string;
  code: string;
  kind: 'PERCENT' | 'AMOUNT';
  value: number;
  minBill: number | null;
  maxDiscount: number | null;
  validFrom: string | null;
  validTo: string | null;
  usageLimit: number;
  usedCount?: number;
  status: 'ACTIVE' | 'USED' | 'EXPIRED' | 'REVOKED';
  createdAt: string;
}

export interface CustomerDetail extends CustomerSummary {
  tier: { id: string; code: string; name: string; minSpend12m: number; earnMultiplierBps: number } | null;
  spend12m: number;
  bills: { id: string; code: string; total: number; closedAt: string | null; branchId: string; session: { code: string; guestCount: number } | null }[];
  reservations: { id: string; code: string; status: ReservationStatus; reservedAt: string; partySize: number; branchId: string }[];
  pointsTx: PointsTx[];
  vouchers: Voucher[];
  feedback: { id: string; rating: number; comment: string | null; createdAt: string; response?: string | null }[];
}

export interface LoyaltyTier {
  id: string;
  code: string;
  name: string;
  minSpend12m: number;
  earnMultiplierBps: number;
  benefits: Record<string, unknown>;
  sortOrder: number;
  _count?: { customers: number };
}

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export type EventStatus = 'LEAD' | 'QUOTED' | 'CONTRACTED' | 'CONFIRMED' | 'BEO_ISSUED' | 'IN_PROGRESS' | 'SETTLED' | 'CLOSED' | 'CANCELLED';
export type EventKind = 'WEDDING' | 'ENGAGEMENT' | 'CONFERENCE' | 'GALA' | 'OPENING' | 'ANNIVERSARY' | 'BIRTHDAY' | 'REUNION' | 'PARTY' | 'OTHER';

export interface Hall {
  id: string;
  branchId: string;
  code: string;
  name: string;
  capacityByLayout: Record<string, number>;
  turnoverMinutes: number;
  rentalFee: number | null;
  fixedEquipment: string | null;
  isActive: boolean;
}

export interface EventListItem {
  id: string;
  branchId: string;
  code: string;
  kind: EventKind;
  status: EventStatus;
  contactName: string;
  contactPhone: string;
  companyName: string | null;
  eventDate: string;
  startTime: string;
  endTime: string;
  expectedTables: number;
  confirmedTables: number | null;
  guestsPerTable: number;
  total: number;
  paidTotal: number;
  holdExpiresAt: string | null;
  halls: { hallId: string; layout: string; hall: { id: string; code: string; name: string } }[];
}

export interface EventTotalsView {
  subtotalMenu: number;
  subtotalServices: number;
  adjustmentsTotal: number;
  discountAmount: number;
  serviceChargeAmount: number;
  vatAmount: number;
  total: number;
  depositsPaid: number;
  paid: number;
  due: number;
}

export interface QuotePayload {
  version: number;
  event: { code: string; kind: EventKind; eventDate: string; startTime: string; endTime: string; contactName: string; companyName: string | null; expectedTables: number; guestsPerTable: number };
  halls: { name: string; layout: string }[];
  menus: { name: string; pricePerTable: number; tables: number; lines: { name: string; quantityPerTable: number; unit: string | null }[] }[];
  services: { name: string; unitPrice: number; quantity: number; total: number; isIncluded: boolean }[];
  totals: EventTotalsView;
  validUntil: string | null;
  terms: string | null;
}

export interface BeoContent {
  version: number;
  issuedAt: string;
  issuedBy: string;
  event: { code: string; kind: EventKind; eventDate: string; startTime: string; endTime: string; confirmedTables: number; reserveTables: number; guestsPerTable: number; expectedGuests: number | null; beveragePolicy: string; beverageNotes: string | null };
  customer: { contactName: string; contactPhone: string; contactEmail: string | null; companyName: string | null; taxCode: string | null; notes: string | null };
  halls: { name: string; layout: string; setupNotes: string | null }[];
  timeline: { time: string; activity: string; owner?: string }[];
  menus: { name: string; pricePerTable: number; tables: number; lines: { name: string; quantityPerTable: number; unit: string | null; note: string | null }[] }[];
  kitchenQuantities: { name: string; unit?: string; tables: number; quantity: number }[];
  services: { name: string; quantity: number; unitPrice: number; total: number; isIncluded: boolean; note: string | null }[];
  staffing: { role: string; count: number; note?: string }[];
  setupNotes: string | null;
  specialNotes: string | null;
  financials: EventTotalsView & { deposits: { label: string; amount: number; dueDate: string; status: string }[] };
}

export interface EventDetail extends EventListItem {
  contactEmail: string | null;
  taxCode: string | null;
  customerId: string | null;
  reserveTables: number;
  expectedGuests: number | null;
  beveragePolicy: 'PACKAGE' | 'ACTUAL' | 'BYO' | 'MIXED';
  beverageNotes: string | null;
  notes: string | null;
  internalNotes: string | null;
  ownerStaffId: string | null;
  source: string | null;
  subtotalMenu: number;
  subtotalServices: number;
  discountAmount: number;
  serviceChargeBps: number;
  vatBps: number;
  depositTotal: number;
  settledTotal: number | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  timeline: { at: string; status?: string; note: string; by?: string | null }[];
  createdAt: string;
  branch: { id: string; code: string; name: string; address: string | null; phone: string | null; bankBin: string | null; bankAccountNo: string | null; bankAccountName: string | null };
  customer: { id: string; fullName: string | null; phone: string; companyName: string | null; taxCode: string | null; tags: string[]; pointsBalance: number } | null;
  halls: { hallId: string; layout: string; setupNotes: string | null; hall: Hall }[];
  quotes: { id: string; version: number; status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'SUPERSEDED'; payload: QuotePayload; total: number; sentAt: string | null; createdAt: string }[];
  menus: { id: string; name: string; pricePerTable: number; tables: number; notes: string | null; isFinal: boolean; sortOrder: number; lines: { id: string; itemId: string | null; nameSnapshot: string; quantityPerTable: number; unit: string | null; note: string | null; sortOrder: number }[] }[];
  services: { id: string; catalogId: string | null; name: string; unitPrice: number; quantity: number; total: number; note: string | null; isIncluded: boolean; catalog: { code: string; category: string } | null }[];
  deposits: { id: string; seq: number; label: string; amount: number; percentBps: number | null; dueDate: string; status: 'DUE' | 'PAID' | 'OVERDUE' | 'WAIVED'; paidAt: string | null }[];
  payments: { id: string; kind: 'DEPOSIT' | 'BALANCE' | 'REFUND'; method: string; amount: number; status: string; externalRef: string | null; note: string | null; paidAt: string }[];
  beos: { id: string; version: number; status: 'DRAFT' | 'ISSUED' | 'SUPERSEDED'; content: BeoContent; issuedAt: string | null; createdAt: string }[];
  adjustments: { id: string; kind: AdjustmentKind; description: string; quantity: number; unitPrice: number; amount: number; createdAt: string }[];
  eInvoices: { id: string; status: string; invoiceNo: string | null; lookupUrl: string | null; provider: string }[];
  totals: EventTotalsView;
}

export type AdjustmentKind = 'EXTRA_TABLE' | 'BEVERAGE' | 'SERVICE' | 'DAMAGE' | 'DISCOUNT' | 'OTHER';

export interface ServiceCatalogItem {
  id: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  price: number;
  description: string | null;
  isActive: boolean;
}

export interface HallCalendarRow {
  hall: Hall;
  bookings: { id: string; code: string; kind: EventKind; status: EventStatus; eventDate: string; startTime: string; endTime: string; contactName: string; expectedTables: number; confirmedTables: number | null; holdExpiresAt: string | null; layout: string; isTentative: boolean; holdExpired: boolean; turnoverMinutes: number }[];
}

export interface EventsSummary {
  byStatus: Record<string, number>;
  upcoming: { next7Days: number; next30Days: number };
  revenueLast30DaysByKind: { kind: EventKind; events: number; total: number }[];
  conversion: { leads: number; contracted: number; rate: number | null };
  overdueDeposits: { eventCode: string; contactName: string; label: string; amount: number; dueDate: string }[];
}

export interface DepositQr {
  amount: number;
  purpose: string;
  payload: string;
  qrDataUrl: string | null;
  bank: { bin: string | null; accountNo: string | null; accountName: string | null };
  forDeposit: { seq: number; label: string } | null;
}

export interface Warehouse {
  id: string;
  branchId: string | null;
  code: string;
  name: string;
  kind: 'MAIN' | 'KITCHEN' | 'BAR' | 'COLD' | 'CENTRAL' | 'FACTORY';
  isActive: boolean;
  branch: { id: string; code: string; name: string } | null;
}

export interface StockLevelRow {
  stockItemId: string;
  code: string;
  name: string;
  category: string;
  baseUnit: string;
  quantity: number;
  minStock: number | null;
  costPerBaseUnit: number;
  value: number;
  isLow: boolean;
  updatedAt: string;
}

export interface StockItem {
  id: string;
  code: string;
  name: string;
  category: string;
  baseUnit: string;
  purchaseUnit: string;
  purchaseUnitFactor: number;
  minStock: number | null;
  trackLots: boolean;
  defaultSupplierId: string | null;
  costPerBaseUnit: number;
  isActive: boolean;
  levels: { warehouseId: string; quantity: number }[];
  totalQuantity: number;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxCode: string | null;
  paymentTerms: string | null;
  notes: string | null;
  isActive: boolean;
}

export interface StockMovement {
  id: string;
  warehouseId: string;
  stockItemId: string;
  kind: string;
  quantity: number;
  unitCost: number;
  refType: string | null;
  refId: string | null;
  reason: string | null;
  occurredAt: string;
  stockItem: { code: string; name: string; baseUnit: string };
}

export type PoStatus = 'DRAFT' | 'SENT' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';
export interface PurchaseOrderRow {
  id: string;
  code: string;
  status: PoStatus;
  expectedDate: string | null;
  total: number;
  notes: string | null;
  createdAt: string;
  supplierId: string;
  warehouseId: string;
  supplier: { code: string; name: string };
  warehouse: { code: string; name: string };
  _count: { lines: number };
}
export interface PurchaseOrderDetail extends Omit<PurchaseOrderRow, '_count' | 'supplier' | 'warehouse'> {
  branchId: string;
  supplier: Supplier;
  warehouse: Warehouse;
  lines: { id: string; stockItemId: string; quantity: number; unit: string; unitPrice: number; receivedQty: number; stockItem: { code: string; name: string; baseUnit: string; purchaseUnit: string } }[];
  receipts: { id: string; code: string; receivedAt: string; total: number }[];
}

export interface GoodsReceiptRow {
  id: string;
  code: string;
  receivedAt: string;
  invoiceNo: string | null;
  total: number;
  poId: string | null;
  supplier: { name: string } | null;
  warehouse: { code: string };
  _count: { lines: number };
}

export interface TransferRow {
  id: string;
  code: string;
  status: 'DRAFT' | 'SENT' | 'RECEIVED' | 'CANCELLED';
  fromWarehouseId: string;
  toWarehouseId: string;
  notes: string | null;
  createdAt: string;
  sentAt: string | null;
  receivedAt: string | null;
  fromWarehouse: { code: string; name: string };
  toWarehouse: { code: string; name: string };
  _count: { lines: number };
}

export interface TransferDetail extends Omit<TransferRow, '_count'> {
  fromWarehouse: { id: string; code: string; name: string };
  toWarehouse: { id: string; code: string; name: string };
  lines: { id: string; stockItemId: string; quantitySent: number; quantityReceived: number | null; stockItem: { id: string; code: string; name: string; baseUnit: string; costPerBaseUnit: number } }[];
}

export type StocktakeStatus = 'DRAFT' | 'COUNTING' | 'REVIEW' | 'APPROVED' | 'CANCELLED';
export interface StocktakeRow {
  id: string;
  code: string;
  warehouseId: string;
  status: StocktakeStatus;
  startedAt: string;
  approvedAt: string | null;
  notes: string | null;
  warehouse: { id: string; code: string; name: string };
  _count: { lines: number };
}

export interface Stocktake {
  id: string;
  code: string;
  warehouseId: string;
  status: 'DRAFT' | 'COUNTING' | 'REVIEW' | 'APPROVED' | 'CANCELLED';
  notes: string | null;
  createdAt: string;
  approvedAt: string | null;
  warehouse: Warehouse;
  lines: { id: string; stockItemId: string; expectedQty: number; countedQty: number | null; varianceQty: number | null; varianceValue: number | null; stockItem: { code: string; name: string; baseUnit: string; category: string; costPerBaseUnit: number } }[];
  varianceValue: number;
  countedLines: number;
}

export interface Recipe {
  id: string;
  itemId: string;
  variantId: string | null;
  modifierOptionId: string | null;
  yieldQty: number;
  notes: string | null;
  isActive: boolean;
  estimatedCost: number;
  lines: { id: string; stockItemId: string; quantity: number; wastageBps: number; stockItem: { id: string; code: string; name: string; baseUnit: string; costPerBaseUnit: number } }[];
}

export interface InventoryAlert {
  stockItemId: string;
  code: string;
  name: string;
  baseUnit: string;
  quantity: number;
  minStock: number;
}

export interface CogsReport {
  from: string;
  to: string;
  totalCogs: number;
  byDay: { date: string; cogs: number }[];
  byItem: { name: string; quantity: number; cogs: number; revenue: number; marginBps: number | null }[];
}

// ───────────────────────── Khóa query ─────────────────────────

export const opsKeys = {
  reservations: (branchId: string, date: string) => ['reservations', branchId, date] as const,
  reservationsAll: ['reservations'] as const,
  availability: (branchId: string, q: string) => ['reservations', 'availability', branchId, q] as const,
  customers: (q: string) => ['customers', q] as const,
  customersAll: ['customers'] as const,
  customer: (id: string) => ['customer', id] as const,
  tiers: ['customers', 'tiers'] as const,
  events: (branchId: string) => ['events', branchId] as const,
  eventsAll: ['events'] as const,
  eventsSummary: (branchId: string) => ['events', 'summary', branchId] as const,
  halls: (branchId: string) => ['events', 'halls', branchId] as const,
  hallCalendar: (branchId: string, from: string, to: string) => ['events', 'calendar', branchId, from, to] as const,
  event: (id: string) => ['event', id] as const,
  catalog: ['events', 'catalog'] as const,
  inventory: ['inventory'] as const,
};

// ───────────────────────── Đặt bàn ─────────────────────────

export function useReservations(date: string) {
  const branchId = useBranchId();
  return useQuery({
    queryKey: opsKeys.reservations(branchId, date),
    queryFn: () => get<Reservation[]>(`/branches/${branchId}/reservations?date=${date}`),
    enabled: !!branchId && !!date,
    refetchInterval: 30_000,
  });
}

export function useAvailability(params: { date: string; partySize: number; areaId?: string; durationMinutes?: number } | null) {
  const branchId = useBranchId();
  const qs = params ? new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString() : '';
  return useQuery({
    queryKey: opsKeys.availability(branchId, qs),
    queryFn: () => get<AvailabilityResult>(`/branches/${branchId}/reservations/availability?${qs}`),
    enabled: !!branchId && !!params && params.partySize > 0,
    staleTime: 15_000,
  });
}

export const reservationApi = {
  create: (branchId: string, body: ReservationCreateBody) => post<Reservation>(`/branches/${branchId}/reservations`, body),
  /** Thu cọc tại quầy; đủ mức yêu cầu thì API chuyển PAID và tự xác nhận đặt bàn đang chờ. */
  deposit: (id: string, body: ReservationDepositBody) => post<Reservation>(`/reservations/${id}/deposit`, body),
  update: (id: string, body: Record<string, unknown>) => patch<Reservation>(`/reservations/${id}`, body),
  confirm: (id: string) => post<Reservation>(`/reservations/${id}/confirm`),
  cancel: (id: string, reason?: string) => post<Reservation>(`/reservations/${id}/cancel`, reason ? { reason } : {}),
  noShow: (id: string) => post<Reservation>(`/reservations/${id}/no-show`),
  assign: (id: string, tableIds: string[]) => post<Reservation>(`/reservations/${id}/assign-tables`, { tableIds }),
  checkIn: (id: string, body: { tableIds?: string[]; guestCount?: number }) => post<{ reservation: Reservation; session: { id: string; code: string } }>(`/reservations/${id}/check-in`, body),
};

// ───────────────────────── Khách hàng ─────────────────────────

export function useCustomers(params: { q?: string; page?: number; pageSize?: number; tierId?: string; tag?: string }) {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.tierId) qs.set('tierId', params.tierId);
  if (params.tag) qs.set('tag', params.tag);
  qs.set('page', String(params.page ?? 1));
  qs.set('pageSize', String(params.pageSize ?? 20));
  const key = qs.toString();
  return useQuery({ queryKey: opsKeys.customers(key), queryFn: () => get<Paged<CustomerSummary>>(`/customers?${key}`), placeholderData: (prev) => prev });
}

export function useCustomer(id: string | null) {
  return useQuery({ queryKey: opsKeys.customer(id ?? ''), queryFn: () => get<CustomerDetail>(`/customers/${id}`), enabled: !!id });
}

export function useCustomerPoints(id: string | null) {
  return useQuery({ queryKey: [...opsKeys.customer(id ?? ''), 'points'], queryFn: () => get<PointsTx[]>(`/customers/${id}/points`), enabled: !!id });
}

export function useCustomerVouchers(id: string | null) {
  return useQuery({ queryKey: [...opsKeys.customer(id ?? ''), 'vouchers'], queryFn: () => get<Voucher[]>(`/customers/${id}/vouchers`), enabled: !!id });
}

export function useTiers() {
  return useQuery({ queryKey: opsKeys.tiers, queryFn: () => get<LoyaltyTier[]>('/loyalty/tiers'), staleTime: 5 * 60_000 });
}

export const customerApi = {
  create: (body: Record<string, unknown>) => post<CustomerSummary>('/customers', body),
  update: (id: string, body: Record<string, unknown>) => patch<CustomerSummary>(`/customers/${id}`, body),
  adjustPoints: (id: string, points: number, reason: string) => post<{ customerId: string; pointsBalance: number }>(`/customers/${id}/points`, { points, reason }),
  createVoucher: (body: Record<string, unknown>) => post<Voucher[]>('/vouchers', body),
  merge: (sourceId: string, targetId: string) => post<CustomerDetail>('/customers/merge', { sourceId, targetId }),
  attachToSession: (sessionId: string, body: { customerId?: string; phone?: string; fullName?: string }) => post<CustomerSummary>(`/sessions/${sessionId}/customer`, body),
};

// ───────────────────────── Tiệc / sự kiện ─────────────────────────

export function useEvents(search = '') {
  const branchId = useBranchId();
  const qs = search ? `?search=${encodeURIComponent(search)}` : '';
  return useQuery({ queryKey: [...opsKeys.events(branchId), search], queryFn: () => get<EventListItem[]>(`/branches/${branchId}/events${qs}`), enabled: !!branchId, refetchInterval: 60_000 });
}

export function useEventsSummary() {
  const branchId = useBranchId();
  return useQuery({ queryKey: opsKeys.eventsSummary(branchId), queryFn: () => get<EventsSummary>(`/branches/${branchId}/events/summary`), enabled: !!branchId, staleTime: 60_000 });
}

export function useHalls() {
  const branchId = useBranchId();
  return useQuery({ queryKey: opsKeys.halls(branchId), queryFn: () => get<Hall[]>(`/branches/${branchId}/halls`), enabled: !!branchId, staleTime: 5 * 60_000 });
}

export function useHallCalendar(from: string, to: string) {
  const branchId = useBranchId();
  return useQuery({ queryKey: opsKeys.hallCalendar(branchId, from, to), queryFn: () => get<HallCalendarRow[]>(`/branches/${branchId}/halls/calendar?from=${from}&to=${to}`), enabled: !!branchId });
}

export function useEvent(id: string) {
  return useQuery({ queryKey: opsKeys.event(id), queryFn: () => get<EventDetail>(`/events/${id}`), enabled: !!id });
}

export function useServiceCatalog() {
  return useQuery({ queryKey: opsKeys.catalog, queryFn: () => get<ServiceCatalogItem[]>('/event-services-catalog'), staleTime: 5 * 60_000 });
}

export const eventApi = {
  create: (branchId: string, body: Record<string, unknown>) => post<EventDetail>(`/branches/${branchId}/events`, body),
  update: (id: string, body: Record<string, unknown>) => patch<EventDetail>(`/events/${id}`, body),
  menus: (id: string, menus: unknown[]) => put<EventDetail>(`/events/${id}/menus`, { menus }),
  services: (id: string, services: unknown[]) => put<EventDetail>(`/events/${id}/services`, { services }),
  quote: (id: string, body: Record<string, unknown>) => post<{ quoteId: string; event: EventDetail }>(`/events/${id}/quotes`, body),
  contract: (id: string, body: Record<string, unknown>) => post<EventDetail>(`/events/${id}/contract`, body),
  confirm: (id: string, body: Record<string, unknown>) => post<EventDetail>(`/events/${id}/confirm`, body),
  beo: (id: string, body: Record<string, unknown>) => post<{ beo: unknown; event: EventDetail }>(`/events/${id}/beo`, body),
  start: (id: string) => post<EventDetail>(`/events/${id}/start`),
  adjust: (id: string, body: Record<string, unknown>) => post<EventDetail>(`/events/${id}/adjustments`, body),
  depositQr: (id: string, amount?: number) => get<DepositQr>(`/events/${id}/deposit-qr${amount ? `?amount=${amount}` : ''}`),
  pay: (id: string, body: Record<string, unknown>) => post<EventDetail>(`/events/${id}/payments`, body),
  settle: (id: string) => post<EventDetail>(`/events/${id}/settle`),
  close: (id: string) => post<EventDetail>(`/events/${id}/close`),
  /** QUOTED → LEAD: báo giá đang mở bị đánh dấu REJECTED để làm báo giá mới. */
  reopenLead: (id: string, note?: string) => post<EventDetail>(`/events/${id}/reopen-lead`, note ? { note } : {}),
  cancel: (id: string, reason: string, refundAmount?: number) => post<EventDetail>(`/events/${id}/cancel`, { reason, ...(refundAmount ? { refundAmount } : {}) }),
};

// ───────────────────────── Kho ─────────────────────────

const inv = (...rest: unknown[]) => ['inventory', ...rest] as const;

export function useWarehouses(scope: 'branch' | 'all' = 'branch') {
  const branchId = useBranchId();
  const qs = scope === 'branch' ? `?branchId=${branchId}` : '';
  return useQuery({ queryKey: inv('warehouses', scope, branchId), queryFn: () => get<Warehouse[]>(`/warehouses${qs}`), enabled: !!branchId, staleTime: 5 * 60_000 });
}

export function useStockLevels(warehouseId: string | null) {
  return useQuery({ queryKey: inv('levels', warehouseId), queryFn: () => get<StockLevelRow[]>(`/warehouses/${warehouseId}/levels`), enabled: !!warehouseId });
}

export function useMovements(warehouseId: string | null, q: { from?: string; to?: string; stockItemId?: string; kind?: string } = {}) {
  const qs = new URLSearchParams(Object.entries(q).filter(([, v]) => !!v) as [string, string][]).toString();
  return useQuery({ queryKey: inv('movements', warehouseId, qs), queryFn: () => get<StockMovement[]>(`/warehouses/${warehouseId}/movements${qs ? `?${qs}` : ''}`), enabled: !!warehouseId });
}

export function useStockItems() {
  return useQuery({ queryKey: inv('stock-items'), queryFn: () => get<StockItem[]>('/stock-items'), staleTime: 60_000 });
}

export function useSuppliers() {
  return useQuery({ queryKey: inv('suppliers'), queryFn: () => get<Supplier[]>('/suppliers'), staleTime: 60_000 });
}

export function useRecipes(itemId: string | null) {
  return useQuery({ queryKey: inv('recipes', itemId), queryFn: () => get<Recipe[]>(`/menu-items/${itemId}/recipes`), enabled: !!itemId });
}

export function usePurchaseOrders(status?: string) {
  const branchId = useBranchId();
  return useQuery({ queryKey: inv('po', branchId, status ?? ''), queryFn: () => get<PurchaseOrderRow[]>(`/branches/${branchId}/purchase-orders${status ? `?status=${status}` : ''}`), enabled: !!branchId });
}

export function usePurchaseOrder(id: string | null) {
  return useQuery({ queryKey: inv('po-detail', id), queryFn: () => get<PurchaseOrderDetail>(`/purchase-orders/${id}`), enabled: !!id });
}

export function useGoodsReceipts() {
  const branchId = useBranchId();
  return useQuery({ queryKey: inv('gr', branchId), queryFn: () => get<GoodsReceiptRow[]>(`/branches/${branchId}/goods-receipts`), enabled: !!branchId });
}

export function useTransfers() {
  return useQuery({ queryKey: inv('transfers'), queryFn: () => get<TransferRow[]>('/stock-transfers') });
}

export function useTransfer(id: string | null) {
  return useQuery({ queryKey: inv('transfer', id), queryFn: () => get<TransferDetail>(`/stock-transfers/${id}`), enabled: !!id });
}

/** Danh sách phiếu kiểm kê (mới nhất trước), lọc theo kho/trạng thái. */
export function useStocktakes(q: { warehouseId?: string; status?: string } = {}) {
  const qs = new URLSearchParams(Object.entries(q).filter(([, v]) => !!v) as [string, string][]).toString();
  return useQuery({ queryKey: inv('stocktakes', qs), queryFn: () => get<StocktakeRow[]>(`/stocktakes${qs ? `?${qs}` : ''}`) });
}

export function useStocktake(id: string | null) {
  return useQuery({ queryKey: inv('stocktake', id), queryFn: () => get<Stocktake>(`/stocktakes/${id}`), enabled: !!id });
}

export function useInventoryAlerts() {
  const branchId = useBranchId();
  return useQuery({ queryKey: inv('alerts', branchId), queryFn: () => get<InventoryAlert[]>(`/branches/${branchId}/inventory/alerts`), enabled: !!branchId, refetchInterval: 120_000 });
}

export function useCogs(from: string, to: string) {
  const branchId = useBranchId();
  return useQuery({ queryKey: inv('cogs', branchId, from, to), queryFn: () => get<CogsReport>(`/branches/${branchId}/inventory/cogs?from=${from}&to=${to}`), enabled: !!branchId && !!from && !!to });
}

export const inventoryApi = {
  createStockItem: (body: Record<string, unknown>) => post<StockItem>('/stock-items', body),
  updateStockItem: (id: string, body: Record<string, unknown>) => patch<StockItem>(`/stock-items/${id}`, body),
  createSupplier: (body: Record<string, unknown>) => post<Supplier>('/suppliers', body),
  updateSupplier: (id: string, body: Record<string, unknown>) => patch<Supplier>(`/suppliers/${id}`, body),
  upsertRecipe: (itemId: string, body: Record<string, unknown>) => put<Recipe>(`/menu-items/${itemId}/recipe`, body),
  createPo: (body: Record<string, unknown>) => post<PurchaseOrderDetail>('/purchase-orders', body),
  sendPo: (id: string) => post(`/purchase-orders/${id}/send`),
  cancelPo: (id: string) => post(`/purchase-orders/${id}/cancel`),
  createReceipt: (body: Record<string, unknown>) => post<GoodsReceiptRow>('/goods-receipts', body),
  createTransfer: (body: Record<string, unknown>) => post<TransferRow>('/stock-transfers', body),
  sendTransfer: (id: string) => post(`/stock-transfers/${id}/send`),
  receiveTransfer: (id: string, lines: { stockItemId: string; quantityReceived: number }[]) => post(`/stock-transfers/${id}/receive`, { lines }),
  createStocktake: (body: Record<string, unknown>) => post<Stocktake>('/stocktakes', body),
  countStocktake: (id: string, lines: { stockItemId: string; countedQty: number }[]) => post<Stocktake>(`/stocktakes/${id}/count`, { lines }),
  approveStocktake: (id: string) => post<Stocktake>(`/stocktakes/${id}/approve`),
  cancelStocktake: (id: string) => post(`/stocktakes/${id}/cancel`),
  waste: (body: Record<string, unknown>) => post('/inventory/waste', body),
};
