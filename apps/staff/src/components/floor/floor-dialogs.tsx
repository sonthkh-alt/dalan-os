'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowRightLeft, Bell, Clock, CreditCard, Printer, UserRound, Users, UtensilsCrossed } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { useBranchId, useCan } from '@/lib/auth-store';
import { billApi, keys, sessionApi, useAction, useSession } from '@/lib/queries';
import type { FloorTable } from '@/lib/types';
import { cn, elapsed, money } from '@/lib/utils';
import { Dialog } from '@/components/ui/dialog';
import { NumberPad } from '@/components/ui/number-pad';
import { toast } from '@/components/ui/toast';
import { MoveDialog } from '@/components/order/dialogs';
import { sessionOf } from './floor-logic';

/** Hộp nhập số khách khi mở bàn (một hoặc nhiều bàn gộp). Hỗ trợ bàn phím: số, Backspace, Enter. */
export function OpenTableDialog({ open, tables, onClose, onConfirm, loading }: { open: boolean; tables: FloorTable[]; onClose: () => void; onConfirm: (guestCount: number) => void; loading: boolean }) {
  const maxSeats = tables.reduce((s, t) => s + t.maxSeats, 0);
  const [guests, setGuests] = useState('');
  useEffect(() => {
    if (open) setGuests(String(Math.max(1, Math.min(tables.length * 4, maxSeats || 4))));
    // Chỉ đặt giá trị gợi ý khi vừa mở hộp thoại
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const n = Number(guests) || 0;
  const submit = () => {
    if (loading) return;
    if (n < 1) return toast.warning('Nhập số khách (ít nhất 1)');
    onConfirm(n);
  };

  // Bàn phím vật lý: Enter xác nhận, số và Backspace sửa số khách (bắt ở pha capture và chặn mặc định
  // để Enter không "bấm" lại nút đang được focus)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      } else if (/^\d$/.test(e.key)) {
        e.preventDefault();
        setGuests((g) => (g === '0' ? e.key : (g + e.key).slice(0, 3)));
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        setGuests((g) => g.slice(0, -1));
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  return (
    <Dialog open={open} onClose={onClose} title={`Mở ${tables.map((t) => t.name).join(' + ')}`} size="sm" mode="center">
      <div className="mb-3 flex items-end justify-between gap-3 rounded-2xl bg-paper px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-ink-500">Số khách</div>
          <div className="text-xs text-ink-500">{tables.length > 1 ? `${tables.length} bàn gộp · ` : ''}tối đa {maxSeats} chỗ</div>
        </div>
        <div className="text-5xl font-black text-ink-900 tabular-nums">{guests || '0'}</div>
      </div>
      {n > maxSeats && maxSeats > 0 && <p className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">Vượt số chỗ của bàn – cân nhắc gộp thêm bàn.</p>}
      <NumberPad
        value={guests}
        onChange={(v) => setGuests(v.slice(0, 3))}
        maxLength={3}
        quick={[1, 2, 4, 6, 8, 10, 12].map((x) => ({ label: `${x}`, value: `${x}` }))}
        onSubmit={submit}
        submitLabel={loading ? 'Đang mở bàn...' : `Mở bàn · ${n} khách`}
      />
      <p className="mt-2 text-center text-xs text-ink-500">Mẹo: gõ số trên bàn phím rồi nhấn Enter để mở nhanh.</p>
    </Dialog>
  );
}

/** Menu thao tác nhanh cho bàn đang có khách: vào bàn, thanh toán, chuyển/gộp, in tạm tính. */
export function TableActionsSheet({ table, now, onClose }: { table: FloorTable | null; now: Date; onClose: () => void }) {
  const router = useRouter();
  const branchId = useBranchId();
  const s = table ? sessionOf(table) : null;
  const sessionId = s?.id ?? '';
  const detail = useSession(sessionId);
  const canMove = useCan('dining.move');
  const canBillRead = useCan('billing.read');
  const canCollect = useCan('billing.collect');
  const canProvisional = useCan('billing.provisional');
  const canPay = canBillRead || canCollect;
  const canPrint = canProvisional || canCollect;
  const [moveOpen, setMoveOpen] = useState(false);
  const [printing, setPrinting] = useState(false);

  const invalidate = () => [keys.session(sessionId), keys.floor(branchId)] as const;
  const onError = (e: unknown) => toast.error(errorMessage(e));
  const move = useAction((ids: string[]) => sessionApi.move(sessionId, ids), invalidate, () => toast.success('Đã chuyển bàn'));
  const merge = useAction((other: string) => sessionApi.merge(sessionId, other), invalidate, () => toast.success('Đã gộp bàn'));
  const split = useAction((input: { lineIds: string[]; tableIds: string[]; guestCount: number }) => sessionApi.split(sessionId, input), invalidate, () => toast.success('Đã tách bàn'));

  const closeAll = () => {
    setMoveOpen(false);
    onClose();
  };

  // In tạm tính cần một bill đang mở; chưa có bill thì chuyển sang màn thanh toán để tạo
  const printProvisional = async () => {
    if (!sessionId) return;
    setPrinting(true);
    try {
      const data = detail.data ?? (await detail.refetch()).data;
      const bill = data?.bills.find((b) => b.status === 'OPEN' || b.status === 'PARTIALLY_PAID');
      if (!bill) {
        toast.info('Bàn chưa có bill – tạo bill ở màn thanh toán rồi in tạm tính');
        router.push(`/sessions/${sessionId}/pay`);
        return;
      }
      await billApi.printProvisional(bill.id);
      toast.success('Đã gửi lệnh in tạm tính');
      onClose();
    } catch (e) {
      onError(e);
    } finally {
      setPrinting(false);
    }
  };

  if (!table || !s) return null;
  const actions = [
    { key: 'open', label: 'Vào bàn · gọi món', icon: UtensilsCrossed, primary: true, onClick: () => router.push(`/sessions/${s.id}`), show: true },
    { key: 'pay', label: 'Thanh toán', icon: CreditCard, onClick: () => router.push(`/sessions/${s.id}/pay`), show: canPay },
    { key: 'move', label: 'Chuyển · gộp · tách bàn', icon: ArrowRightLeft, onClick: () => setMoveOpen(true), show: canMove, disabled: !detail.data },
    { key: 'print', label: printing ? 'Đang gửi lệnh in...' : 'In tạm tính', icon: Printer, onClick: printProvisional, show: canPrint, disabled: printing },
  ].filter((a) => a.show);

  return (
    <>
      <Dialog open={!moveOpen} onClose={onClose} title={`${table.name} · ${s.code}`} size="sm">
        <div className="mb-3 grid grid-cols-3 gap-2 text-center">
          <Stat icon={Users} label="Khách" value={String(s.guestCount)} />
          <Stat icon={Clock} label="Đã ngồi" value={elapsed(s.openedAt, now)} />
          <Stat label="Tạm tính" value={money(s.total)} />
        </div>
        {s.serverName && (
          <p className="mb-3 flex items-center gap-1.5 text-sm text-ink-500">
            <UserRound className="h-4 w-4" /> Phụ trách: <b className="text-ink-700">{s.serverName}</b>
          </p>
        )}
        {s.openRequests > 0 && (
          <Link href="/requests" className="mb-3 flex min-h-[48px] items-center gap-2 rounded-xl bg-red-50 px-3 font-semibold text-red-800">
            <Bell className="h-5 w-5" /> {s.openRequests} yêu cầu của khách đang chờ
          </Link>
        )}
        <div className="grid gap-2">
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              disabled={a.disabled}
              onClick={a.onClick}
              className={cn('flex min-h-[56px] items-center gap-3 rounded-xl px-4 text-left text-base font-semibold transition disabled:opacity-50', a.primary ? 'bg-brand-700 text-white hover:bg-brand-800' : 'border border-ink-100 bg-white text-ink-900 hover:bg-ink-100')}
            >
              <a.icon className="h-5 w-5 shrink-0" /> {a.label}
            </button>
          ))}
        </div>
      </Dialog>
      {detail.data && (
        <MoveDialog
          open={moveOpen}
          session={detail.data}
          onClose={() => setMoveOpen(false)}
          loading={move.isPending || merge.isPending || split.isPending}
          onMove={(ids) => move.mutate(ids, { onError, onSuccess: closeAll })}
          onMerge={(other) => merge.mutate(other, { onError, onSuccess: closeAll })}
          onSplit={(lineIds, tableIds, guestCount) => split.mutate({ lineIds, tableIds, guestCount }, { onError, onSuccess: closeAll })}
        />
      )}
    </>
  );
}

function Stat({ icon: Icon, label, value }: { icon?: typeof Users; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-paper px-2 py-2">
      <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-ink-500">
        {Icon && <Icon className="h-3.5 w-3.5" />} {label}
      </div>
      <div className="truncate text-base font-bold text-ink-900 tabular-nums">{value}</div>
    </div>
  );
}
