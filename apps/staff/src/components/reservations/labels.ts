import type { DepositStatus, ReservationStatus } from '@/lib/queries-ops';

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

export const RES_STATUS: Record<ReservationStatus, { label: string; tone: Tone; bar: string }> = {
  PENDING: { label: 'Chờ xác nhận', tone: 'warning', bar: 'bg-amber-100 border-amber-400 text-amber-900' },
  CONFIRMED: { label: 'Đã xác nhận', tone: 'info', bar: 'bg-sky-100 border-sky-500 text-sky-900' },
  SEATED: { label: 'Đã vào bàn', tone: 'success', bar: 'bg-emerald-100 border-emerald-500 text-emerald-900' },
  COMPLETED: { label: 'Hoàn tất', tone: 'neutral', bar: 'bg-ink-100 border-ink-300 text-ink-700' },
  CANCELLED: { label: 'Đã hủy', tone: 'neutral', bar: 'bg-white border-ink-300 text-ink-500 line-through' },
  NO_SHOW: { label: 'Không đến', tone: 'danger', bar: 'bg-red-50 border-red-400 text-red-800' },
  WAITLIST: { label: 'Danh sách chờ', tone: 'brand', bar: 'bg-brand-50 border-brand-400 text-brand-900 border-dashed' },
};

export const DEPOSIT_STATUS: Record<DepositStatus, { label: string; tone: Tone }> = {
  NOT_REQUIRED: { label: 'Không cọc', tone: 'neutral' },
  PENDING: { label: 'Chờ cọc', tone: 'warning' },
  PAID: { label: 'Đã cọc', tone: 'success' },
  REFUNDED: { label: 'Đã hoàn cọc', tone: 'info' },
  FORFEITED: { label: 'Mất cọc', tone: 'danger' },
};

export const SOURCE_LABELS: Record<string, string> = {
  PHONE: 'Điện thoại',
  WALK_IN: 'Khách vãng lai',
  STAFF: 'Nhân viên',
  WEB: 'Website',
  ZALO: 'Zalo',
  MINI_APP: 'Zalo Mini App',
};

/** Trạng thái còn hiệu lực (chiếm chỗ). */
export const ACTIVE_RES: ReservationStatus[] = ['PENDING', 'CONFIRMED', 'SEATED', 'WAITLIST'];
/** Trạng thái còn thao tác được (chưa vào bàn). */
export const OPEN_RES: ReservationStatus[] = ['PENDING', 'CONFIRMED', 'WAITLIST'];
