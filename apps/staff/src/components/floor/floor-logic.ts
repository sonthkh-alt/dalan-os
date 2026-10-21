/**
 * Logic thuần cho sơ đồ bàn: ngưỡng SLA, tín hiệu cần chú ý, bộ lọc, chỉ số KPI.
 * Tách riêng để kiểm thử và dùng chung giữa thẻ bàn và thanh KPI.
 */
import type { FloorSessionSummary, FloorTable } from '@/lib/types';
import { fold } from '@/lib/ops-utils';

/** Ngưỡng SLA phục vụ (phút). Đổi tại đây nếu nhà hàng muốn chặt/lỏng hơn. */
export const FLOOR_SLA = {
  /** Khách ngồi quá số phút này mà chưa gửi món nào vào bếp → vàng. */
  NO_ORDER_WARN_MIN: 10,
  /** Bàn mở quá lâu (tiệc bia kéo dài vẫn bình thường tới 2 giờ) → vàng. */
  LONG_CHECK_WARN_MIN: 120,
  /** Bàn mở quá 3 giờ → đỏ, quản lý nên ghé hỏi thăm/chốt bill. */
  LONG_CHECK_LATE_MIN: 180,
} as const;

/** API trả thêm tên nhân viên phụ trách (trường bổ sung, có thể vắng ở bản API cũ). */
export type FloorSession = FloorSessionSummary & { serverName?: string | null };

export type Tone = 'ok' | 'warn' | 'late';

export interface TableSignal {
  minutes: number;
  /** Màu đồng hồ: xanh / vàng / đỏ. */
  tone: Tone;
  /** Ngồi lâu mà chưa gửi món nào vào bếp. */
  noOrder: boolean;
  /** Có món bếp đã xong đang chờ mang ra. */
  readyWaiting: number;
  requests: number;
  pendingGuest: boolean;
  billWaiting: boolean;
  attention: boolean;
  /** Lý do chính cần chú ý (hiện trên thẻ). */
  reason: string | null;
}

export function minutesSince(iso: string | Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));
}

export function sessionOf(table: FloorTable): FloorSession | null {
  return table.session as FloorSession | null;
}

/** Tính tín hiệu SLA cho một bàn đang có khách; bàn trống trả null. */
export function tableSignal(table: FloorTable, now: Date): TableSignal | null {
  const s = sessionOf(table);
  if (!s) return null;
  const minutes = minutesSince(s.openedAt, now);
  const noOrder = table.status === 'SEATED' && s.linesSent === 0 && minutes >= FLOOR_SLA.NO_ORDER_WARN_MIN;
  const tone: Tone = minutes >= FLOOR_SLA.LONG_CHECK_LATE_MIN ? 'late' : noOrder || minutes >= FLOOR_SLA.LONG_CHECK_WARN_MIN ? 'warn' : 'ok';
  const pendingGuest = table.status === 'PENDING';
  const billWaiting = table.status === 'BILL';
  const readyWaiting = s.linesReady;
  const requests = s.openRequests;
  let reason: string | null = null;
  if (requests > 0) reason = `${requests} yêu cầu của khách`;
  else if (readyWaiting > 0) reason = `${readyWaiting} món chờ mang ra`;
  else if (pendingGuest) reason = 'Khách QR chờ xác nhận';
  else if (billWaiting) reason = 'Chờ thanh toán';
  else if (noOrder) reason = 'Chưa gửi món vào bếp';
  else if (tone === 'late') reason = 'Bàn mở quá lâu';
  const attention = reason !== null;
  return { minutes, tone, noOrder, readyWaiting, requests, pendingGuest, billWaiting, attention, reason };
}

export type FloorFilter = 'all' | 'empty' | 'busy' | 'attention' | 'mine';

export function matchesFilter(table: FloorTable, filter: FloorFilter, now: Date, staffId?: string | null): boolean {
  if (filter === 'all') return true;
  if (filter === 'empty') return !table.session;
  if (filter === 'busy') return !!table.session;
  if (filter === 'mine') return !!staffId && table.session?.serverId === staffId;
  return !!tableSignal(table, now)?.attention;
}

/** Tìm bàn không dấu theo tên, mã bàn hoặc mã phiên. */
export function matchesTableQuery(table: FloorTable, query: string): boolean {
  const q = fold(query).trim();
  if (!q) return true;
  const hay = fold(`${table.name} ${table.code} ${table.session?.code ?? ''} ${sessionOf(table)?.serverName ?? ''}`);
  return q.split(/\s+/).every((part) => hay.includes(part));
}

export interface FloorKpis {
  tables: number;
  busy: number;
  guests: number;
  openRevenue: number;
  requests: number;
  ready: number;
  attention: number;
}

export function floorKpis(tables: FloorTable[], now: Date): FloorKpis {
  // Một phiên có thể gộp nhiều bàn: chỉ cộng khách/tiền một lần mỗi phiên
  const sessions = new Map<string, FloorSession>();
  let busy = 0;
  let attention = 0;
  for (const t of tables) {
    const s = sessionOf(t);
    if (!s) continue;
    busy += 1;
    sessions.set(s.id, s);
    if (tableSignal(t, now)?.attention) attention += 1;
  }
  let guests = 0;
  let openRevenue = 0;
  let requests = 0;
  let ready = 0;
  for (const s of sessions.values()) {
    guests += s.guestCount;
    openRevenue += s.total;
    requests += s.openRequests;
    ready += s.linesReady;
  }
  return { tables: tables.length, busy, guests, openRevenue, requests, ready, attention };
}

/** Tên ngắn trên thẻ bàn: bỏ tiền tố "Bàn ". */
export function shortTableName(name: string): string {
  return name.replace(/^Bàn\s+/i, '');
}
