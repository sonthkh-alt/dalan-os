import { cn } from '../lib/format';

const LINE: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: 'Nháp', tone: 'bg-cream-dark text-ink-muted' },
  PENDING_CONFIRM: { label: 'Chờ xác nhận', tone: 'bg-warn-soft text-warn' },
  SENT: { label: 'Bếp đã nhận', tone: 'bg-cream-dark text-ink-soft' },
  HOLD: { label: 'Giữ lại', tone: 'bg-cream-dark text-ink-soft' },
  PREPARING: { label: 'Đang làm', tone: 'bg-warn-soft text-warn' },
  READY: { label: 'Sẵn sàng', tone: 'bg-success-soft text-success' },
  SERVED: { label: 'Đã ra bàn', tone: 'bg-success text-white' },
  VOIDED: { label: 'Đã hủy', tone: 'bg-line text-ink-muted line-through' },
  CANCELLED: { label: 'Đã hủy', tone: 'bg-line text-ink-muted line-through' },
};

export function LineStatusBadge({ status, orderStatus }: { status: string; orderStatus?: string }) {
  const key = orderStatus === 'PENDING_CONFIRM' ? 'PENDING_CONFIRM' : status;
  const s = LINE[key] ?? LINE.SENT!;
  return (
    <span
      className={cn('inline-block shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold', s.tone)}
    >
      {s.label}
    </span>
  );
}

const BILL: Record<string, { label: string; tone: string }> = {
  OPEN: { label: 'Chờ thanh toán', tone: 'bg-maroon-soft text-maroon' },
  PARTIALLY_PAID: { label: 'Đã trả một phần', tone: 'bg-warn-soft text-warn' },
  PAID: { label: 'Đã thanh toán', tone: 'bg-success text-white' },
  VOID: { label: 'Đã hủy', tone: 'bg-line text-ink-muted' },
};

export function BillStatusBadge({ status }: { status: string }) {
  const s = BILL[status] ?? BILL.OPEN!;
  return (
    <span className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-semibold', s.tone)}>
      {s.label}
    </span>
  );
}

const RESERVATION: Record<string, { label: string; tone: string }> = {
  PENDING: { label: 'Chờ xác nhận', tone: 'bg-warn-soft text-warn' },
  CONFIRMED: { label: 'Đã xác nhận', tone: 'bg-success-soft text-success' },
  WAITLIST: { label: 'Danh sách chờ', tone: 'bg-warn-soft text-warn' },
  SEATED: { label: 'Đã nhận bàn', tone: 'bg-success text-white' },
  COMPLETED: { label: 'Hoàn tất', tone: 'bg-cream-dark text-ink-soft' },
  CANCELLED: { label: 'Đã hủy', tone: 'bg-line text-ink-muted' },
  NO_SHOW: { label: 'Không đến', tone: 'bg-line text-ink-muted' },
};

export function ReservationStatusBadge({ status }: { status: string }) {
  const s = RESERVATION[status] ?? { label: status, tone: 'bg-cream-dark text-ink-soft' };
  return (
    <span className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-semibold', s.tone)}>
      {s.label}
    </span>
  );
}
