'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowRightLeft, Ban, Bell, Check, ChevronRight, CreditCard, Flame, History, MoreVertical, RefreshCw, ReceiptText, UserRound, Users, Wine } from 'lucide-react';
import type { BranchMenuItemView } from '@dalan/contracts';
import { errorMessage, needsApproval } from '@/lib/api';
import { isQueued, runOrQueue } from '@/lib/offline-queue';
import { kdsApi, keys, sessionApi, useAction, useMenu, useSession } from '@/lib/queries';
import { useBranchId, useCan } from '@/lib/auth-store';
import type { Order, OrderLine } from '@/lib/types';
import { cn, elapsed, money, moneyPlain } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Badge, EmptyState, Loading, Segmented } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page-header';
import { ManagerPinDialog } from '@/components/ui/pin-dialog';
import { toast } from '@/components/ui/toast';
import { cartLineTotal, defaultLineFor, needsConfig, toOrderLine, useCart, type CartLine } from './cart-store';
import { ItemDialog } from './item-dialog';
import { MenuBrowser } from './menu-browser';
import { SessionLines } from './session-lines';
import { CartSection, SendButton } from './ticket-panel';
import { EmptiesDialog, GuestCountDialog, MoveDialog, VoidLineDialog, WeightDialog } from './dialogs';
import { groupLines, lastRound, menuItemMap, repeatRound, toCartLine } from './order-logic';

const REQUEST_LABEL: Record<string, string> = { CALL_STAFF: 'Gọi nhân viên', WATER: 'Xin nước / đá', UTENSILS: 'Xin chén đũa', BILL: 'Xin tính tiền', OTHER: 'Yêu cầu khác' };
const COURSES = [1, 2, 3];
/** Mảng rỗng cố định: selector zustand v5 trả mảng mới mỗi lần sẽ gây vòng lặp render vô hạn. */
const EMPTY_CART: CartLine[] = [];

/** Màn gọi món kiểu Toast: thực đơn bên trái, phiếu gọi món bên phải, gửi bếp theo đợt, giữ/gọi đợt. */
export function SessionScreen({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const branchId = useBranchId();
  const session = useSession(sessionId);
  const menu = useMenu();
  const cart = useCart((s) => s.carts[sessionId] ?? EMPTY_CART);
  const add = useCart((s) => s.add);
  const update = useCart((s) => s.update);
  const remove = useCart((s) => s.remove);
  const clear = useCart((s) => s.clear);
  const canSoldOutMenu = useCan('menu.soldout');
  const canManageMenu = useCan('menu.manage');
  const canBump = useCan('kitchen.bump');
  const canMove = useCan('dining.move');
  const canSoldOut = canSoldOutMenu || canManageMenu || canBump;
  const [tab, setTab] = useState<'menu' | 'ticket'>('menu');
  const [course, setCourse] = useState(1);
  const [seat, setSeat] = useState<number | undefined>(undefined);
  const [soldOutMode, setSoldOutMode] = useState(false);
  const [configItem, setConfigItem] = useState<BranchMenuItemView | null>(null);
  const [editLine, setEditLine] = useState<CartLine | null>(null);
  const [voidLine, setVoidLine] = useState<OrderLine | null>(null);
  const [weightLine, setWeightLine] = useState<OrderLine | null>(null);
  const [pinFor, setPinFor] = useState<{ line: OrderLine; input: { reason: string; note?: string; waste: boolean } } | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [emptiesOpen, setEmptiesOpen] = useState(false);
  const [guestsOpen, setGuestsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [serving, setServing] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const invalidate = () => [keys.session(sessionId), keys.floor(branchId), keys.requests(branchId)] as const;
  const onError = (e: unknown) => toast.error(errorMessage(e));
  const confirmOrder = useAction((o: Order) => sessionApi.confirmOrder(sessionId, o.id), invalidate, () => toast.success('Đã gửi bếp đơn của khách'));
  const rejectOrder = useAction((o: Order) => sessionApi.rejectOrder(sessionId, o.id), invalidate, () => toast.success('Đã từ chối đơn'));
  const served = useAction((l: OrderLine) => sessionApi.served(sessionId, l.id), invalidate);
  const fire = useAction((c: number) => sessionApi.fireCourse(sessionId, c), invalidate, (_, c) => toast.success(`Đã gọi đợt ${c} – bếp bắt đầu làm`));
  const move = useAction((tableIds: string[]) => sessionApi.move(sessionId, tableIds), invalidate, () => toast.success('Đã chuyển bàn'));
  const merge = useAction((other: string) => sessionApi.merge(sessionId, other), invalidate, () => toast.success('Đã gộp bàn'));
  const split = useAction((input: { lineIds: string[]; tableIds: string[]; guestCount: number }) => sessionApi.split(sessionId, input), invalidate, () => toast.success('Đã tách bàn'));
  const weight = useAction((input: { lineId: string; weightKg: number }) => sessionApi.updateLine(sessionId, input.lineId, { weightKg: input.weightKg }), invalidate, () => toast.success('Đã cập nhật trọng lượng'));
  const guests = useAction((n: number) => sessionApi.update(sessionId, { guestCount: n }), invalidate);
  const empties = useAction((counts: { itemId: string; countedQty: number }[]) => sessionApi.empties(sessionId, counts), invalidate, () => toast.success('Đã đối chiếu số vỏ'));
  const cancel = useAction(() => sessionApi.cancel(sessionId, 'Khách không dùng'), invalidate, () => toast.success('Đã đóng bàn'));
  const reopen = useAction(() => sessionApi.reopen(sessionId), invalidate, () => toast.success('Đã mở lại bàn để gọi thêm'));
  const request = useAction((id: string) => sessionApi.doneRequest(id), invalidate);
  const soldOut = useAction((item: BranchMenuItemView) => kdsApi.soldOut(branchId, item.id, item.soldOut ? 'clear' : 'today'), () => [keys.menu(branchId)], (_, item) => toast.success(item.soldOut ? `Đã mở bán lại: ${item.name}` : `Đã báo hết hôm nay: ${item.name}`));
  const doVoid = useAction(
    (input: { line: OrderLine; body: { reason: string; note?: string; waste: boolean; managerPin?: string } }) => sessionApi.voidLine(sessionId, input.line.id, input.body),
    invalidate,
    () => {
      toast.success('Đã hủy món');
      setVoidLine(null);
      setPinFor(null);
    },
  );

  const data = session.data;
  const closed = data?.status === 'CLOSED' || data?.status === 'CANCELLED';
  const items = useMemo(() => menuItemMap(menu.data), [menu.data]);
  const grouped = useMemo(() => (data ? groupLines(data) : null), [data]);
  const previous = useMemo(() => (data ? lastRound(data) : null), [data]);
  const cartTotal = useMemo(() => cart.reduce((s, l) => s + cartLineTotal(l), 0), [cart]);
  const cartCount = cart.reduce((s, l) => s + (l.pricingMode === 'WEIGHT' ? 1 : l.quantity), 0);
  const cartCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const l of cart) out[l.itemId] = (out[l.itemId] ?? 0) + (l.pricingMode === 'WEIGHT' ? 1 : l.quantity);
    return out;
  }, [cart]);

  const pick = (item: BranchMenuItemView) => {
    if (closed) return toast.warning('Phiên bàn đã đóng');
    if (needsConfig(item)) return setConfigItem(item);
    add(sessionId, { ...defaultLineFor(item, course), seatNo: seat });
  };

  const addLines = (lines: CartLine[], skipped: number, what: string) => {
    for (const l of lines) add(sessionId, l);
    if (lines.length) toast.success(`Đã thêm ${lines.length} món ${what} vào giỏ${skipped ? ` (bỏ qua ${skipped} món đã hết/đổi cấu hình)` : ''}`);
    else toast.warning('Không lặp lại được: món đã hết hoặc đã đổi cấu hình');
  };

  const repeatPrevious = () => {
    if (!previous) return;
    const r = repeatRound(previous, items);
    addLines(r.lines, r.skipped, `của vòng ${previous.seq}`);
  };

  const repeatLine = (line: OrderLine) => {
    const c = toCartLine(line, items, course);
    if (!c) return toast.warning(`Không gọi thêm được "${line.nameSnapshot}": món đã hết hoặc đổi cấu hình`);
    add(sessionId, c);
    toast.success(`+${c.pricingMode === 'WEIGHT' ? '' : c.quantity} ${c.name}`);
  };

  const sendCart = async () => {
    if (cart.length === 0 || sending) return;
    setSending(true);
    const held = [...new Set(cart.filter((l) => l.course > 1).map((l) => l.course))];
    try {
      const result = await runOrQueue({ method: 'POST', path: `/sessions/${sessionId}/orders`, body: { lines: cart.map(toOrderLine), send: true }, label: `Gửi bếp ${cart.length} món`, invalidate: [[...keys.session(sessionId)], [...keys.floor(branchId)]] });
      clear(sessionId);
      if (isQueued(result)) toast.warning('Mất mạng: đơn đã lưu trên máy, sẽ tự gửi khi có mạng');
      else toast.success(held.length ? `Đã gửi bếp · đợt ${held.join(', ')} đang giữ chờ gọi` : 'Đã gửi bếp');
      void qc.invalidateQueries({ queryKey: keys.session(sessionId) });
      void qc.invalidateQueries({ queryKey: keys.floor(branchId) });
      setTab('ticket');
    } catch (e) {
      onError(e);
    } finally {
      setSending(false);
    }
  };

  const serveAll = async (lines: OrderLine[]) => {
    setServing(true);
    try {
      for (const l of lines) await sessionApi.served(sessionId, l.id);
      toast.success(`Đã mang ra ${lines.length} món`);
    } catch (e) {
      onError(e);
    } finally {
      setServing(false);
      for (const k of invalidate()) void qc.invalidateQueries({ queryKey: k });
    }
  };

  const submitVoid = (line: OrderLine, input: { reason: string; note?: string; waste: boolean }, managerPin?: string) => {
    doVoid.mutate(
      { line, body: { ...input, managerPin } },
      {
        onError: (e) => {
          if (needsApproval(e) && !managerPin) {
            setVoidLine(null);
            setPinFor({ line, input });
            return;
          }
          onError(e);
        },
      },
    );
  };

  if (session.isLoading) return <Loading label="Đang tải phiên bàn..." />;
  if (session.isError || !data || !grouped) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader title="Phiên bàn" back="/" />
        <EmptyState
          title="Không mở được phiên bàn"
          hint={errorMessage(session.error)}
          action={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => session.refetch()}>
                <RefreshCw className="h-5 w-5" /> Thử lại
              </Button>
              <Button onClick={() => router.push('/')}>Về sơ đồ bàn</Button>
            </div>
          }
        />
      </div>
    );
  }

  const tableNames = data.tables.map((t) => t.table.name).join(' + ') || data.code;
  const busy = doVoid.isPending || confirmOrder.isPending || rejectOrder.isPending || served.isPending || serving;
  const statusBadge = data.status === 'PENDING' ? { tone: 'warning' as const, label: 'Khách QR chờ' } : data.status === 'BILL_REQUESTED' ? { tone: 'warning' as const, label: 'Chờ thanh toán' } : closed ? { tone: 'neutral' as const, label: 'Đã đóng' } : { tone: 'info' as const, label: 'Đang phục vụ' };
  const hasSentLines = data.orders.some((o) => o.lines.some((l) => ['SENT', 'PREPARING', 'READY', 'SERVED'].includes(l.status)));
  const seats = Array.from({ length: Math.min(Math.max(data.guestCount, 0), 12) }, (_, i) => i + 1);
  const ticketCount = grouped.activeCount + grouped.pendingOrders.length;

  const courseSeatBar = !closed && (
    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar" aria-label="Đợt và ghế cho món mới">
      <span className="shrink-0 text-xs font-semibold text-ink-500">Đợt</span>
      {COURSES.map((c) => (
        <button key={c} type="button" onClick={() => setCourse(c)} aria-pressed={course === c} className={cn('h-11 min-w-11 shrink-0 rounded-xl border px-3 text-sm font-bold', course === c ? (c > 1 ? 'border-sky-700 bg-sky-700 text-white' : 'border-brand-700 bg-brand-700 text-white') : 'border-ink-100 bg-white text-ink-700')}>
          {c}
        </button>
      ))}
      {course > 1 && <span className="shrink-0 rounded-full bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-900">giữ lại tới khi gọi</span>}
      {seats.length > 0 && (
        <>
          <span className="ml-2 shrink-0 text-xs font-semibold text-ink-500">Ghế</span>
          <button type="button" onClick={() => setSeat(undefined)} aria-pressed={seat === undefined} className={cn('h-11 shrink-0 rounded-xl border px-3 text-sm font-semibold', seat === undefined ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-100 bg-white text-ink-700')}>
            Chung
          </button>
          {seats.map((n) => (
            <button key={n} type="button" onClick={() => setSeat(n)} aria-pressed={seat === n} className={cn('h-11 min-w-11 shrink-0 rounded-xl border text-sm font-bold', seat === n ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-100 bg-white text-ink-700')}>
              {n}
            </button>
          ))}
        </>
      )}
    </div>
  );

  const alerts = (
    <div className="space-y-2 px-3 pb-1 empty:hidden md:px-4">
      {closed && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-ink-900 px-4 py-3 text-white">
          <span className="flex-1 font-semibold">Phiên bàn đã {data.status === 'CANCELLED' ? 'hủy' : 'đóng'} – không gọi thêm món được.</span>
          <Link href={`/sessions/${sessionId}/pay`} className="min-h-11 rounded-xl bg-white/15 px-4 py-2.5 text-sm font-semibold">Xem thanh toán</Link>
          <Link href="/" className="min-h-11 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-ink-900">Về sơ đồ bàn</Link>
        </div>
      )}
      {data.customer && (data.customer.allergies || data.customer.preferences) && (
        <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
          <div className="min-w-0">
            <b className="text-red-800">{data.customer.fullName ?? data.customer.phone}</b>
            {data.customer.allergies && <span className="block font-semibold text-red-800">Dị ứng: {data.customer.allergies}</span>}
            {data.customer.preferences && <span className="block text-ink-700">Sở thích: {data.customer.preferences}</span>}
          </div>
        </div>
      )}
      {data.requests.map((r) => (
        <div key={r.id} className="flex items-center gap-2 rounded-2xl bg-red-600 px-4 py-2 text-white">
          <Bell className="h-5 w-5 shrink-0 animate-pulse-dot" />
          <span className="min-w-0 flex-1 truncate font-semibold">
            {REQUEST_LABEL[r.kind] ?? r.kind}
            {r.note ? `: ${r.note}` : ''}
          </span>
          <span className="text-xs tabular-nums opacity-90">{elapsed(r.createdAt, now)}</span>
          <button type="button" onClick={() => request.mutate(r.id, { onError })} className="flex min-h-11 items-center gap-1 rounded-xl bg-white px-3 text-sm font-bold text-red-700">
            <Check className="h-4 w-4" /> Đã xử lý
          </button>
        </div>
      ))}
      {grouped.pendingOrders.length > 0 && (
        <button type="button" onClick={() => setTab('ticket')} className="flex min-h-11 w-full items-center gap-2 rounded-2xl bg-amber-100 px-4 text-left text-sm font-semibold text-amber-900 md:hidden">
          {grouped.pendingOrders.length} đơn khách gửi qua QR đang chờ xác nhận <ChevronRight className="ml-auto h-4 w-4" />
        </button>
      )}
      {grouped.heldCourses.length > 0 && !closed && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-sky-50 px-4 py-2 text-sm md:hidden">
          <Flame className="h-4 w-4 text-sky-800" />
          <span className="flex-1 font-semibold text-sky-900">Đang giữ đợt {grouped.heldCourses.join(', ')}</span>
          {grouped.heldCourses.map((c) => (
            <Button key={c} size="sm" className="bg-sky-700 hover:bg-sky-800" loading={fire.isPending} onClick={() => fire.mutate(c, { onError })}>
              Gọi đợt {c}
            </Button>
          ))}
        </div>
      )}
    </div>
  );

  const ticketBody = (
    <div className="space-y-3">
      <CartSection
        cart={cart}
        items={items}
        onInc={(l) => (l.pricingMode === 'WEIGHT' ? setEditLine(l) : update(sessionId, l.key, { quantity: l.quantity + 1 }))}
        onDec={(l) => (l.quantity <= 1 || l.pricingMode === 'WEIGHT' ? remove(sessionId, l.key) : update(sessionId, l.key, { quantity: l.quantity - 1 }))}
        onEdit={setEditLine}
        onRemove={(l) => remove(sessionId, l.key)}
        onClear={() => clear(sessionId)}
      />
      <SessionLines
        session={data}
        grouped={grouped}
        now={now}
        busy={busy}
        closed={closed}
        onVoid={setVoidLine}
        onServed={(l) => served.mutate(l, { onError })}
        onServeAll={serveAll}
        onEditWeight={setWeightLine}
        onConfirmOrder={(o) => confirmOrder.mutate(o, { onError })}
        onRejectOrder={(o) => rejectOrder.mutate(o, { onError })}
        onFire={(c) => fire.mutate(c, { onError })}
        firing={fire.isPending}
        onRepeat={closed ? undefined : repeatLine}
      />
      {cart.length === 0 && ticketCount === 0 && (
        <div className="rounded-2xl border border-dashed border-ink-300 px-4 py-10 text-center">
          <ReceiptText className="mx-auto mb-2 h-8 w-8 text-ink-300" />
          <p className="font-semibold text-ink-700">Chưa gọi món nào</p>
          <p className="text-sm text-ink-500">Chạm món trong thực đơn để thêm vào phiếu, rồi bấm “Gửi bếp”.</p>
        </div>
      )}
    </div>
  );

  const ticketFooter = (
    <div className="safe-bottom space-y-2 border-t border-ink-100 bg-white p-3">
      {cart.length > 0 && !closed && <SendButton count={cartCount} total={cartTotal} loading={sending} onClick={sendCart} />}
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-ink-500">
          Tổng hàng <b className="text-ink-900 tabular-nums">{moneyPlain(data.totals.subtotal)}</b>
          {data.totals.serviceChargeAmount > 0 && <span className="hidden sm:inline"> · phí PV {data.totals.serviceChargeBps / 100}%</span>}
        </span>
        <span className="text-right">
          <span className="text-xs text-ink-500">Tạm tính </span>
          <b className="text-lg text-brand-800 tabular-nums">{money(data.totals.total)}</b>
        </span>
      </div>
      <div className="flex gap-2">
        {previous && !closed && (
          <Button variant="outline" className="flex-1" onClick={repeatPrevious} title="Thêm lại các món của vòng gọi gần nhất vào giỏ">
            <History className="h-5 w-5" /> Gọi lại vòng {previous.seq}
          </Button>
        )}
        <Button variant={cart.length > 0 ? 'outline' : 'primary'} size={cart.length > 0 ? 'md' : 'lg'} className="flex-1" onClick={() => router.push(`/sessions/${sessionId}/pay`)}>
          <CreditCard className="h-5 w-5" /> Thanh toán
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        back="/"
        title={
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate">{tableNames}</span>
            <Badge tone={statusBadge.tone} className="shrink-0">
              {statusBadge.label}
            </Badge>
          </span>
        }
        subtitle={`${data.guestCount} khách · ngồi ${elapsed(data.openedAt, now)} · ${data.code}`}
        actions={
          <>
            <button type="button" onClick={() => !closed && setGuestsOpen(true)} disabled={closed} className="flex h-11 items-center gap-1.5 rounded-full border border-ink-100 bg-white px-3 text-sm font-bold shadow-sm hover:bg-ink-100" aria-label="Sửa số khách">
              <Users className="h-4 w-4" /> {data.guestCount}
            </button>
            <span className="hidden text-right sm:block">
              <span className="block text-[11px] text-ink-500">Tạm tính</span>
              <span className="block text-lg leading-tight font-extrabold text-brand-800 tabular-nums">{money(data.totals.total)}</span>
            </span>
            <button type="button" onClick={() => setMenuOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-full border border-ink-100 bg-white text-ink-700 shadow-sm hover:bg-ink-100" aria-label="Thao tác bàn">
              <MoreVertical className="h-5 w-5" />
            </button>
          </>
        }
      />
      {alerts}
      <div className="px-3 pt-2 md:hidden">
        <Segmented
          className="w-full [&>button]:min-h-11 [&>button]:flex-1"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'menu', label: `Thực đơn${cartCount ? ` · ${cartCount}` : ''}` },
            { value: 'ticket', label: `Phiếu gọi${ticketCount ? ` · ${ticketCount}` : ''}${grouped.pendingOrders.length ? ' · có đơn QR' : ''}` },
          ]}
        />
      </div>
      <div className="flex min-h-0 flex-1 pt-1">
        <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col', tab !== 'menu' && 'hidden md:flex')}>
          {menu.data ? (
            <MenuBrowser
              menu={menu.data}
              onPick={pick}
              onConfigure={setConfigItem}
              cartCounts={cartCounts}
              soldOutMode={soldOutMode}
              onToggleSoldOut={(item) => soldOut.mutate(item, { onError })}
              subbar={courseSeatBar}
              toolbar={
                canSoldOut && (
                  <button type="button" onClick={() => setSoldOutMode((v) => !v)} aria-pressed={soldOutMode} className={cn('flex h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold', soldOutMode ? 'border-red-600 bg-red-600 text-white' : 'border-ink-100 bg-white text-ink-700')}>
                    <Ban className="h-4 w-4" />
                    <span className="hidden sm:inline">{soldOutMode ? 'Xong báo hết' : 'Báo hết món'}</span>
                  </button>
                )
              }
            />
          ) : menu.isError ? (
            <EmptyState title="Không tải được thực đơn" hint={errorMessage(menu.error)} action={<Button variant="outline" onClick={() => menu.refetch()}>Thử lại</Button>} />
          ) : (
            <Loading label="Đang tải thực đơn..." />
          )}
          {/* Thanh nhanh trên điện thoại: xem phiếu và gửi bếp ngay từ tab thực đơn */}
          {cart.length > 0 && !closed && (
            <div className="safe-bottom flex items-center gap-2 border-t border-ink-100 bg-white p-2 md:hidden">
              <SendButton count={cartCount} total={cartTotal} loading={sending} onClick={sendCart} className="min-h-12" />
            </div>
          )}
        </div>
        <aside className={cn('min-h-0 w-full flex-col border-ink-100 bg-paper md:flex md:w-[380px] md:border-l lg:w-[420px]', tab === 'ticket' ? 'flex' : 'hidden')}>
          <div className="hidden items-center gap-2 border-b border-ink-100 bg-white px-3 py-2 md:flex">
            <ReceiptText className="h-5 w-5 text-brand-700" />
            <span className="font-bold">Phiếu gọi món</span>
            <span className="text-sm text-ink-500">{ticketCount} món đã gọi</span>
          </div>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-3">{ticketBody}</div>
          {ticketFooter}
        </aside>
      </div>

      <ItemDialog item={configItem} defaultCourse={course} defaultSeat={seat} onClose={() => setConfigItem(null)} onSubmit={(line) => { add(sessionId, line); setConfigItem(null); }} />
      <ItemDialog item={editLine ? (items.get(editLine.itemId) ?? null) : null} initial={editLine} onClose={() => setEditLine(null)} onSubmit={(line) => { update(sessionId, line.key, line); setEditLine(null); }} />
      <VoidLineDialog line={voidLine} onClose={() => setVoidLine(null)} loading={doVoid.isPending} onSubmit={(input) => voidLine && submitVoid(voidLine, input)} />
      <ManagerPinDialog open={!!pinFor} onClose={() => setPinFor(null)} loading={doVoid.isPending} message={`Hủy "${pinFor?.line.nameSnapshot}" vượt hạn mức, cần quản lý duyệt.`} onSubmit={(pin) => pinFor && submitVoid(pinFor.line, pinFor.input, pin)} />
      <WeightDialog line={weightLine} onClose={() => setWeightLine(null)} loading={weight.isPending} onSubmit={(kg) => weightLine && weight.mutate({ lineId: weightLine.id, weightKg: kg }, { onError, onSuccess: () => setWeightLine(null) })} />
      <MoveDialog open={moveOpen} session={data} onClose={() => setMoveOpen(false)} loading={move.isPending || merge.isPending || split.isPending} onMove={(ids) => move.mutate(ids, { onError, onSuccess: () => setMoveOpen(false) })} onMerge={(other) => merge.mutate(other, { onError, onSuccess: () => setMoveOpen(false) })} onSplit={(lineIds, tableIds, guestCount) => split.mutate({ lineIds, tableIds, guestCount }, { onError, onSuccess: () => setMoveOpen(false) })} />
      <EmptiesDialog open={emptiesOpen} session={data} onClose={() => setEmptiesOpen(false)} loading={empties.isPending} onSubmit={(counts) => empties.mutate(counts, { onError, onSuccess: () => setEmptiesOpen(false) })} />
      <GuestCountDialog open={guestsOpen} value={data.guestCount} onClose={() => setGuestsOpen(false)} loading={guests.isPending} onSubmit={(n) => guests.mutate(n, { onError, onSuccess: () => setGuestsOpen(false) })} />
      <ConfirmDialog open={cancelOpen} onClose={() => setCancelOpen(false)} danger title="Đóng bàn không dùng?" message="Bàn sẽ trống trở lại và các món chưa gửi bếp bị bỏ. Chỉ dùng khi khách rời đi mà chưa dùng món nào." confirmLabel="Đóng bàn" loading={cancel.isPending} onConfirm={() => cancel.mutate(undefined, { onError, onSuccess: () => { setCancelOpen(false); clear(sessionId); router.replace('/'); } })} />
      <Dialog open={menuOpen} onClose={() => setMenuOpen(false)} title={`Thao tác · ${tableNames}`} size="sm">
        <div className="grid gap-2">
          {canMove && <ActionRow onClick={() => { setMenuOpen(false); setMoveOpen(true); }} disabled={closed}><ArrowRightLeft className="h-5 w-5" /> Chuyển · gộp · tách bàn</ActionRow>}
          <ActionRow onClick={() => { setMenuOpen(false); setGuestsOpen(true); }} disabled={closed}>
            <Users className="h-5 w-5" /> Sửa số khách
          </ActionRow>
          <ActionRow onClick={() => { setMenuOpen(false); setEmptiesOpen(true); }} disabled={closed}>
            <Wine className="h-5 w-5" /> Đếm vỏ bia, nước, khăn lạnh
          </ActionRow>
          {previous && <ActionRow onClick={() => { setMenuOpen(false); repeatPrevious(); }} disabled={closed}><History className="h-5 w-5" /> Gọi lại vòng {previous.seq}</ActionRow>}
          <ActionRow onClick={() => router.push(`/sessions/${sessionId}/pay`)}>
            <CreditCard className="h-5 w-5" /> Thanh toán · in tạm tính
          </ActionRow>
          {data.status === 'BILL_REQUESTED' && <ActionRow onClick={() => { setMenuOpen(false); reopen.mutate(undefined, { onError }); }}>Mở lại để gọi thêm</ActionRow>}
          {data.joinPin && (
            <div className="rounded-xl bg-gold-100 p-3 text-center text-sm">
              Mã tham gia bàn cho khách QR: <b className="text-xl tracking-widest">{data.joinPin}</b>
            </div>
          )}
          {data.customer && (
            <div className="flex items-center gap-2 rounded-xl bg-paper p-3 text-sm">
              <UserRound className="h-5 w-5 text-ink-500" />
              <span className="min-w-0 flex-1 truncate">
                <b>{data.customer.fullName ?? data.customer.phone}</b> · {data.customer.pointsBalance} điểm
              </span>
              <Link href={`/customers/${data.customer.id}`} className="font-semibold text-brand-700">Hồ sơ</Link>
            </div>
          )}
          <Button variant="danger" size="lg" disabled={closed || hasSentLines} onClick={() => { setMenuOpen(false); setCancelOpen(true); }}>
            Đóng bàn (khách không dùng)
          </Button>
          {hasSentLines && !closed && <p className="text-center text-xs text-ink-500">Bàn đã có món gửi bếp: hủy từng món hoặc thanh toán để đóng bàn.</p>}
        </div>
      </Dialog>
    </div>
  );
}

function ActionRow({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="flex min-h-14 items-center gap-3 rounded-xl border border-ink-100 bg-white px-4 text-left text-base font-semibold text-ink-900 hover:bg-ink-100 disabled:opacity-50">
      {children}
    </button>
  );
}
