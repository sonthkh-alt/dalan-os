'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Bell, ChevronRight, Flame, MoreVertical, Pencil, Printer, Send, Trash2, Users, Wine } from 'lucide-react';
import type { BranchMenuItemView } from '@dalan/contracts';
import { errorMessage, needsApproval } from '@/lib/api';
import { isQueued, runOrQueue } from '@/lib/offline-queue';
import { keys, sessionApi, useAction, useMenu, useSession } from '@/lib/queries';
import { useBranchId } from '@/lib/auth-store';
import type { Order, OrderLine } from '@/lib/types';
import { cn, elapsed, money, moneyPlain, qty } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Badge, Loading, Segmented } from '@/components/ui/primitives';
import { ManagerPinDialog } from '@/components/ui/pin-dialog';
import { toast } from '@/components/ui/toast';
import { cartLineLabel, cartLineTotal, defaultLineFor, needsConfig, toOrderLine, useCart, type CartLine } from './cart-store';
import { ItemDialog } from './item-dialog';
import { MenuBrowser } from './menu-browser';
import { SessionLines } from './session-lines';
import { EmptiesDialog, GuestCountDialog, MoveDialog, VoidLineDialog, WeightDialog } from './dialogs';

const REQUEST_LABEL: Record<string, string> = { CALL_STAFF: 'Gọi nhân viên', WATER: 'Xin nước/đá', UTENSILS: 'Xin chén đũa', BILL: 'Xin tính tiền', OTHER: 'Yêu cầu khác' };

export function SessionScreen({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const branchId = useBranchId();
  const session = useSession(sessionId);
  const menu = useMenu();
  const cart = useCart((s) => s.carts[sessionId] ?? []);
  const { add, update, remove, clear } = useCart();
  const [tab, setTab] = useState<'menu' | 'lines'>('menu');
  const [configItem, setConfigItem] = useState<BranchMenuItemView | null>(null);
  const [editLine, setEditLine] = useState<CartLine | null>(null);
  const [voidLine, setVoidLine] = useState<OrderLine | null>(null);
  const [weightLine, setWeightLine] = useState<OrderLine | null>(null);
  const [pinFor, setPinFor] = useState<{ line: OrderLine; input: { reason: string; note?: string; waste: boolean } } | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [emptiesOpen, setEmptiesOpen] = useState(false);
  const [guestsOpen, setGuestsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const invalidate = () => [keys.session(sessionId), keys.floor(branchId), keys.requests(branchId)] as const;
  const act = <T,>(fn: (input: T) => Promise<unknown>, ok?: string) =>
    useAction(fn, () => invalidate(), () => ok && toast.success(ok));
  const confirmOrder = act((o: Order) => sessionApi.confirmOrder(sessionId, o.id), 'Đã gửi bếp đơn của khách');
  const rejectOrder = act((o: Order) => sessionApi.rejectOrder(sessionId, o.id), 'Đã từ chối đơn');
  const served = act((l: OrderLine) => sessionApi.served(sessionId, l.id));
  const fire = act((course: number) => sessionApi.fireCourse(sessionId, course), 'Đã bắn đợt món');
  const move = act((tableIds: string[]) => sessionApi.move(sessionId, tableIds), 'Đã chuyển bàn');
  const merge = act((other: string) => sessionApi.merge(sessionId, other), 'Đã gộp bàn');
  const split = act((input: { lineIds: string[]; tableIds: string[]; guestCount: number }) => sessionApi.split(sessionId, input), 'Đã tách bàn');
  const weight = act((input: { lineId: string; weightKg: number }) => sessionApi.updateLine(sessionId, input.lineId, { weightKg: input.weightKg }), 'Đã cập nhật trọng lượng');
  const guests = act((n: number) => sessionApi.update(sessionId, { guestCount: n }));
  const empties = act((counts: { itemId: string; countedQty: number }[]) => sessionApi.empties(sessionId, counts), 'Đã đối chiếu số vỏ');
  const cancel = act(() => sessionApi.cancel(sessionId, 'Khách không dùng'), 'Đã đóng bàn');
  const request = act((id: string) => sessionApi.doneRequest(id));
  const doVoid = useAction(
    (input: { line: OrderLine; body: { reason: string; note?: string; waste: boolean; managerPin?: string } }) => sessionApi.voidLine(sessionId, input.line.id, input.body),
    () => invalidate(),
    () => {
      toast.success('Đã hủy món');
      setVoidLine(null);
      setPinFor(null);
    },
  );
  const onError = (e: unknown) => toast.error(errorMessage(e));

  const data = session.data;
  const closed = data?.status === 'CLOSED' || data?.status === 'CANCELLED';
  const cartTotal = useMemo(() => cart.reduce((s, l) => s + cartLineTotal(l), 0), [cart]);
  const pendingGuestOrders = data?.orders.filter((o) => o.status === 'PENDING_CONFIRM') ?? [];
  const heldCourses = useMemo(() => [...new Set((data?.orders ?? []).flatMap((o) => o.lines).filter((l) => l.status === 'HOLD').map((l) => l.course))].sort(), [data]);

  const pick = (item: BranchMenuItemView) => {
    if (needsConfig(item)) return setConfigItem(item);
    add(sessionId, defaultLineFor(item));
    toast.info(`+1 ${item.name}`);
  };

  const sendCart = async () => {
    if (cart.length === 0) return;
    setSending(true);
    try {
      const result = await runOrQueue({ method: 'POST', path: `/sessions/${sessionId}/orders`, body: { lines: cart.map(toOrderLine), send: true }, label: `Gửi bếp ${cart.length} món`, invalidate: [[...keys.session(sessionId)], [...keys.floor(branchId)]] });
      clear(sessionId);
      if (isQueued(result)) toast.warning('Mất mạng: đơn đã lưu, sẽ tự gửi khi có mạng');
      else toast.success('Đã gửi bếp');
      void qc.invalidateQueries({ queryKey: keys.session(sessionId) });
      void qc.invalidateQueries({ queryKey: keys.floor(branchId) });
      setTab('lines');
    } catch (e) {
      onError(e);
    } finally {
      setSending(false);
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
  if (session.isError || !data) return <div className="p-4 text-red-700">{errorMessage(session.error)}</div>;

  const tableNames = data.tables.map((t) => t.table.name).join(' + ');
  const busy = doVoid.isPending || confirmOrder.isPending || rejectOrder.isPending || served.isPending;

  const header = (
    <div className="flex items-center gap-2 border-b border-ink-100 bg-white px-2 py-2">
      <Link href="/" className="flex h-11 w-11 items-center justify-center rounded-full text-ink-700 hover:bg-ink-100" aria-label="Về sơ đồ bàn">
        <ArrowLeft className="h-6 w-6" />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-lg font-bold">{tableNames}</span>
          <Badge tone={data.status === 'BILL_REQUESTED' ? 'warning' : closed ? 'neutral' : data.status === 'PENDING' ? 'warning' : 'info'}>
            {data.status === 'PENDING' ? 'Khách QR chờ' : data.status === 'BILL_REQUESTED' ? 'Chờ thanh toán' : closed ? 'Đã đóng' : 'Đang phục vụ'}
          </Badge>
        </div>
        <button type="button" onClick={() => !closed && setGuestsOpen(true)} className="flex items-center gap-1 text-xs text-ink-500">
          <Users className="h-3.5 w-3.5" /> {data.guestCount} khách · {elapsed(data.openedAt, now)} · {data.code}
          {!closed && <Pencil className="h-3 w-3" />}
        </button>
      </div>
      <div className="text-right">
        <div className="text-xs text-ink-500">Tạm tính</div>
        <div className="text-lg font-bold text-brand-800 tabular-nums">{money(data.totals.total)}</div>
      </div>
      <button type="button" onClick={() => setMenuOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-full text-ink-700 hover:bg-ink-100" aria-label="Thêm thao tác">
        <MoreVertical className="h-6 w-6" />
      </button>
    </div>
  );

  const alerts = (
    <>
      {data.requests.length > 0 && (
        <div className="space-y-1 bg-red-50 px-3 py-2">
          {data.requests.map((r) => (
            <div key={r.id} className="flex items-center gap-2 text-sm">
              <Bell className="h-4 w-4 text-red-700" />
              <span className="flex-1 font-semibold text-red-800">{REQUEST_LABEL[r.kind] ?? r.kind}{r.note ? `: ${r.note}` : ''}</span>
              <span className="text-xs text-ink-500">{elapsed(r.createdAt, now)}</span>
              <Button size="sm" variant="outline" onClick={() => request.mutate(r.id, { onError })}>Đã xử lý</Button>
            </div>
          ))}
        </div>
      )}
      {pendingGuestOrders.length > 0 && (
        <button type="button" onClick={() => setTab('lines')} className="flex w-full items-center gap-2 bg-amber-50 px-3 py-2 text-left text-sm font-semibold text-amber-900">
          {pendingGuestOrders.length} đơn khách gửi qua QR đang chờ xác nhận <ChevronRight className="ml-auto h-4 w-4" />
        </button>
      )}
      {heldCourses.length > 0 && (
        <div className="flex items-center gap-2 bg-sky-50 px-3 py-2 text-sm">
          <Flame className="h-4 w-4 text-sky-800" />
          <span className="flex-1 text-sky-900">Món đang giữ đợt {heldCourses.join(', ')}</span>
          {heldCourses.map((c) => (
            <Button key={c} size="sm" variant="secondary" onClick={() => fire.mutate(c, { onError })}>Lên đợt {c}</Button>
          ))}
        </div>
      )}
    </>
  );

  const cartPanel = (
    <div className="border-t border-ink-100 bg-white">
      {cart.length > 0 && (
        <ul className="max-h-48 divide-y divide-ink-100 overflow-y-auto">
          {cart.map((l) => (
            <li key={l.key} className="flex items-center gap-2 px-3 py-1.5 text-sm">
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => (l.quantity <= 1 || l.pricingMode === 'WEIGHT' ? remove(sessionId, l.key) : update(sessionId, l.key, { quantity: l.quantity - 1 }))} className="h-9 w-9 rounded-lg bg-ink-100 text-lg font-bold">−</button>
                <span className="w-10 text-center font-bold tabular-nums">{qty(l.quantity)}{l.pricingMode === 'WEIGHT' ? 'kg' : ''}</span>
                <button type="button" onClick={() => (l.pricingMode === 'WEIGHT' ? setEditLine(l) : update(sessionId, l.key, { quantity: l.quantity + 1 }))} className="h-9 w-9 rounded-lg bg-brand-100 text-lg font-bold text-brand-800">+</button>
              </div>
              <button type="button" onClick={() => setEditLine(l)} className="min-w-0 flex-1 text-left">
                <span className="block truncate font-semibold">{cartLineLabel(l)}</span>
                <span className="block truncate text-xs text-ink-500">{[...l.modifiers.map((m) => m.optionName), l.note, l.course > 1 ? `đợt ${l.course}` : null].filter(Boolean).join(' · ')}</span>
              </button>
              <span className="tabular-nums">{moneyPlain(cartLineTotal(l))}</span>
              <button type="button" onClick={() => remove(sessionId, l.key)} className="flex h-9 w-9 items-center justify-center rounded-lg text-red-700" aria-label="Bỏ"><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="flex-1 text-sm">
          <span className="text-ink-500">Giỏ: </span>
          <b>{cart.reduce((s, l) => s + (l.pricingMode === 'WEIGHT' ? 1 : l.quantity), 0)} món</b> · <b className="tabular-nums">{moneyPlain(cartTotal)}</b>
        </div>
        {cart.length > 0 && <Button variant="ghost" onClick={() => clear(sessionId)}>Xóa giỏ</Button>}
        <Button size="lg" disabled={cart.length === 0 || closed} loading={sending} onClick={sendCart}>
          <Send className="h-5 w-5" /> Gửi bếp
        </Button>
      </div>
    </div>
  );

  const linesPanel = (
    <div className="flex h-full flex-col">
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-3">
        <SessionLines session={data} busy={busy} onVoid={setVoidLine} onServed={(l) => served.mutate(l, { onError })} onEditWeight={setWeightLine} onConfirmOrder={(o) => confirmOrder.mutate(o, { onError })} onRejectOrder={(o) => rejectOrder.mutate(o, { onError })} />
      </div>
      <div className="safe-bottom flex items-center gap-2 border-t border-ink-100 bg-white px-3 py-2">
        <div className="flex-1 text-sm">
          <div className="flex justify-between"><span className="text-ink-500">Tổng hàng</span><span className="tabular-nums">{moneyPlain(data.totals.subtotal)}</span></div>
          {data.totals.serviceChargeAmount > 0 && <div className="flex justify-between"><span className="text-ink-500">Phí phục vụ {data.totals.serviceChargeBps / 100}%</span><span className="tabular-nums">{moneyPlain(data.totals.serviceChargeAmount)}</span></div>}
          <div className="flex justify-between font-bold"><span>Tạm tính</span><span className="tabular-nums">{moneyPlain(data.totals.total)}</span></div>
        </div>
        <Button size="lg" variant="secondary" disabled={closed} onClick={() => setEmptiesOpen(true)}>
          <Wine className="h-5 w-5" /> Đếm vỏ
        </Button>
        <Button size="lg" disabled={closed} onClick={() => router.push(`/sessions/${sessionId}/pay`)}>
          <Printer className="h-5 w-5" /> Tính tiền
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      {header}
      {alerts}
      <div className="md:hidden">
        <Segmented className="m-2 w-[calc(100%-1rem)] [&>button]:flex-1" value={tab} onChange={setTab} options={[{ value: 'menu', label: `Thực đơn${cart.length ? ` (${cart.length})` : ''}` }, { value: 'lines', label: `Đã gọi${pendingGuestOrders.length ? ` · ${pendingGuestOrders.length} chờ` : ''}` }]} />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className={cn('flex min-h-0 flex-1 flex-col md:w-1/2 md:border-r md:border-ink-100', tab !== 'menu' && 'hidden md:flex')}>
          {menu.data ? <MenuBrowser menu={menu.data} onPick={pick} onConfigure={setConfigItem} /> : <Loading label="Đang tải thực đơn..." />}
          {cartPanel}
        </div>
        <div className={cn('min-h-0 flex-1 md:w-1/2', tab !== 'lines' && 'hidden md:block')}>{linesPanel}</div>
      </div>

      <ItemDialog item={configItem} onClose={() => setConfigItem(null)} onSubmit={(line) => { add(sessionId, line); setConfigItem(null); }} />
      <ItemDialog item={editLine ? (menu.data?.menus.flatMap((m) => m.categories.flatMap((c) => c.items)).find((i) => i.id === editLine.itemId) ?? null) : null} initial={editLine} onClose={() => setEditLine(null)} onSubmit={(line) => { update(sessionId, line.key, line); setEditLine(null); }} />
      <VoidLineDialog line={voidLine} onClose={() => setVoidLine(null)} loading={doVoid.isPending} onSubmit={(input) => voidLine && submitVoid(voidLine, input)} />
      <ManagerPinDialog open={!!pinFor} onClose={() => setPinFor(null)} loading={doVoid.isPending} message={`Hủy "${pinFor?.line.nameSnapshot}" vượt hạn mức, cần quản lý duyệt.`} onSubmit={(pin) => pinFor && submitVoid(pinFor.line, pinFor.input, pin)} />
      <WeightDialog line={weightLine} onClose={() => setWeightLine(null)} loading={weight.isPending} onSubmit={(kg) => weightLine && weight.mutate({ lineId: weightLine.id, weightKg: kg }, { onError, onSuccess: () => setWeightLine(null) })} />
      <MoveDialog open={moveOpen} session={data} onClose={() => setMoveOpen(false)} loading={move.isPending || merge.isPending || split.isPending} onMove={(ids) => move.mutate(ids, { onError, onSuccess: () => setMoveOpen(false) })} onMerge={(other) => merge.mutate(other, { onError, onSuccess: () => setMoveOpen(false) })} onSplit={(lineIds, tableIds, guestCount) => split.mutate({ lineIds, tableIds, guestCount }, { onError, onSuccess: () => setMoveOpen(false) })} />
      <EmptiesDialog open={emptiesOpen} session={data} onClose={() => setEmptiesOpen(false)} loading={empties.isPending} onSubmit={(counts) => empties.mutate(counts, { onError, onSuccess: () => setEmptiesOpen(false) })} />
      <GuestCountDialog open={guestsOpen} value={data.guestCount} onClose={() => setGuestsOpen(false)} loading={guests.isPending} onSubmit={(n) => guests.mutate(n, { onError, onSuccess: () => setGuestsOpen(false) })} />
      <Dialog open={menuOpen} onClose={() => setMenuOpen(false)} title="Thao tác bàn" size="sm">
        <div className="grid gap-2">
          <Button variant="outline" size="lg" onClick={() => { setMenuOpen(false); setMoveOpen(true); }} disabled={closed}>Chuyển · gộp · tách bàn</Button>
          <Button variant="outline" size="lg" onClick={() => { setMenuOpen(false); setEmptiesOpen(true); }} disabled={closed}>Đếm vỏ bia, nước</Button>
          <Button variant="outline" size="lg" onClick={() => { setMenuOpen(false); setGuestsOpen(true); }} disabled={closed}>Sửa số khách</Button>
          {data.status === 'BILL_REQUESTED' && <Button variant="outline" size="lg" onClick={() => { setMenuOpen(false); sessionApi.reopen(sessionId).then(() => qc.invalidateQueries({ queryKey: keys.session(sessionId) })).catch(onError); }}>Mở lại để gọi thêm</Button>}
          {data.joinPin && <div className="rounded-xl bg-gold-100 p-3 text-center text-sm">Mã tham gia bàn cho khách QR: <b className="text-xl tracking-widest">{data.joinPin}</b></div>}
          <Button variant="danger" size="lg" disabled={closed || data.orders.some((o) => o.lines.some((l) => ['SENT', 'PREPARING', 'READY', 'SERVED'].includes(l.status)))} onClick={() => { setMenuOpen(false); cancel.mutate(undefined, { onError, onSuccess: () => router.replace('/') }); }}>
            Đóng bàn (khách không dùng)
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
