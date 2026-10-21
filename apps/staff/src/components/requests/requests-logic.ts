/** Logic thuần cho hàng đợi yêu cầu của khách: ngưỡng chờ và thứ tự ưu tiên. */
import type { ServiceRequest } from '@/lib/types';

/** Ngưỡng phản hồi yêu cầu khách (phút): quá 2′ vàng, quá 5′ đỏ (chuẩn phục vụ kiểu Haidilao). */
export const REQUEST_SLA = {
  WARN_MIN: 2,
  LATE_MIN: 5,
} as const;

/** Trọng số theo loại: xin tính tiền và gọi nhân viên cần đến trước. Đơn vị: phút cộng thêm. */
export const KIND_WEIGHT: Record<ServiceRequest['kind'], number> = {
  BILL: 4,
  CALL_STAFF: 3,
  OTHER: 1,
  WATER: 1,
  UTENSILS: 1,
};

export type RequestTone = 'ok' | 'warn' | 'late';

export function requestMinutes(r: Pick<ServiceRequest, 'createdAt'>, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(r.createdAt).getTime()) / 60_000));
}

export function requestTone(minutes: number): RequestTone {
  if (minutes >= REQUEST_SLA.LATE_MIN) return 'late';
  if (minutes >= REQUEST_SLA.WARN_MIN) return 'warn';
  return 'ok';
}

/** Điểm khẩn: thời gian chờ + trọng số loại; yêu cầu chưa ai nhận được cộng thêm. */
export function urgencyScore(r: ServiceRequest, now: Date): number {
  return requestMinutes(r, now) + KIND_WEIGHT[r.kind] + (r.status === 'OPEN' ? 3 : 0);
}

export function sortRequests(list: ServiceRequest[], now: Date): ServiceRequest[] {
  return list
    .filter((r) => r.status !== 'DONE')
    .slice()
    .sort((a, b) => urgencyScore(b, now) - urgencyScore(a, now) || a.createdAt.localeCompare(b.createdAt));
}
