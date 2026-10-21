/**
 * Logic thuần của màn gọi món: nhóm dòng món theo trạng thái bếp, gọi lại vòng trước,
 * chuyển dòng đã gọi thành dòng giỏ (lặp món). Không phụ thuộc React để dễ kiểm thử.
 */
import type { BranchMenuItemView } from '@dalan/contracts';
import type { PricingMode } from '@dalan/domain';
import type { LineStatus, Order, OrderLine, SessionDetail } from '@/lib/types';
import type { CartLine } from './cart-store';

export type TicketBucket = 'hold' | 'sent' | 'cooking' | 'ready' | 'served' | 'dead';

export const BUCKET_OF: Record<LineStatus, TicketBucket> = {
  DRAFT: 'hold',
  HOLD: 'hold',
  SENT: 'sent',
  PREPARING: 'cooking',
  READY: 'ready',
  SERVED: 'served',
  VOIDED: 'dead',
  CANCELLED: 'dead',
};

/** Thứ tự hiển thị: việc cần làm ngay (món xong chờ mang ra) lên đầu, đã xong xuống cuối. */
export const BUCKET_ORDER: TicketBucket[] = ['ready', 'hold', 'cooking', 'sent', 'served', 'dead'];

export const BUCKET_LABEL: Record<TicketBucket, string> = {
  ready: 'Sẵn sàng – chờ mang ra',
  hold: 'Đang giữ – chờ gọi đợt',
  cooking: 'Đang nấu',
  sent: 'Đã gửi bếp',
  served: 'Đã lên món',
  dead: 'Đã hủy',
};

export interface TicketEntry {
  line: OrderLine;
  order: Order;
}

export interface GroupedLines {
  buckets: Record<TicketBucket, TicketEntry[]>;
  /** Đơn khách gửi qua QR chờ nhân viên xác nhận. */
  pendingOrders: Order[];
  /** Các đợt đang giữ (HOLD), tăng dần. */
  heldCourses: number[];
  /** Tổng số dòng còn hiệu lực (không tính hủy). */
  activeCount: number;
}

export function groupLines(session: SessionDetail): GroupedLines {
  const buckets: Record<TicketBucket, TicketEntry[]> = { ready: [], hold: [], cooking: [], sent: [], served: [], dead: [] };
  const pendingOrders: Order[] = [];
  const held = new Set<number>();
  let activeCount = 0;
  for (const order of session.orders) {
    if (order.status === 'PENDING_CONFIRM') {
      if (order.lines.length > 0) pendingOrders.push(order);
      continue;
    }
    if (order.status === 'CANCELLED') continue;
    for (const line of order.lines) {
      const b = BUCKET_OF[line.status];
      buckets[b].push({ line, order });
      if (b !== 'dead') activeCount += 1;
      if (line.status === 'HOLD') held.add(line.course);
    }
  }
  // Trong mỗi nhóm: theo đợt rồi theo thời điểm gọi
  for (const list of Object.values(buckets)) list.sort((a, b) => a.line.course - b.line.course || a.line.createdAt.localeCompare(b.line.createdAt));
  return { buckets, pendingOrders, heldCourses: [...held].sort((a, b) => a - b), activeCount };
}

const isRepeatable = (l: OrderLine) => !!l.itemId && !l.isAdjustment && l.status !== 'VOIDED' && l.status !== 'CANCELLED';

/** Vòng gọi gần nhất (đơn đã gửi, không phải hệ thống) có món lặp lại được. */
export function lastRound(session: SessionDetail): Order | null {
  const rounds = session.orders.filter((o) => o.status === 'SENT' && o.source !== 'SYSTEM' && o.lines.some(isRepeatable)).sort((a, b) => b.seq - a.seq);
  return rounds[0] ?? null;
}

let keySeq = 0;
function newKey(itemId: string): string {
  keySeq += 1;
  return `${itemId}-${Date.now()}-${keySeq}`;
}

/**
 * Dựng dòng giỏ từ một dòng đã gọi (để "gọi thêm" đúng cấu hình cũ).
 * Trả null nếu món đã hết, bị gỡ khỏi thực đơn hoặc tùy chọn không còn.
 */
export function toCartLine(line: OrderLine, items: Map<string, BranchMenuItemView>, course = 1): CartLine | null {
  if (!isRepeatable(line)) return null;
  const item = items.get(line.itemId!);
  if (!item || item.soldOut) return null;
  const mode = item.pricingMode as PricingMode;
  const modifiers: CartLine['modifiers'] = [];
  for (const m of line.modifiersSnapshot) {
    const group = item.modifierGroups.find((g) => g.code === m.groupCode);
    const option = group?.options.find((o) => o.code === m.optionCode);
    if (!group || !option) return null;
    modifiers.push({ groupId: group.id, groupCode: group.code, groupName: group.name, optionId: option.id, optionCode: option.code, optionName: option.name, priceDelta: option.priceDelta });
  }
  let variant: BranchMenuItemView['variants'][number] | undefined;
  if (mode === 'VARIANT') {
    variant = item.variants.find((v) => v.id === line.variantId);
    if (!variant) return null;
  }
  const openPrice = mode === 'MARKET' || mode === 'OPEN';
  return {
    key: newKey(item.id),
    itemId: item.id,
    name: item.name,
    unit: item.unit,
    pricingMode: mode,
    basePrice: item.price,
    variantId: variant?.id,
    variantName: variant?.name,
    variantPrice: variant?.price,
    modifiers,
    quantity: Number(line.quantity) || 1,
    enteredPrice: openPrice ? line.unitPrice : undefined,
    customName: mode === 'OPEN' ? line.nameSnapshot : undefined,
    note: line.note ?? undefined,
    course,
    seatNo: line.seatNo ?? undefined,
  };
}

/** Lặp lại cả một vòng gọi: trả các dòng giỏ dựng được và số món bỏ qua (hết món/đổi cấu hình). */
export function repeatRound(order: Order, items: Map<string, BranchMenuItemView>): { lines: CartLine[]; skipped: number } {
  const lines: CartLine[] = [];
  let skipped = 0;
  for (const l of order.lines) {
    if (!isRepeatable(l)) continue;
    const c = toCartLine(l, items);
    if (c) lines.push(c);
    else skipped += 1;
  }
  return { lines, skipped };
}

export function menuItemMap(menu: { menus: { categories: { items: BranchMenuItemView[] }[] }[] } | undefined): Map<string, BranchMenuItemView> {
  const map = new Map<string, BranchMenuItemView>();
  for (const m of menu?.menus ?? []) for (const c of m.categories) for (const i of c.items) map.set(i.id, i);
  return map;
}

/** Phút kể từ khi gửi bếp (dùng cho đồng hồ từng dòng). */
export function minutesFrom(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));
}
