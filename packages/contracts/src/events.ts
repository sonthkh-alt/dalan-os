/** Tên các sự kiện miền phát qua outbox và realtime. Payload luôn có các khóa định tuyến khi liên quan. */
export const DomainEvents = {
  branchUpdated: 'branch.updated',
  menuChanged: 'menu.changed',
  itemSoldOut: 'menu.item.soldout',
  sessionOpened: 'session.opened',
  sessionUpdated: 'session.updated',
  sessionBillRequested: 'session.bill_requested',
  sessionClosed: 'session.closed',
  sessionCancelled: 'session.cancelled',
  sessionMerged: 'session.merged',
  sessionMoved: 'session.moved',
  orderCreated: 'order.created',
  orderPendingConfirm: 'order.pending_confirm',
  orderSent: 'order.sent',
  orderLineUpdated: 'order.line.updated',
  orderLineVoided: 'order.line.voided',
  orderLineReady: 'order.line.ready',
  orderLineServed: 'order.line.served',
  courseFired: 'order.course.fired',
  ticketCreated: 'kitchen.ticket.created',
  ticketStarted: 'kitchen.ticket.started',
  ticketDone: 'kitchen.ticket.done',
  ticketRecalled: 'kitchen.ticket.recalled',
  ticketVoided: 'kitchen.ticket.voided',
  serviceRequested: 'service.requested',
  serviceAcked: 'service.acked',
  serviceDone: 'service.done',
  billCreated: 'bill.created',
  billUpdated: 'bill.updated',
  billPaid: 'bill.paid',
  billVoided: 'bill.voided',
  paymentCreated: 'payment.created',
  paymentSucceeded: 'payment.succeeded',
  paymentFailed: 'payment.failed',
  paymentRefunded: 'payment.refunded',
  shiftOpened: 'shift.opened',
  shiftClosed: 'shift.closed',
  printJobCreated: 'print.job.created',
  printJobDone: 'print.job.done',
  reservationCreated: 'reservation.created',
  reservationUpdated: 'reservation.updated',
  customerPointsChanged: 'customer.points.changed',
  eventBookingUpdated: 'event.updated',
  invoiceIssued: 'invoice.issued',
} as const;

export type DomainEventType = (typeof DomainEvents)[keyof typeof DomainEvents];

export interface RealtimeEnvelope {
  id: string;
  seq: number;
  type: DomainEventType | string;
  aggregateType: string;
  aggregateId: string;
  branchId: string | null;
  payload: Record<string, unknown>;
  occurredAt: string;
}
