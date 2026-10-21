import { EVENT_TRANSITIONS, type EventStatus as DomainEventStatus } from '@dalan/domain';
import type { AdjustmentKind, EventStatus } from '@/lib/queries-ops';

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

export const EVENT_STATUS: Record<EventStatus, { label: string; tone: Tone; column: string }> = {
  LEAD: { label: 'Yêu cầu mới', tone: 'neutral', column: 'border-t-ink-300' },
  QUOTED: { label: 'Đã báo giá', tone: 'info', column: 'border-t-sky-500' },
  CONTRACTED: { label: 'Đã ký hợp đồng', tone: 'brand', column: 'border-t-brand-600' },
  CONFIRMED: { label: 'Đã chốt', tone: 'warning', column: 'border-t-amber-500' },
  BEO_ISSUED: { label: 'Đã phát hành BEO', tone: 'success', column: 'border-t-emerald-500' },
  IN_PROGRESS: { label: 'Đang diễn ra', tone: 'danger', column: 'border-t-red-500' },
  SETTLED: { label: 'Đã quyết toán', tone: 'success', column: 'border-t-emerald-700' },
  CLOSED: { label: 'Đã đóng', tone: 'neutral', column: 'border-t-ink-500' },
  CANCELLED: { label: 'Đã hủy', tone: 'neutral', column: 'border-t-ink-100' },
};

export const PIPELINE: EventStatus[] = ['LEAD', 'QUOTED', 'CONTRACTED', 'CONFIRMED', 'BEO_ISSUED', 'IN_PROGRESS', 'SETTLED', 'CLOSED'];

export const LAYOUT_LABELS: Record<string, string> = {
  round10: 'Bàn tròn 10',
  round6: 'Bàn tròn 6',
  theater: 'Hội nghị (rạp hát)',
  classroom: 'Lớp học',
  standing: 'Tiệc đứng',
};

export const BEVERAGE_LABELS: Record<string, string> = {
  PACKAGE: 'Gói trọn',
  ACTUAL: 'Tính theo thực tế (đếm vỏ)',
  BYO: 'Khách mang vào (phí khui)',
  MIXED: 'Kết hợp',
};

export const ADJ_LABELS: Record<AdjustmentKind, string> = {
  EXTRA_TABLE: 'Mâm phát sinh',
  BEVERAGE: 'Đồ uống (đếm vỏ)',
  SERVICE: 'Dịch vụ phát sinh',
  DAMAGE: 'Hỏng vỡ',
  DISCOUNT: 'Giảm giá thiện chí',
  OTHER: 'Khác',
};

export const EVENT_PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: 'CASH', label: 'Tiền mặt' },
  { value: 'BANK_TRANSFER', label: 'Chuyển khoản / VietQR' },
  { value: 'CARD_TERMINAL', label: 'Thẻ (máy POS)' },
];

export const PAYMENT_KIND_LABELS: Record<string, string> = { DEPOSIT: 'Đặt cọc', BALANCE: 'Thanh toán còn lại', REFUND: 'Hoàn tiền' };

export const DEPOSIT_ROW_STATUS: Record<string, { label: string; tone: Tone }> = {
  DUE: { label: 'Chờ thu', tone: 'warning' },
  PAID: { label: 'Đã thu', tone: 'success' },
  OVERDUE: { label: 'Quá hạn', tone: 'danger' },
  WAIVED: { label: 'Miễn / gộp quyết toán', tone: 'neutral' },
};

/**
 * Thao tác chuyển trạng thái. Chỉ hiển thị khi EVENT_TRANSITIONS cho phép từ trạng thái hiện tại
 * (QUOTED → LEAD dùng lệnh reopen-lead: báo giá đang mở bị từ chối để báo giá lại).
 */
export type EventAction = { to: DomainEventStatus; label: string; tab?: string; direct?: 'start' | 'settle' | 'close' | 'cancel' | 'reopen' };
const ACTIONS: Partial<Record<DomainEventStatus, Omit<EventAction, 'to'>>> = {
  LEAD: { label: 'Mở lại để báo giá lại', direct: 'reopen' },
  QUOTED: { label: 'Lập báo giá', tab: 'quote' },
  CONTRACTED: { label: 'Ký hợp đồng', tab: 'contract' },
  CONFIRMED: { label: 'Chốt mâm', tab: 'confirm' },
  BEO_ISSUED: { label: 'Phát hành BEO', tab: 'beo' },
  IN_PROGRESS: { label: 'Bắt đầu tiệc', direct: 'start' },
  SETTLED: { label: 'Quyết toán', tab: 'settle' },
  CLOSED: { label: 'Đóng hồ sơ', direct: 'close' },
  CANCELLED: { label: 'Hủy tiệc', direct: 'cancel' },
};

export function nextActions(status: EventStatus): EventAction[] {
  const targets = EVENT_TRANSITIONS[status as DomainEventStatus] ?? [];
  return targets.flatMap((to) => {
    const a = ACTIONS[to];
    if (!a) return [];
    // Từ BEO_ISSUED quay lại CONFIRMED = chốt lại số mâm (lệnh confirm hợp lệ theo bảng chuyển trạng thái)
    if (status === 'BEO_ISSUED' && to === 'CONFIRMED') return [{ to, ...a, label: 'Chốt lại số mâm' }];
    return [{ to, ...a }];
  });
}

export function canGo(status: EventStatus, to: EventStatus): boolean {
  return EVENT_TRANSITIONS[status as DomainEventStatus]?.includes(to as DomainEventStatus) ?? false;
}

/** Trạng thái còn sửa được thực đơn, dịch vụ (theo API). */
export const EDITABLE_MENU: EventStatus[] = ['LEAD', 'QUOTED', 'CONTRACTED', 'CONFIRMED', 'BEO_ISSUED'];
export const ADJUSTABLE: EventStatus[] = ['CONFIRMED', 'BEO_ISSUED', 'IN_PROGRESS'];
export const PAYABLE: EventStatus[] = ['QUOTED', 'CONTRACTED', 'CONFIRMED', 'BEO_ISSUED', 'IN_PROGRESS', 'SETTLED'];
