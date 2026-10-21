/** Máy trạng thái của các thực thể vận hành. Mỗi bảng liệt kê các chuyển trạng thái hợp lệ. */

export type Transitions<S extends string> = Readonly<Record<S, readonly S[]>>;

export class InvalidTransitionError extends Error {
  constructor(
    public readonly entity: string,
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`${entity}: không thể chuyển từ ${from} sang ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export function canTransition<S extends string>(table: Transitions<S>, from: S, to: S): boolean {
  return table[from]?.includes(to) ?? false;
}

export function assertTransition<S extends string>(entity: string, table: Transitions<S>, from: S, to: S): void {
  if (!canTransition(table, from, to)) throw new InvalidTransitionError(entity, from, to);
}

export type SessionStatus = 'PENDING' | 'OPEN' | 'BILL_REQUESTED' | 'CLOSED' | 'CANCELLED';
export const SESSION_TRANSITIONS: Transitions<SessionStatus> = {
  PENDING: ['OPEN', 'CANCELLED'],
  OPEN: ['BILL_REQUESTED', 'CLOSED', 'CANCELLED'],
  BILL_REQUESTED: ['OPEN', 'CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

export type OrderLineStatus = 'DRAFT' | 'SENT' | 'HOLD' | 'PREPARING' | 'READY' | 'SERVED' | 'VOIDED' | 'CANCELLED';
export const ORDER_LINE_TRANSITIONS: Transitions<OrderLineStatus> = {
  DRAFT: ['SENT', 'HOLD', 'CANCELLED'],
  SENT: ['HOLD', 'PREPARING', 'READY', 'SERVED', 'VOIDED'],
  HOLD: ['SENT', 'VOIDED', 'CANCELLED'],
  PREPARING: ['READY', 'SERVED', 'VOIDED'],
  READY: ['SERVED', 'PREPARING', 'VOIDED'],
  SERVED: ['VOIDED'],
  VOIDED: [],
  CANCELLED: [],
};

/** Trạng thái dòng đã gửi bếp (dùng để quyết định hủy có cần duyệt / có hao phí). */
export const SENT_TO_KITCHEN: ReadonlySet<OrderLineStatus> = new Set(['SENT', 'PREPARING', 'READY', 'SERVED']);

export type TicketStatus = 'NEW' | 'IN_PROGRESS' | 'DONE' | 'RECALLED' | 'VOIDED';
export const TICKET_TRANSITIONS: Transitions<TicketStatus> = {
  NEW: ['IN_PROGRESS', 'DONE', 'VOIDED'],
  IN_PROGRESS: ['DONE', 'VOIDED', 'NEW'],
  DONE: ['RECALLED'],
  RECALLED: ['IN_PROGRESS', 'DONE'],
  VOIDED: [],
};

export type BillStatus = 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'VOID';
export const BILL_TRANSITIONS: Transitions<BillStatus> = {
  OPEN: ['PARTIALLY_PAID', 'PAID', 'VOID'],
  PARTIALLY_PAID: ['PAID', 'VOID', 'OPEN'],
  PAID: [],
  VOID: [],
};

export type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'SEATED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW' | 'WAITLIST';
export const RESERVATION_TRANSITIONS: Transitions<ReservationStatus> = {
  PENDING: ['CONFIRMED', 'CANCELLED', 'WAITLIST'],
  WAITLIST: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['SEATED', 'CANCELLED', 'NO_SHOW'],
  SEATED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export type EventStatus =
  | 'LEAD'
  | 'QUOTED'
  | 'CONTRACTED'
  | 'CONFIRMED'
  | 'BEO_ISSUED'
  | 'IN_PROGRESS'
  | 'SETTLED'
  | 'CLOSED'
  | 'CANCELLED';
export const EVENT_TRANSITIONS: Transitions<EventStatus> = {
  LEAD: ['QUOTED', 'CANCELLED'],
  QUOTED: ['CONTRACTED', 'LEAD', 'CANCELLED'],
  CONTRACTED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['BEO_ISSUED', 'CANCELLED'],
  BEO_ISSUED: ['IN_PROGRESS', 'CONFIRMED', 'CANCELLED'],
  IN_PROGRESS: ['SETTLED'],
  SETTLED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

export type PaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'CANCELLED';
export const PAYMENT_TRANSITIONS: Transitions<PaymentStatus> = {
  PENDING: ['SUCCEEDED', 'FAILED', 'CANCELLED'],
  SUCCEEDED: ['PARTIALLY_REFUNDED', 'REFUNDED'],
  PARTIALLY_REFUNDED: ['REFUNDED'],
  REFUNDED: [],
  FAILED: [],
  CANCELLED: [],
};
