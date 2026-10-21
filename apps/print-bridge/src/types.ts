/** Kiểu dữ liệu trao đổi với API (khớp PrintingService.bridgePull và các payload enqueue). */

export type PrintJobKind =
  | 'KITCHEN_TICKET'
  | 'KITCHEN_VOID'
  | 'BILL_PROVISIONAL'
  | 'BILL_FINAL'
  | 'SHIFT_REPORT'
  | 'DEPOSIT_RECEIPT'
  | 'TEST'
  | 'LABEL';

export interface PrinterDto {
  id: string;
  code: string;
  name: string;
  kind: 'RECEIPT' | 'KITCHEN' | 'LABEL';
  connection: 'NETWORK' | 'USB' | 'BLUETOOTH';
  address: string | null;
  paperWidthMm: number;
  isActive?: boolean;
}

export interface PrintJobDto {
  id: string;
  branchId: string;
  printerId: string;
  kind: PrintJobKind;
  payload: Record<string, unknown>;
  status?: string;
  attempts?: number;
  refType?: string | null;
  refId?: string | null;
  createdAt?: string;
  printer?: PrinterDto;
  /** Job tạo tại chỗ (chế độ khẩn cấp), không báo kết quả về API */
  local?: boolean;
}

export interface ModifierSnapshot {
  groupCode: string;
  groupName: string;
  optionCode: string;
  optionName: string;
  priceDelta: number;
}

export interface KitchenTicketPayload {
  branchName?: string;
  stationName?: string;
  stationCode: string;
  ticketSeq: number;
  sessionCode: string;
  tableNames: string;
  guestCount: number;
  course: number;
  firedAt: string;
  lines: { id: string; name: string; quantity: number; unit: string; modifiers: ModifierSnapshot[] | unknown; note: string | null; course: number }[];
}

export interface KitchenVoidPayload {
  stationName?: string;
  sessionCode?: string;
  tableNames?: string;
  name: string;
  quantity: number;
  reason: string;
  at: string;
}

export interface BillPayload {
  kind: 'BILL_PROVISIONAL' | 'BILL_FINAL';
  branch: { name: string; address: string | null; phone: string | null; taxCode: string | null; header: string | null; footer: string | null };
  bill: {
    code: string;
    createdAt: string;
    closedAt: string | null;
    printedCount: number;
    printedBy?: string;
    sessionCode: string;
    tableNames: string;
    guestCount: number;
    openedAt: string;
  };
  lines: { name: string; unit: string; quantity: number; unitPrice: number; modifiers: ModifierSnapshot[] | unknown; amount: number; discount: number }[];
  totals: {
    subtotal: number;
    lineDiscount: number;
    billDiscount: number;
    serviceChargeBps: number;
    serviceCharge: number;
    vat: number;
    taxBreakdown: { rateBps: number; taxable: number; vat: number }[] | unknown;
    rounding: number;
    total: number;
    paid: number;
    due: number;
    priceIncludesVat: boolean;
  };
  discounts: { kind: string; amount: number; reason: string | null }[];
  payments: { method: string; subMethod: string | null; amount: number; tendered: number | null; change: number }[];
  vietqr: { payload: string; bankBin: string | null; accountNo: string | null; accountName: string | null; purpose: string; amount: number } | null;
  eInvoice: { lookupUrl: string | null; lookupCode: string | null; invoiceNo: string | null } | null;
}

export interface ShiftReportPayload {
  shift: {
    id: string;
    branchId: string;
    openedAt: string;
    closedAt: string | null;
    openingCash: number;
    expectedCash?: number | null;
    closingCashCounted?: number | null;
    variance?: number | null;
    notes?: string | null;
  };
  expectedCash: number;
  revenue: number;
  billCount: number;
  discounts: number;
  voids: { count: number; amount: number };
  byMethod: Record<string, { count: number; amount: number; refunded: number }>;
  cashIn: number;
  cashOut: number;
  closedBy?: string;
}

export interface DepositReceiptPayload {
  branch?: { name?: string; address?: string | null; phone?: string | null };
  receipt: { code: string; at: string; receivedBy?: string };
  customer: { name: string; phone?: string | null };
  reference: { type: string; code: string; eventDate?: string | null; description?: string | null };
  amount: number;
  method: string;
  note?: string | null;
}

export interface TestPayload {
  message: string;
  at: string;
  printer?: string;
}

export interface LabelPayload {
  name: string;
  modifiers?: ModifierSnapshot[] | string[];
  note?: string | null;
  tableNames?: string;
  index?: number;
  total?: number;
}
