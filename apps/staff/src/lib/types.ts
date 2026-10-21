/** Kiểu dữ liệu trả về từ API (số tiền đã chuyển sang number). */
import type { BranchMenuView, TableDisplayStatus } from '@dalan/contracts';

export type { BranchMenuView, BranchMenuItemView } from '@dalan/contracts';

export interface Branch {
  id: string;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  vatRateBps: number;
  priceIncludesVat: boolean;
  serviceChargeBps: number;
  rounding: 'NONE' | 'TO_500' | 'TO_1000';
  qrOrderMode: 'DIRECT' | 'STAFF_CONFIRM';
  guestJoinMode: 'OPEN' | 'PIN' | 'STAFF';
  bankBin: string | null;
  bankAccountNo: string | null;
  bankAccountName: string | null;
  settings: Record<string, unknown>;
}

export interface FloorSessionSummary {
  id: string;
  code: string;
  status: SessionStatus;
  guestCount: number;
  openedAt: string;
  serverId: string | null;
  tableIds: string[];
  linesSent: number;
  linesReady: number;
  openRequests: number;
  total: number;
}

export interface FloorTable {
  id: string;
  code: string;
  name: string;
  minSeats: number;
  maxSeats: number;
  shape: string;
  posX: number;
  posY: number;
  width: number;
  height: number;
  rotation: number;
  isPrivateRoom: boolean;
  status: TableDisplayStatus;
  session: FloorSessionSummary | null;
}

export interface FloorArea {
  id: string;
  code: string;
  name: string;
  kind: string;
  floor: number | null;
  tables: FloorTable[];
}

export interface FloorView {
  branch: { id: string; code: string; name: string; serviceChargeBps: number };
  generatedAt: string;
  areas: FloorArea[];
}

export type SessionStatus = 'PENDING' | 'OPEN' | 'BILL_REQUESTED' | 'CLOSED' | 'CANCELLED';
export type LineStatus = 'DRAFT' | 'SENT' | 'HOLD' | 'PREPARING' | 'READY' | 'SERVED' | 'VOIDED' | 'CANCELLED';
export type OrderStatus = 'DRAFT' | 'PENDING_CONFIRM' | 'SENT' | 'CANCELLED';

export interface ModifierSnapshot {
  groupCode: string;
  groupName: string;
  optionCode: string;
  optionName: string;
  priceDelta: number;
}

export interface OrderLine {
  id: string;
  orderId: string;
  itemId: string | null;
  variantId: string | null;
  nameSnapshot: string;
  nameEnSnapshot: string | null;
  unitSnapshot: string;
  unitPrice: number;
  quantity: number;
  expectedWeightKg: number | null;
  weightKg: number | null;
  modifiersSnapshot: ModifierSnapshot[];
  modifiersTotal: number;
  lineTotal: number;
  vatRateBps: number;
  stationCode: string | null;
  course: number;
  status: LineStatus;
  note: string | null;
  participantId: string | null;
  seatNo: number | null;
  isCountedEmpties: boolean;
  isAdjustment: boolean;
  sentAt: string | null;
  readyAt: string | null;
  servedAt: string | null;
  voidReason: string | null;
  createdAt: string;
}

export interface Order {
  id: string;
  seq: number;
  source: 'STAFF' | 'GUEST' | 'PREORDER' | 'SYSTEM';
  status: OrderStatus;
  placedById: string | null;
  placedByParticipantId: string | null;
  notes: string | null;
  sentAt: string | null;
  createdAt: string;
  lines: OrderLine[];
}

export interface ServiceRequest {
  id: string;
  sessionId: string;
  tableId: string | null;
  kind: 'CALL_STAFF' | 'WATER' | 'UTENSILS' | 'BILL' | 'OTHER';
  note: string | null;
  status: 'OPEN' | 'ACKED' | 'DONE';
  createdAt: string;
  table?: { name: string } | null;
  session?: { code: string } | null;
}

export interface SessionTotals {
  subtotal: number;
  lineDiscountTotal: number;
  billDiscountTotal: number;
  minSpendSurcharge: number;
  serviceChargeBps: number;
  serviceChargeAmount: number;
  vatAmount: number;
  total: number;
}

export interface SessionDetail {
  id: string;
  branchId: string;
  code: string;
  status: SessionStatus;
  source: string;
  guestCount: number;
  openedAt: string;
  closedAt: string | null;
  serverId: string | null;
  customerId: string | null;
  joinPin: string | null;
  notes: string | null;
  branch: { id: string; code: string; name: string; vatRateBps: number; priceIncludesVat: boolean; serviceChargeBps: number; rounding: string; qrOrderMode: string; guestJoinMode: string };
  tables: { tableId: string; table: { id: string; code: string; name: string; isPrivateRoom: boolean; minSpend: number | null; area: { id: string; name: string; serviceChargeBps: number | null; minSpend: number | null } } }[];
  participants: { id: string; nickname: string | null; isHost: boolean; joinedAt: string }[];
  orders: Order[];
  bills: { id: string; code: string; status: BillStatus; total: number; paidTotal: number; splitType: string; createdAt: string }[];
  requests: ServiceRequest[];
  customer: { id: string; fullName: string | null; phone: string; pointsBalance: number; tags: string[]; allergies: string | null; preferences: string | null } | null;
  totals: SessionTotals;
}

export type BillStatus = 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'VOID';
export type PaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'CANCELLED';

export interface Payment {
  id: string;
  method: string;
  subMethod: string | null;
  provider: string | null;
  amount: number;
  tenderedAmount: number | null;
  changeAmount: number;
  status: PaymentStatus;
  externalRef: string | null;
  qrPayload: string | null;
  cardLast4: string | null;
  approvalCode: string | null;
  paidAt: string | null;
  createdAt: string;
  refunds: { id: string; amount: number; status: string; reason: string }[];
}

export interface BillDetail {
  id: string;
  sessionId: string;
  branchId: string;
  code: string;
  status: BillStatus;
  splitType: string;
  subtotal: number;
  lineDiscountTotal: number;
  billDiscountTotal: number;
  serviceChargeBps: number;
  serviceChargeAmount: number;
  vatAmount: number;
  taxBreakdown: { rateBps: number; taxable: number; vat: number }[];
  roundingAdjustment: number;
  total: number;
  paidTotal: number;
  due: number;
  printedCount: number;
  taxInvoiceInfo: { buyerName: string; buyerTaxCode?: string; buyerAddress?: string; buyerEmail?: string; buyerPhone?: string } | null;
  closedAt: string | null;
  createdAt: string;
  branch: { id: string; code: string; name: string; bankBin: string | null; bankAccountNo: string | null; bankAccountName: string | null; priceIncludesVat: boolean };
  session: { id: string; code: string; guestCount: number; openedAt: string; tables: { table: { name: string } }[]; participants: { id: string; nickname: string | null }[] };
  lines: { id: string; quantityShare: number; amount: number; discountAmount: number; vatRateBps: number; vatAmount: number; orderLine: { id: string; nameSnapshot: string; unitSnapshot: string; quantity: number; unitPrice: number; modifiersSnapshot: ModifierSnapshot[]; lineTotal: number; participantId: string | null; isAdjustment: boolean } }[];
  discounts: { id: string; kind: string; valueBps: number | null; amount: number; reason: string | null; createdAt: string }[];
  payments: Payment[];
  customer: { id: string; fullName: string | null; phone: string; pointsBalance: number } | null;
  eInvoice: { id: string; status: string; invoiceNo: string | null; lookupUrl: string | null } | null;
}

export interface AddPaymentResult {
  bill: BillDetail;
  payment: Payment & { qrDataUrl: string | null; bank: { bin: string | null; accountNo: string | null; accountName: string | null; purpose: string } | null };
}

export interface KdsTicketLine {
  id: string;
  orderLineId: string;
  status: 'NEW' | 'IN_PROGRESS' | 'DONE' | 'VOIDED';
  name: string;
  unit: string;
  quantity: number;
  weightKg: number | null;
  modifiers: ModifierSnapshot[];
  note: string | null;
  course: number;
  seatNo: number | null;
  lineStatus: LineStatus;
}

export interface KdsTicket {
  id: string;
  seq: number;
  status: 'NEW' | 'IN_PROGRESS' | 'DONE' | 'RECALLED' | 'VOIDED';
  course: number;
  priority: number;
  firedAt: string;
  startedAt: string | null;
  bumpedAt: string | null;
  ageMinutes: number;
  ageLevel: 'ok' | 'warn' | 'late';
  station: { code: string; name: string; color: string | null };
  sessionCode: string;
  guestCount: number;
  tableNames: string[];
  isVip: boolean;
  orderSeq: number;
  orderSource: string;
  orderNotes: string | null;
  lines: KdsTicketLine[];
}

export interface Station {
  id: string;
  code: string;
  name: string;
  mode: 'KDS' | 'PRINTER' | 'BOTH';
  color: string | null;
}

export interface ShiftSummary {
  shift: { id: string; status: 'OPEN' | 'CLOSED'; openedAt: string; closedAt: string | null; openingCash: number; expectedCash: number | null; closingCashCounted: number | null; variance: number | null; notes: string | null; cashMovements: { id: string; kind: 'IN' | 'OUT'; amount: number; reason: string; note: string | null; createdAt: string }[] };
  expectedCash: number;
  revenue: number;
  billCount: number;
  discounts: number;
  voids: { count: number; amount: number };
  byMethod: Record<string, { count: number; amount: number; refunded: number }>;
  cashIn: number;
  cashOut: number;
}

export interface DeviceStaff {
  device: { id: string; name: string; kind: string; branchId: string };
  staff: { id: string; code: string; fullName: string; avatarUrl: string | null; role: { code: string; name: string } }[];
}

export type MenuView = BranchMenuView;
