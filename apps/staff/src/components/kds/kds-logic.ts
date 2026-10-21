/** Logic thuần cho màn hình bếp (KDS): ngưỡng thời gian, sắp xếp phiếu, bảng tổng món (all-day). */
import type { KdsTicket } from '@/lib/types';

/** Ngưỡng màu phiếu theo phút kể từ khi bắn phiếu: xanh < 10′, vàng < 15′, đỏ ≥ 15′. */
export const KDS_AGE = {
  WARN_MIN: 10,
  LATE_MIN: 15,
} as const;

/** Phiếu mới được làm nổi bật trong bấy nhiêu giây kể từ khi xuất hiện trên màn hình. */
export const NEW_TICKET_HIGHLIGHT_SEC = 45;

export type AgeLevel = 'ok' | 'warn' | 'late';

export function ageLevel(minutes: number): AgeLevel {
  if (minutes >= KDS_AGE.LATE_MIN) return 'late';
  if (minutes >= KDS_AGE.WARN_MIN) return 'warn';
  return 'ok';
}

export function ticketMinutes(t: Pick<KdsTicket, 'firedAt'>, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(t.firedAt).getTime()) / 60_000));
}

/** "7:05" (phút:giây) cho phiếu dưới 1 giờ, "1g05" khi lâu hơn. */
export function clock(t: Pick<KdsTicket, 'firedAt'>, now: Date): string {
  const sec = Math.max(0, Math.floor((now.getTime() - new Date(t.firedAt).getTime()) / 1000));
  const m = Math.floor(sec / 60);
  if (m >= 60) return `${Math.floor(m / 60)}g${String(m % 60).padStart(2, '0')}`;
  return `${m}:${String(sec % 60).padStart(2, '0')}`;
}

/** Phiếu gấp: được đẩy ưu tiên hoặc bàn VIP. */
export function isRush(t: Pick<KdsTicket, 'priority' | 'isVip'>): boolean {
  return t.priority > 0 || t.isVip;
}

/** Đang chờ: ưu tiên trước, rồi phiếu cũ nhất trước. Đã xong: mới bấm xong lên đầu. */
export function sortTickets(list: KdsTicket[], view: 'active' | 'done'): KdsTicket[] {
  return list.slice().sort((a, b) => (view === 'done' ? (b.bumpedAt ?? '').localeCompare(a.bumpedAt ?? '') : b.priority - a.priority || a.firedAt.localeCompare(b.firedAt)));
}

export interface AllDayRow {
  key: string;
  name: string;
  modifiers: string;
  unit: string;
  quantity: number;
  tickets: number;
}

/** Tổng số lượng từng món (kèm tùy chọn) đang chờ làm trên mọi phiếu – kiểu "all-day" của bếp chuyên nghiệp. */
export function allDay(tickets: KdsTicket[]): AllDayRow[] {
  const map = new Map<string, AllDayRow>();
  for (const t of tickets) {
    if (t.status === 'DONE' || t.status === 'VOIDED') continue;
    const seen = new Set<string>();
    for (const l of t.lines) {
      if (l.status !== 'NEW' && l.status !== 'IN_PROGRESS') continue;
      const modifiers = l.modifiers.map((m) => m.optionName).join(', ');
      const key = `${l.name}|${modifiers}`;
      const row = map.get(key) ?? { key, name: l.name, modifiers, unit: l.unit, quantity: 0, tickets: 0 };
      // Món cân theo kg: đếm theo phần (mỗi dòng một phần) thay vì cộng số kg
      row.quantity += l.unit === 'kg' || l.weightKg ? 1 : Number(l.quantity);
      if (!seen.has(key)) {
        row.tickets += 1;
        seen.add(key);
      }
      map.set(key, row);
    }
  }
  return [...map.values()].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, 'vi'));
}

export function countByLevel(tickets: KdsTicket[], now: Date): Record<AgeLevel, number> {
  const out: Record<AgeLevel, number> = { ok: 0, warn: 0, late: 0 };
  for (const t of tickets) out[ageLevel(ticketMinutes(t, now))] += 1;
  return out;
}
