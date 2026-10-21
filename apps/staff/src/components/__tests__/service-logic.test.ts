import { describe, expect, it } from 'vitest';
import type { BranchMenuItemView } from '@dalan/contracts';
import type { FloorTable, KdsTicket, Order, OrderLine, ServiceRequest, SessionDetail } from '@/lib/types';
import { FLOOR_SLA, floorKpis, matchesFilter, matchesTableQuery, tableSignal } from '../floor/floor-logic';
import { groupLines, lastRound, repeatRound, toCartLine } from '../order/order-logic';
import { KDS_AGE, ageLevel, allDay, sortTickets } from '../kds/kds-logic';
import { cashOutcome, quickTenders } from '../pay/cash';
import { sortRequests, requestTone } from '../requests/requests-logic';
import { cashVariance, sumDenoms } from '../shift/shift-logic';

const NOW = new Date('2026-10-21T12:00:00Z');
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();

function table(partial: Omit<Partial<FloorTable>, 'session'> & { session?: Partial<NonNullable<FloorTable['session']>> | null }): FloorTable {
  const { session, ...rest } = partial;
  return {
    id: 't1', code: 'B01', name: 'Bàn 01', minSeats: 2, maxSeats: 4, shape: 'rect', posX: 0, posY: 0, width: 1, height: 1, rotation: 0, isPrivateRoom: false, status: 'EMPTY',
    ...rest,
    session: !session ? null : { id: 's1', code: 'S1', status: 'OPEN', guestCount: 4, openedAt: ago(5), serverId: null, tableIds: ['t1'], linesSent: 0, linesReady: 0, openRequests: 0, total: 0, ...session },
  } as FloorTable;
}

describe('sơ đồ bàn – SLA', () => {
  it('ngồi quá 10 phút chưa gửi món thì vàng và cần chú ý', () => {
    const t = table({ status: 'SEATED', session: { openedAt: ago(FLOOR_SLA.NO_ORDER_WARN_MIN + 1) } });
    const sig = tableSignal(t, NOW)!;
    expect(sig.noOrder).toBe(true);
    expect(sig.tone).toBe('warn');
    expect(matchesFilter(t, 'attention', NOW)).toBe(true);
  });
  it('món xong chờ mang ra và yêu cầu khách được ưu tiên lý do', () => {
    expect(tableSignal(table({ status: 'READY', session: { linesSent: 3, linesReady: 2 } }), NOW)!.reason).toContain('món chờ mang ra');
    expect(tableSignal(table({ status: 'READY', session: { linesReady: 2, openRequests: 1 } }), NOW)!.reason).toContain('yêu cầu');
  });
  it('bàn mở quá lâu thì đỏ; bàn bình thường không cần chú ý', () => {
    expect(tableSignal(table({ status: 'COOKING', session: { linesSent: 2, openedAt: ago(FLOOR_SLA.LONG_CHECK_LATE_MIN) } }), NOW)!.tone).toBe('late');
    const ok = table({ status: 'COOKING', session: { linesSent: 2, openedAt: ago(30) } });
    expect(tableSignal(ok, NOW)!.attention).toBe(false);
    expect(tableSignal(table({}), NOW)).toBeNull();
  });
  it('KPI cộng mỗi phiên một lần khi gộp bàn, tìm bàn không dấu', () => {
    const a = table({ id: 'a', status: 'COOKING', session: { id: 'x', guestCount: 6, total: 500_000, linesSent: 1 } });
    const b = table({ id: 'b', status: 'COOKING', session: { id: 'x', guestCount: 6, total: 500_000, linesSent: 1 } });
    const k = floorKpis([a, b, table({ id: 'c' })], NOW);
    expect(k).toMatchObject({ tables: 3, busy: 2, guests: 6, openRevenue: 500_000 });
    expect(matchesTableQuery(table({ name: 'Phòng VIP Hồng' }), 'phong hong')).toBe(true);
    expect(matchesTableQuery(table({ name: 'Bàn 01' }), 'vip')).toBe(false);
  });
});

function line(p: Partial<OrderLine>): OrderLine {
  return {
    id: 'l', orderId: 'o', itemId: 'i1', variantId: null, nameSnapshot: 'Gà nướng', nameEnSnapshot: null, unitSnapshot: 'đĩa', unitPrice: 100_000, quantity: 2, expectedWeightKg: null, weightKg: null,
    modifiersSnapshot: [], modifiersTotal: 0, lineTotal: 200_000, vatRateBps: 800, stationCode: null, course: 1, status: 'SENT', note: null, participantId: null, seatNo: null,
    isCountedEmpties: false, isAdjustment: false, sentAt: ago(3), readyAt: null, servedAt: null, voidReason: null, createdAt: ago(3), ...p,
  };
}
function order(p: Partial<Order>): Order {
  return { id: 'o', seq: 1, source: 'STAFF', status: 'SENT', placedById: null, placedByParticipantId: null, notes: null, sentAt: ago(3), createdAt: ago(3), lines: [], ...p };
}
const item = (p: Partial<BranchMenuItemView> = {}): BranchMenuItemView =>
  ({
    id: 'i1', code: 'GA', name: 'Gà nướng', nameEn: null, description: null, descriptionEn: null, unit: 'đĩa', pricingMode: 'FIXED', price: 100_000, vatRateBps: 800, imageUrl: null,
    isVegetarian: false, isSignature: false, isSpicy: false, countEmpties: false, tags: [], allergens: [], stationCode: null, isAvailable: true, soldOut: false, stockLeft: null, variants: [],
    modifierGroups: [{ id: 'g1', code: 'CAY', name: 'Độ cay', nameEn: null, minSelect: 0, maxSelect: 1, isRequired: false, options: [{ id: 'op1', code: 'IT', name: 'Ít cay', nameEn: null, priceDelta: 0, isDefault: false }] }],
    ...p,
  }) as BranchMenuItemView;

describe('màn gọi món', () => {
  const session = {
    orders: [
      order({ id: 'o1', seq: 1, lines: [line({ id: 'a', status: 'READY' }), line({ id: 'b', status: 'HOLD', course: 2 }), line({ id: 'c', status: 'VOIDED' })] }),
      order({ id: 'o2', seq: 2, status: 'PENDING_CONFIRM', source: 'GUEST', lines: [line({ id: 'd', status: 'DRAFT' })] }),
      order({ id: 'o3', seq: 3, lines: [line({ id: 'e', status: 'SERVED', modifiersSnapshot: [{ groupCode: 'CAY', groupName: 'Độ cay', optionCode: 'IT', optionName: 'Ít cay', priceDelta: 0 }] })] }),
    ],
  } as unknown as SessionDetail;

  it('nhóm theo trạng thái, tách đơn QR chờ xác nhận, liệt kê đợt đang giữ', () => {
    const g = groupLines(session);
    expect(g.buckets.ready.map((e) => e.line.id)).toEqual(['a']);
    expect(g.buckets.hold.map((e) => e.line.id)).toEqual(['b']);
    expect(g.buckets.dead).toHaveLength(1);
    expect(g.pendingOrders.map((o) => o.id)).toEqual(['o2']);
    expect(g.heldCourses).toEqual([2]);
    expect(g.activeCount).toBe(3);
  });

  it('gọi lại vòng trước dựng đúng tùy chọn, bỏ qua món hết', () => {
    const last = lastRound(session)!;
    expect(last.seq).toBe(3);
    const items = new Map([['i1', item()]]);
    const r = repeatRound(last, items);
    expect(r.skipped).toBe(0);
    expect(r.lines[0]).toMatchObject({ itemId: 'i1', quantity: 2, course: 1, modifiers: [{ groupId: 'g1', optionId: 'op1' }] });
    expect(toCartLine(line({}), new Map([['i1', item({ soldOut: true })]]))).toBeNull();
    expect(toCartLine(line({ isAdjustment: true }), items)).toBeNull();
  });
});

describe('màn hình bếp', () => {
  it('ngưỡng màu 10/15 phút', () => {
    expect(ageLevel(KDS_AGE.WARN_MIN - 1)).toBe('ok');
    expect(ageLevel(KDS_AGE.WARN_MIN)).toBe('warn');
    expect(ageLevel(KDS_AGE.LATE_MIN)).toBe('late');
  });
  it('tổng món cộng dồn trên các phiếu, bỏ món đã xong; ưu tiên lên đầu', () => {
    const t = (id: string, priority: number, firedAt: string, lines: Partial<KdsTicket['lines'][number]>[]) =>
      ({ id, priority, firedAt, status: 'NEW', bumpedAt: null, lines: lines.map((l, i) => ({ id: `${id}${i}`, name: 'Lẩu', unit: 'nồi', quantity: 1, weightKg: null, modifiers: [], status: 'NEW', ...l })) }) as unknown as KdsTicket;
    const list = [t('a', 0, ago(5), [{ quantity: 2 }, { status: 'DONE' }]), t('b', 1, ago(1), [{ quantity: 1 }, { name: 'Cá', unit: 'kg', quantity: 1.4 }])];
    const rows = allDay(list);
    expect(rows.find((r) => r.name === 'Lẩu')).toMatchObject({ quantity: 3, tickets: 2 });
    expect(rows.find((r) => r.name === 'Cá')).toMatchObject({ quantity: 1 });
    expect(sortTickets(list, 'active').map((x) => x.id)).toEqual(['b', 'a']);
  });
});

describe('thu tiền mặt', () => {
  it('gợi ý đúng tiền và làm tròn 50k/100k/500k', () => {
    expect(quickTenders(437_000)).toEqual([437_000, 450_000, 500_000, 1_000_000, 2_000_000]);
    expect(quickTenders(0)).toEqual([]);
  });
  it('tính tiền thừa và thu một phần', () => {
    expect(cashOutcome(500_000, 437_000)).toEqual({ amount: 437_000, change: 63_000, short: 0 });
    expect(cashOutcome(200_000, 437_000)).toEqual({ amount: 200_000, change: 0, short: 237_000 });
  });
});

describe('yêu cầu khách và két tiền', () => {
  it('xin tính tiền chưa ai nhận được xếp trước yêu cầu nước cũ hơn một chút', () => {
    const r = (id: string, kind: ServiceRequest['kind'], min: number, status: ServiceRequest['status'] = 'OPEN') => ({ id, kind, status, createdAt: ago(min), sessionId: 's', tableId: null, note: null }) as ServiceRequest;
    expect(sortRequests([r('w', 'WATER', 2), r('b', 'BILL', 1), r('d', 'CALL_STAFF', 9, 'DONE')], NOW).map((x) => x.id)).toEqual(['b', 'w']);
    expect(requestTone(6)).toBe('late');
  });
  it('đếm mệnh giá và chênh lệch két', () => {
    expect(sumDenoms({ 500_000: 2, 10_000: 3 })).toBe(1_030_000);
    expect(cashVariance(990_000, 1_000_000)).toEqual({ amount: -10_000, tone: 'short' });
    expect(cashVariance(1_000_000, 1_000_000).tone).toBe('match');
  });
});
