'use client';

import { useQuery } from '@tanstack/react-query';
import type { RealtimeReport, SalesGroupBy, SalesRow, UploadResult } from '@dalan/contracts';
import { API_BASE, ApiError, del, get, patch, post, put } from './api';
import { useAuth } from './auth-store';
import type { Branch } from './types';

// ───────── Kiểu dữ liệu quản trị ─────────

export interface Schedule {
  days?: number[];
  from?: string;
  to?: string;
}

export type MenuKind = 'ALACARTE' | 'BREAKFAST' | 'LUNCH' | 'SET' | 'BANQUET' | 'DRINKS' | 'VEGETARIAN' | 'OTHER';
export type PricingMode = 'FIXED' | 'VARIANT' | 'WEIGHT' | 'MARKET' | 'OPEN';
export type ItemStatus = 'ACTIVE' | 'HIDDEN' | 'DISCONTINUED';

export interface AdminCategory {
  id: string;
  menuId: string;
  code: string;
  name: string;
  nameEn: string | null;
  imageUrl: string | null;
  defaultStationCode: string | null;
  schedule: Schedule;
  sortOrder: number;
  isActive: boolean;
  _count?: { items: number };
}

export interface AdminMenu {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  kind: MenuKind;
  schedule: Schedule;
  sortOrder: number;
  isActive: boolean;
  branches: { menuId: string; branchId: string }[];
  categories: AdminCategory[];
}

export interface AdminVariant {
  id?: string;
  code: string;
  name: string;
  nameEn: string | null;
  price: number;
  sortOrder: number;
  isDefault: boolean;
  isActive: boolean;
}

export interface AdminModifierOption {
  id?: string;
  code: string;
  name: string;
  nameEn: string | null;
  priceDelta: number;
  sortOrder: number;
  isDefault: boolean;
  isActive: boolean;
}

export interface AdminModifierGroup {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  minSelect: number;
  maxSelect: number;
  isRequired: boolean;
  sortOrder: number;
  options: AdminModifierOption[];
  _count?: { items: number };
}

export interface AdminOverride {
  id: string;
  branchId: string;
  itemId: string;
  price: number | null;
  stationCode: string | null;
  isAvailable: boolean;
  soldOutUntil: string | null;
  stockLimit: number | null;
  stockLeft: number | null;
}

export interface PriceHistoryRow {
  id: string;
  variantId: string | null;
  branchId: string | null;
  oldPrice: number | null;
  newPrice: number | null;
  reason: string | null;
  changedById: string | null;
  changedAt: string;
}

export interface AdminMenuItem {
  id: string;
  categoryId: string;
  code: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  descriptionEn: string | null;
  unit: string;
  pricingMode: PricingMode;
  basePrice: number | null;
  vatRateBps: number | null;
  defaultStationCode: string | null;
  imageUrl: string | null;
  isVegetarian: boolean;
  isSignature: boolean;
  isSpicy: boolean;
  countEmpties: boolean;
  prepMinutes: number | null;
  tags: string[];
  allergens: string[];
  sortOrder: number;
  status: ItemStatus;
  category: { id: string; code: string; name: string; menuId: string };
  variants: AdminVariant[];
  modifierGroups: { groupId: string; sortOrder: number; group: AdminModifierGroup }[];
  overrides: AdminOverride[];
  priceHistory?: PriceHistoryRow[];
}

export interface AdminTable {
  id: string;
  areaId: string;
  code: string;
  name: string;
  minSeats: number;
  maxSeats: number;
  shape: 'ROUND' | 'RECT' | 'SQUARE' | 'BAR';
  posX: number;
  posY: number;
  width: number;
  height: number;
  rotation: number;
  isPrivateRoom: boolean;
  minSpend: number | null;
  qrToken: string;
  sortOrder: number;
  isActive: boolean;
}

export type AreaKind = 'HALL' | 'VIP_ROOM' | 'OUTDOOR' | 'BAR' | 'TAKEAWAY' | 'VIRTUAL';

export interface AdminArea {
  id: string;
  code: string;
  name: string;
  kind: AreaKind;
  floor: number | null;
  sortOrder: number;
  serviceChargeBps: number | null;
  minSpend: number | null;
  isActive: boolean;
  tables: AdminTable[];
}

export interface AdminPrinter {
  id: string;
  code: string;
  name: string;
  kind: 'RECEIPT' | 'KITCHEN' | 'LABEL';
  connection: 'NETWORK' | 'USB' | 'BLUETOOTH';
  address: string | null;
  paperWidthMm: 58 | 80;
  isActive: boolean;
  lastSeenAt: string | null;
}

export interface AdminStation {
  id: string;
  code: string;
  name: string;
  mode: 'KDS' | 'PRINTER' | 'BOTH';
  printerId: string | null;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
  printer: AdminPrinter | null;
}

export type DeviceKind = 'POS' | 'TABLET' | 'KDS' | 'PRINT_BRIDGE' | 'CUSTOMER_DISPLAY';

export interface AdminDevice {
  id: string;
  name: string;
  kind: DeviceKind;
  isActive: boolean;
  lastSeenAt: string | null;
  defaultStationId: string | null;
  createdAt: string;
}

export interface AdminRole {
  id: string;
  code: string;
  name: string;
  permissions: string[];
  isSystem: boolean;
}

export interface AdminStaff {
  id: string;
  code: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  avatarUrl: string | null;
  lockedUntil: string | null;
  role: { id: string; code: string; name: string };
  branches: { branchId: string; isDefault: boolean }[];
}

export interface BranchDetail extends Branch {
  email: string | null;
  taxCode: string | null;
  timezone: string;
  businessDayCutoff: string;
  defaultDiningMinutes: number;
  receiptHeader: string | null;
  receiptFooter: string | null;
  openingHours: Record<string, unknown>;
  isActive: boolean;
  updatedAt?: string;
}

export interface PaymentMethodInfo {
  method: string;
  provider: string;
  displayName: string;
  simulated: boolean;
}

export interface KitchenReport {
  from: string;
  to: string;
  ticketCount: number;
  stations: { stationCode: string; tickets: number; avgMinutes: number; p90Minutes: number; maxMinutes: number }[];
  slowestItems: { name: string; stationCode: string; count: number; avgMinutes: number }[];
}

export interface KeyAgg {
  key: string;
  count: number;
  amount: number;
}

export interface DiscountsVoidsReport {
  from: string;
  to: string;
  discounts: { total: number; count: number; byKind: KeyAgg[]; byStaff: KeyAgg[] };
  voids: { total: number; count: number; wasted: number; byReason: KeyAgg[]; byStaff: KeyAgg[]; byItem: KeyAgg[] };
}

export interface ShiftReportRow {
  id: string;
  branch: string;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  closedAt: string | null;
  openedBy: string | null;
  closedBy: string | null;
  openingCash: number;
  expectedCash: number | null;
  closingCashCounted: number | null;
  variance: number | null;
  bills: number;
  payments: number;
  notes: string | null;
}

export interface SalesReport {
  groupBy: SalesGroupBy;
  from: string;
  to: string;
  rows: SalesRow[];
  total: SalesRow;
}

export interface AuditLogRow {
  id: string;
  branchId: string | null;
  actorStaffId: string | null;
  deviceId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  ip: string | null;
  createdAt: string;
  actor: { id: string; code: string; fullName: string } | null;
}

export interface AuditPage {
  items: AuditLogRow[];
  page: number;
  pageSize: number;
  total: number;
}

export interface AuditFilter {
  page: number;
  pageSize: number;
  branchId?: string;
  actorStaffId?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  from?: string;
  to?: string;
}

// ───────── Khóa query ─────────

export const adminKeys = {
  menus: ['admin', 'menus'] as const,
  items: ['admin', 'menu-items'] as const,
  item: (id: string) => ['admin', 'menu-item', id] as const,
  modifierGroups: ['admin', 'modifier-groups'] as const,
  areas: (branchId: string) => ['admin', 'areas', branchId] as const,
  branch: (branchId: string) => ['admin', 'branch', branchId] as const,
  branches: ['admin', 'branches'] as const,
  stations: (branchId: string) => ['admin', 'stations', branchId] as const,
  printers: (branchId: string) => ['admin', 'printers', branchId] as const,
  devices: (branchId: string) => ['admin', 'devices', branchId] as const,
  roles: ['admin', 'roles'] as const,
  staff: ['admin', 'staff'] as const,
  paymentMethods: (branchId: string) => ['admin', 'payment-methods', branchId] as const,
  report: (name: string, params: Record<string, unknown>) => ['admin', 'report', name, params] as const,
  audit: (f: AuditFilter) => ['admin', 'audit', f] as const,
};

// ───────── Hooks đọc ─────────

export const useAdminMenus = () => useQuery({ queryKey: adminKeys.menus, queryFn: () => get<AdminMenu[]>('/menus') });
export const useAdminItems = () => useQuery({ queryKey: adminKeys.items, queryFn: () => get<AdminMenuItem[]>('/menu-items') });
export const useAdminItem = (id: string | null) => useQuery({ queryKey: adminKeys.item(id ?? ''), queryFn: () => get<AdminMenuItem>(`/menu-items/${id}`), enabled: !!id });
export const useModifierGroups = () => useQuery({ queryKey: adminKeys.modifierGroups, queryFn: () => get<AdminModifierGroup[]>('/modifier-groups') });

export const useAdminAreas = (branchId: string) => useQuery({ queryKey: adminKeys.areas(branchId), queryFn: () => get<AdminArea[]>(`/branches/${branchId}/areas`), enabled: !!branchId });
export const useBranchDetail = (branchId: string) => useQuery({ queryKey: adminKeys.branch(branchId), queryFn: () => get<BranchDetail>(`/branches/${branchId}`), enabled: !!branchId });
export const useAdminStations = (branchId: string) => useQuery({ queryKey: adminKeys.stations(branchId), queryFn: () => get<AdminStation[]>(`/branches/${branchId}/stations`), enabled: !!branchId });
export const useAdminPrinters = (branchId: string, enabled = true) => useQuery({ queryKey: adminKeys.printers(branchId), queryFn: () => get<AdminPrinter[]>(`/branches/${branchId}/printers`), enabled: !!branchId && enabled });
export const useAdminDevices = (branchId: string, enabled = true) => useQuery({ queryKey: adminKeys.devices(branchId), queryFn: () => get<AdminDevice[]>(`/branches/${branchId}/devices`), enabled: !!branchId && enabled });
export const useRoles = (enabled = true) => useQuery({ queryKey: adminKeys.roles, queryFn: () => get<AdminRole[]>('/roles'), enabled });
export const useAdminStaff = (enabled = true) => useQuery({ queryKey: adminKeys.staff, queryFn: () => get<AdminStaff[]>('/staff'), enabled });
export const usePaymentMethods = (branchId: string) => useQuery({ queryKey: adminKeys.paymentMethods(branchId), queryFn: () => get<PaymentMethodInfo[]>(`/branches/${branchId}/payment-methods`), enabled: !!branchId });

function qs(params: Record<string, string | number | undefined | null>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : '';
}

export interface RangeParams {
  branchId?: string;
  from: string;
  to: string;
}

export const useRealtimeReport = (branchId?: string) =>
  useQuery({ queryKey: adminKeys.report('realtime', { branchId }), queryFn: () => get<RealtimeReport>(`/reports/realtime${qs({ branchId })}`), refetchInterval: 30_000 });
export const useSalesReport = (p: RangeParams & { groupBy: SalesGroupBy }) =>
  useQuery({ queryKey: adminKeys.report('sales', { ...p }), queryFn: () => get<SalesReport>(`/reports/sales${qs({ ...p })}`) });
export const useKitchenReport = (p: RangeParams) => useQuery({ queryKey: adminKeys.report('kitchen', { ...p }), queryFn: () => get<KitchenReport>(`/reports/kitchen${qs({ ...p })}`) });
export const useDiscountsVoidsReport = (p: RangeParams) => useQuery({ queryKey: adminKeys.report('dv', { ...p }), queryFn: () => get<DiscountsVoidsReport>(`/reports/discounts-voids${qs({ ...p })}`) });
export const useShiftsReport = (p: RangeParams) => useQuery({ queryKey: adminKeys.report('shifts', { ...p }), queryFn: () => get<ShiftReportRow[]>(`/reports/shifts${qs({ ...p })}`) });

export const useAuditLogs = (f: AuditFilter) =>
  useQuery({
    queryKey: adminKeys.audit(f),
    queryFn: () => get<AuditPage>(`/audit-logs${qs({ ...f, from: f.from ? new Date(f.from).toISOString() : undefined, to: f.to ? new Date(f.to).toISOString() : undefined })}`),
    placeholderData: (prev) => prev,
  });

// ───────── Lệnh ghi ─────────

export type MenuBody = Partial<Pick<AdminMenu, 'code' | 'name' | 'nameEn' | 'kind' | 'schedule' | 'sortOrder' | 'isActive'>> & { branchIds?: string[] };
export type CategoryBody = Partial<Omit<AdminCategory, 'id' | '_count'>>;
export type MenuItemBody = Partial<Omit<AdminMenuItem, 'id' | 'category' | 'variants' | 'modifierGroups' | 'overrides' | 'priceHistory'>> & {
  variants?: Omit<AdminVariant, 'id'>[];
  modifierGroupIds?: string[];
  priceChangeReason?: string;
};
export type ModifierGroupBody = Omit<AdminModifierGroup, 'id' | 'options' | '_count'> & { options: Omit<AdminModifierOption, 'id'>[] };
export interface OverrideBody {
  price?: number | null;
  stationCode?: string | null;
  isAvailable?: boolean;
  stockLimit?: number | null;
}
export type TableBody = Partial<Omit<AdminTable, 'id' | 'qrToken'>>;
export type AreaBody = Partial<Omit<AdminArea, 'id' | 'tables'>>;
export interface LayoutEntry {
  id: string;
  posX: number;
  posY: number;
  width?: number;
  height?: number;
  rotation?: number;
}

export const menuAdminApi = {
  createMenu: (body: MenuBody) => post<AdminMenu>('/menus', body),
  updateMenu: (id: string, body: MenuBody) => patch<AdminMenu>(`/menus/${id}`, body),
  createCategory: (body: CategoryBody) => post<AdminCategory>('/menu-categories', body),
  updateCategory: (id: string, body: CategoryBody) => patch<AdminCategory>(`/menu-categories/${id}`, body),
  createItem: (body: MenuItemBody) => post<AdminMenuItem>('/menu-items', body),
  updateItem: (id: string, body: MenuItemBody) => patch<AdminMenuItem>(`/menu-items/${id}`, body),
  createGroup: (body: ModifierGroupBody) => post<AdminModifierGroup>('/modifier-groups', body),
  updateGroup: (id: string, body: ModifierGroupBody) => put<AdminModifierGroup>(`/modifier-groups/${id}`, body),
  setOverride: (branchId: string, itemId: string, body: OverrideBody) => put<AdminOverride>(`/branches/${branchId}/menu-items/${itemId}/override`, body),
  soldOut: (branchId: string, itemId: string, mode: 'today' | 'indefinite' | 'clear') => post(`/branches/${branchId}/menu-items/${itemId}/sold-out`, { mode }),
};

export const floorAdminApi = {
  createArea: (branchId: string, body: AreaBody) => post<AdminArea>(`/branches/${branchId}/areas`, body),
  updateArea: (branchId: string, id: string, body: AreaBody) => patch<AdminArea>(`/branches/${branchId}/areas/${id}`, body),
  createTable: (branchId: string, body: TableBody) => post<AdminTable>(`/branches/${branchId}/tables`, body),
  updateTable: (branchId: string, id: string, body: TableBody) => patch<AdminTable>(`/branches/${branchId}/tables/${id}`, body),
  saveLayout: (branchId: string, tables: LayoutEntry[]) => put<AdminArea[]>(`/branches/${branchId}/tables/layout`, { tables }),
  rotateQr: (branchId: string, id: string) => post<AdminTable>(`/branches/${branchId}/tables/${id}/rotate-qr`),
};

export const staffAdminApi = {
  createStaff: (body: Record<string, unknown>) => post<AdminStaff>('/staff', body),
  updateStaff: (id: string, body: Record<string, unknown>) => patch<AdminStaff>(`/staff/${id}`, body),
  createRole: (body: { code: string; name: string; permissions: string[] }) => post<AdminRole>('/roles', body),
  updateRole: (id: string, body: { code?: string; name?: string; permissions?: string[] }) => patch<AdminRole>(`/roles/${id}`, body),
  registerDevice: (body: { branchId: string; name: string; kind: DeviceKind; defaultStationId?: string }) =>
    post<{ device: { id: string; name: string; kind: DeviceKind; branchId: string }; deviceToken: string }>('/auth/devices', body),
  revokeDevice: (id: string) => del(`/auth/devices/${id}`),
};

export const settingsAdminApi = {
  updateBranch: (branchId: string, body: Record<string, unknown>) => patch<BranchDetail>(`/branches/${branchId}`, body),
  createStation: (branchId: string, body: Record<string, unknown>) => post<AdminStation>(`/branches/${branchId}/stations`, body),
  updateStation: (branchId: string, id: string, body: Record<string, unknown>) => patch<AdminStation>(`/branches/${branchId}/stations/${id}`, body),
  createPrinter: (branchId: string, body: Record<string, unknown>) => post<AdminPrinter>(`/branches/${branchId}/printers`, body),
  updatePrinter: (branchId: string, id: string, body: Record<string, unknown>) => patch<AdminPrinter>(`/branches/${branchId}/printers/${id}`, body),
  testPrinter: (branchId: string, id: string) => post(`/branches/${branchId}/printers/${id}/test`),
};

// ───────── Tải tệp / tải xuống (cần Bearer, không qua JSON) ─────────

async function authorizedFetch(url: string, init: RequestInit): Promise<Response> {
  const run = () => {
    const token = useAuth.getState().accessToken;
    const headers = new Headers(init.headers);
    if (token) headers.set('authorization', `Bearer ${token}`);
    return fetch(url, { ...init, headers });
  };
  let res: Response;
  try {
    res = await run();
    if (res.status === 401) {
      // Gọi một API JSON để kích hoạt làm mới token, rồi thử lại.
      await get('/auth/me').catch(() => undefined);
      res = await run();
    }
  } catch {
    throw new ApiError(0, 'NETWORK', 'Không kết nối được máy chủ. Kiểm tra mạng.');
  }
  if (!res.ok) {
    let message = 'Có lỗi xảy ra';
    let code = 'HTTP_ERROR';
    try {
      const j = (await res.json()) as { message?: string; code?: string };
      message = j.message ?? message;
      code = j.code ?? code;
    } catch {
      /* bỏ qua */
    }
    throw new ApiError(res.status, code, message);
  }
  return res;
}

/** Tải ảnh lên `POST /uploads` (multipart, trường `file`). */
export async function uploadFile(file: File, folder = 'menu'): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', file);
  const res = await authorizedFetch(`${API_BASE}/uploads?folder=${encodeURIComponent(folder)}`, { method: 'POST', body: form });
  return (await res.json()) as UploadResult;
}

/** Tải CSV báo cáo (gửi Bearer) và lưu về máy. */
export async function downloadReportCsv(params: Record<string, string | undefined>): Promise<void> {
  const res = await authorizedFetch(`${API_BASE}/reports/export.csv${qs(params)}`, { method: 'GET' });
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') ?? '';
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const filename = match?.[1] ?? `bao-cao-${params.report ?? 'sales'}-${params.from}-${params.to}.csv`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const QR_BASE_URL = 'https://menu.dalan.com.vn/q/';
export const tableQrUrl = (token: string) => `${QR_BASE_URL}${token}`;
