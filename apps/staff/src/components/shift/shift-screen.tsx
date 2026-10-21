'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Banknote, Clock, LayoutGrid, Lock, Minus, Plus, ReceiptText, RefreshCw, Wallet } from 'lucide-react';
import { PAYMENT_METHOD_LABELS } from '@dalan/contracts';
import { errorMessage } from '@/lib/api';
import { useBranchId, useCan } from '@/lib/auth-store';
import { keys, shiftApi, useAction, useShift } from '@/lib/queries';
import type { ShiftSummary } from '@/lib/types';
import { cn, dateTimeVi, elapsed, money, moneyPlain, timeHM } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { NumberPad } from '@/components/ui/number-pad';
import { EmptyState, Input, Loading, Row, Segmented } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page-header';
import { toast } from '@/components/ui/toast';
import { VND_DENOMS, cashVariance, sumDenoms, type VarianceTone } from './shift-logic';

const VARIANCE_STYLE: Record<VarianceTone, { box: string; label: string }> = {
  match: { box: 'bg-emerald-600 text-white', label: 'Khớp két' },
  over: { box: 'bg-amber-100 text-amber-900', label: 'Thừa so với dự kiến' },
  short: { box: 'bg-red-600 text-white', label: 'Thiếu so với dự kiến' },
};

/** Ca làm việc và két tiền: mở ca, phiếu thu/chi, kết ca đếm tiền theo mệnh giá, báo cáo Z. */
export function ShiftScreen() {
  const branchId = useBranchId();
  const shift = useShift();
  const canOpen = useCan('shift.open');
  const canClose = useCan('shift.close');
  const canCash = useCan('shift.cash');
  const [openDlg, setOpenDlg] = useState(false);
  const [closeDlg, setCloseDlg] = useState(false);
  const [cashDlg, setCashDlg] = useState<'IN' | 'OUT' | null>(null);
  const [report, setReport] = useState<ShiftSummary | null>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const onError = (e: unknown) => toast.error(errorMessage(e));
  const inv = () => [keys.shift(branchId)] as const;
  const open = useAction((input: { cash: number; notes?: string }) => shiftApi.open(branchId, input.cash, input.notes), inv, () => {
    setOpenDlg(false);
    toast.success('Đã mở ca');
  });
  const close = useAction((input: { shiftId: string; counted: number; notes?: string }) => shiftApi.close(input.shiftId, input.counted, input.notes), inv, (r) => {
    setCloseDlg(false);
    setReport(r);
    toast.success('Đã kết ca');
  });
  const cash = useAction((input: { shiftId: string; kind: 'IN' | 'OUT'; amount: number; reason: string }) => shiftApi.cash(input.shiftId, input), inv, () => {
    setCashDlg(null);
    toast.success('Đã ghi phiếu');
  });

  const s = shift.data;
  const header = <PageHeader back="/" title="Ca làm việc và két tiền" subtitle={s ? `Ca mở từ ${dateTimeVi(s.shift.openedAt)} · ${elapsed(s.shift.openedAt, now)}` : 'Mở ca trước khi thu tiền mặt'} actions={<button type="button" onClick={() => shift.refetch()} className="flex h-11 w-11 items-center justify-center rounded-full border border-ink-100 bg-white text-ink-700 shadow-sm hover:bg-ink-100" aria-label="Làm mới"><RefreshCw className={cn('h-5 w-5', shift.isFetching && 'animate-spin')} /></button>} />;

  if (shift.isLoading) return <div>{header}<Loading label="Đang tải ca làm việc..." /></div>;
  if (shift.isError) {
    return (
      <div>
        {header}
        <EmptyState title="Không tải được ca làm việc" hint={errorMessage(shift.error)} action={<Button variant="outline" onClick={() => shift.refetch()}>Thử lại</Button>} />
      </div>
    );
  }

  const cashRefunded = s?.byMethod.CASH?.refunded ?? 0;
  const methodTotal = s ? Object.values(s.byMethod).reduce((sum, v) => sum + v.amount - v.refunded, 0) : 0;

  return (
    <div className="mx-auto w-full max-w-5xl pb-8">
      {header}
      {!s ? (
        <div className="px-3 md:px-4">
          <div className="mx-auto max-w-lg rounded-3xl border border-ink-100 bg-white p-8 text-center shadow-sm">
            <span className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gold-100 text-gold-700">
              <Wallet className="h-8 w-8" />
            </span>
            <p className="text-xl font-bold text-ink-900">Chưa có ca nào đang mở</p>
            <p className="mb-5 text-sm text-ink-500">Đếm tiền lẻ đầu ca trong két rồi mở ca để bắt đầu thu tiền mặt.</p>
            <Button size="xl" block disabled={!canOpen} onClick={() => setOpenDlg(true)}>
              Mở ca
            </Button>
            {!canOpen && <p className="mt-2 text-xs text-ink-500">Bạn không có quyền mở ca – nhờ thu ngân hoặc quản lý.</p>}
          </div>
        </div>
      ) : (
        <div className="space-y-4 px-3 md:px-4">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Tile icon={ReceiptText} label="Doanh thu ca" value={money(s.revenue)} />
            <Tile icon={LayoutGrid} label="Bill đã thanh toán" value={String(s.billCount)} />
            <Tile icon={Banknote} label="Tiền mặt phải có" value={money(s.expectedCash)} accent />
            <Tile icon={Clock} label="Thời gian ca" value={elapsed(s.shift.openedAt, now)} hint={`từ ${timeHM(s.shift.openedAt)}`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-ink-100 bg-white p-4 shadow-sm">
              <h2 className="mb-2 flex items-center gap-2 font-bold"><Wallet className="h-5 w-5 text-gold-700" /> Két tiền mặt</h2>
              <Row label="Tiền đầu ca" value={moneyPlain(s.shift.openingCash)} />
              <Row label="+ Thu tiền mặt" value={moneyPlain(s.byMethod.CASH?.amount ?? 0)} />
              {cashRefunded > 0 && <Row label="− Hoàn tiền mặt" value={`-${moneyPlain(cashRefunded)}`} className="text-red-700" />}
              <Row label="+ Phiếu thu" value={moneyPlain(s.cashIn)} />
              <Row label="− Phiếu chi" value={`-${moneyPlain(s.cashOut)}`} className={s.cashOut > 0 ? 'text-red-700' : undefined} />
              <div className="mt-2 flex items-center justify-between rounded-xl bg-gold-100 px-3 py-2">
                <span className="font-semibold">Dự kiến trong két</span>
                <span className="text-2xl font-black tabular-nums">{money(s.expectedCash)}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="outline" size="lg" disabled={!canCash} onClick={() => setCashDlg('IN')}>
                  <ArrowDownCircle className="h-5 w-5 text-emerald-700" /> Phiếu thu
                </Button>
                <Button variant="outline" size="lg" disabled={!canCash} onClick={() => setCashDlg('OUT')}>
                  <ArrowUpCircle className="h-5 w-5 text-red-700" /> Phiếu chi
                </Button>
              </div>
            </section>

            <section className="rounded-2xl border border-ink-100 bg-white p-4 shadow-sm">
              <h2 className="mb-3 font-bold">Doanh thu theo phương thức</h2>
              {Object.keys(s.byMethod).length === 0 ? (
                <p className="py-4 text-center text-sm text-ink-500">Chưa có thanh toán nào trong ca.</p>
              ) : (
                <ul className="space-y-3">
                  {Object.entries(s.byMethod).map(([m, v]) => {
                    const net = v.amount - v.refunded;
                    return (
                      <li key={m}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-semibold">{PAYMENT_METHOD_LABELS[m as keyof typeof PAYMENT_METHOD_LABELS] ?? m} <span className="font-normal text-ink-500">· {v.count} lần</span></span>
                          <span className="font-bold tabular-nums">{moneyPlain(net)}</span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink-100">
                          <div className="h-full rounded-full bg-brand-500" style={{ width: `${methodTotal > 0 ? Math.max(2, (net / methodTotal) * 100) : 0}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="mt-4 border-t border-ink-100 pt-2 text-sm">
                <Row label="Giảm giá" value={moneyPlain(s.discounts)} />
                <Row label={`Hủy món (${s.voids.count})`} value={moneyPlain(s.voids.amount)} />
              </div>
            </section>
          </div>

          {s.shift.cashMovements.length > 0 && (
            <section className="rounded-2xl border border-ink-100 bg-white p-4 shadow-sm">
              <h2 className="mb-2 font-bold">Phiếu thu chi trong ca</h2>
              <ul className="divide-y divide-ink-100">
                {s.shift.cashMovements.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 py-2 text-sm">
                    {m.kind === 'IN' ? <ArrowDownCircle className="h-5 w-5 text-emerald-700" /> : <ArrowUpCircle className="h-5 w-5 text-red-700" />}
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{m.reason}</span>
                      <span className="text-xs text-ink-500">{timeHM(m.createdAt)}{m.note ? ` · ${m.note}` : ''}</span>
                    </span>
                    <span className={cn('font-bold tabular-nums', m.kind === 'OUT' ? 'text-red-700' : 'text-emerald-700')}>
                      {m.kind === 'OUT' ? '-' : '+'}
                      {moneyPlain(m.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-bold text-red-900">Kết ca</p>
                <p className="text-sm text-red-800">Đếm tiền trong két, đối chiếu với số dự kiến và in báo cáo Z.</p>
              </div>
              <Button variant="danger" size="lg" disabled={!canClose} onClick={() => setCloseDlg(true)}>
                <Lock className="h-5 w-5" /> Kết ca
              </Button>
            </div>
          </div>
        </div>
      )}

      <OpenShiftDialog open={openDlg} onClose={() => setOpenDlg(false)} loading={open.isPending} onSubmit={(n, notes) => open.mutate({ cash: n, notes }, { onError })} />
      {s && <CloseShiftDialog open={closeDlg} expected={s.expectedCash} onClose={() => setCloseDlg(false)} loading={close.isPending} onSubmit={(counted, notes) => close.mutate({ shiftId: s.shift.id, counted, notes }, { onError })} />}
      {s && <CashMovementDialog kind={cashDlg} onClose={() => setCashDlg(null)} loading={cash.isPending} onSubmit={(amount, reason) => cashDlg && cash.mutate({ shiftId: s.shift.id, kind: cashDlg, amount, reason }, { onError })} />}
      <Dialog open={!!report} onClose={() => setReport(null)} title="Báo cáo kết ca (Z)" size="sm" mode="center">
        {report && (
          <div className="text-sm">
            <Row label="Doanh thu" value={money(report.revenue)} bold />
            <Row label="Số bill" value={report.billCount} />
            <Row label="Tiền mặt dự kiến" value={moneyPlain(report.expectedCash)} />
            <Row label="Tiền mặt đếm được" value={moneyPlain(report.shift.closingCashCounted ?? 0)} />
            {(() => {
              const v = report.shift.variance ?? 0;
              const tone: VarianceTone = v === 0 ? 'match' : v > 0 ? 'over' : 'short';
              return (
                <div className={cn('mt-2 flex items-center justify-between rounded-xl px-3 py-2 font-bold', VARIANCE_STYLE[tone].box)}>
                  <span>{VARIANCE_STYLE[tone].label}</span>
                  <span className="text-xl tabular-nums">{v > 0 ? '+' : ''}{moneyPlain(v)}</span>
                </div>
              );
            })()}
            <p className="mt-3 text-xs text-ink-500">Báo cáo đã được gửi tới máy in hóa đơn của cơ sở.</p>
            <Link href="/" className="mt-3 flex min-h-12 items-center justify-center rounded-xl bg-brand-700 font-semibold text-white">Về sơ đồ bàn</Link>
          </div>
        )}
      </Dialog>
    </div>
  );
}

function Tile({ icon: Icon, label, value, hint, accent }: { icon: typeof Wallet; label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className={cn('flex items-center gap-3 rounded-2xl border px-3 py-3 shadow-sm', accent ? 'border-gold-300 bg-gold-100' : 'border-ink-100 bg-white')}>
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', accent ? 'bg-gold-500 text-white' : 'bg-ink-100 text-ink-700')}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold text-ink-500">{label}</span>
        <span className="block truncate text-lg leading-tight font-extrabold tabular-nums">{value}</span>
        {hint && <span className="block text-[11px] text-ink-500">{hint}</span>}
      </span>
    </div>
  );
}

function AmountDisplay({ value }: { value: number }) {
  return <div className="mb-2 rounded-2xl bg-paper px-4 py-3 text-right text-4xl font-black tabular-nums">{moneyPlain(value)}</div>;
}

function OpenShiftDialog({ open, onClose, onSubmit, loading }: { open: boolean; onClose: () => void; onSubmit: (amount: number, notes?: string) => void; loading?: boolean }) {
  const [text, setText] = useState('');
  const [notes, setNotes] = useState('');
  useEffect(() => {
    if (open) {
      setText('');
      setNotes('');
    }
  }, [open]);
  return (
    <Dialog open={open} onClose={onClose} title="Mở ca · tiền lẻ đầu ca" size="sm" mode="center">
      <p className="mb-2 text-sm text-ink-500">Nhập số tiền mặt đang có trong két trước khi bắt đầu bán.</p>
      <AmountDisplay value={Number(text || 0)} />
      <Input label="Ghi chú (tùy chọn)" value={notes} onChange={(e) => setNotes(e.target.value)} className="mb-2" placeholder="Ví dụ: nhận két từ ca sáng" />
      <NumberPad value={text} onChange={setText} quick={[500_000, 1_000_000, 2_000_000, 5_000_000].map((n) => ({ label: moneyPlain(n), value: String(n) }))} onSubmit={() => !loading && onSubmit(Number(text || 0), notes.trim() || undefined)} submitLabel={loading ? 'Đang mở ca...' : 'Mở ca'} />
    </Dialog>
  );
}

function CashMovementDialog({ kind, onClose, onSubmit, loading }: { kind: 'IN' | 'OUT' | null; onClose: () => void; onSubmit: (amount: number, reason: string) => void; loading?: boolean }) {
  const [text, setText] = useState('');
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (kind) {
      setText('');
      setReason('');
    }
  }, [kind]);
  const amount = Number(text || 0);
  const quickReasons = kind === 'OUT' ? ['Mua đá', 'Trả shipper', 'Mua rau, gia vị', 'Tạm ứng'] : ['Nộp thêm tiền lẻ', 'Thu khác'];
  return (
    <Dialog open={!!kind} onClose={onClose} title={kind === 'IN' ? 'Phiếu thu tiền mặt' : 'Phiếu chi tiền mặt'} size="sm" mode="center">
      <AmountDisplay value={amount} />
      <Input label="Lý do *" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do thu/chi" />
      <div className="my-2 flex flex-wrap gap-1.5">
        {quickReasons.map((r) => (
          <button key={r} type="button" onClick={() => setReason(r)} className="min-h-11 rounded-full bg-ink-100 px-3 text-sm font-semibold">{r}</button>
        ))}
      </div>
      <NumberPad
        value={text}
        onChange={setText}
        quick={[50_000, 100_000, 200_000, 500_000].map((n) => ({ label: moneyPlain(n), value: String(n) }))}
        onSubmit={() => {
          if (loading) return;
          if (!(amount > 0)) return toast.warning('Nhập số tiền');
          if (!reason.trim()) return toast.warning('Nhập lý do');
          onSubmit(amount, reason.trim());
        }}
        submitLabel={loading ? 'Đang ghi...' : 'Ghi phiếu'}
      />
    </Dialog>
  );
}

/** Kết ca: đếm tổng hoặc theo mệnh giá, xem chênh lệch trực tiếp; lệch két phải ghi chú. */
function CloseShiftDialog({ open, expected, onClose, onSubmit, loading }: { open: boolean; expected: number; onClose: () => void; onSubmit: (counted: number, notes?: string) => void; loading?: boolean }) {
  const [mode, setMode] = useState<'denoms' | 'total'>('denoms');
  const [text, setText] = useState('');
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [notes, setNotes] = useState('');
  useEffect(() => {
    if (open) {
      setText('');
      setCounts({});
      setNotes('');
    }
  }, [open]);
  const counted = mode === 'denoms' ? sumDenoms(counts) : Number(text || 0);
  const v = useMemo(() => cashVariance(counted, expected), [counted, expected]);
  const style = VARIANCE_STYLE[v.tone];
  const needNote = v.tone !== 'match' && !notes.trim();
  const setCount = (d: number, n: number) => setCounts((c) => ({ ...c, [d]: Math.max(0, n) }));
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Kết ca · đếm tiền trong két"
      size="md"
      footer={
        <div className="flex w-full flex-col gap-2">
          {needNote && <p className="text-sm font-semibold text-red-700">Két lệch {moneyPlain(Math.abs(v.amount))}đ – ghi rõ lý do trước khi kết ca.</p>}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Đóng</Button>
            <Button variant="danger" size="lg" className="flex-1" loading={loading} disabled={needNote} onClick={() => onSubmit(counted, notes.trim() || undefined)}>
              <Lock className="h-5 w-5" /> Kết ca · {moneyPlain(counted)}
            </Button>
          </div>
        </div>
      }
    >
      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-paper p-2">
          <div className="text-[11px] font-semibold text-ink-500">Dự kiến</div>
          <div className="font-bold tabular-nums">{moneyPlain(expected)}</div>
        </div>
        <div className="rounded-xl bg-paper p-2">
          <div className="text-[11px] font-semibold text-ink-500">Đếm được</div>
          <div className="font-bold tabular-nums">{moneyPlain(counted)}</div>
        </div>
        <div className={cn('rounded-xl p-2', style.box)}>
          <div className="text-[11px] font-semibold opacity-90">{style.label}</div>
          <div className="font-black tabular-nums">{v.amount > 0 ? '+' : ''}{moneyPlain(v.amount)}</div>
        </div>
      </div>
      <Segmented value={mode} onChange={setMode} className="mb-3 w-full [&>button]:min-h-11 [&>button]:flex-1" options={[{ value: 'denoms', label: 'Đếm theo mệnh giá' }, { value: 'total', label: 'Nhập tổng' }]} />
      {mode === 'denoms' ? (
        <ul className="divide-y divide-ink-100">
          {VND_DENOMS.map((d) => {
            const n = counts[d] ?? 0;
            return (
              <li key={d} className="flex items-center gap-2 py-1.5">
                <span className="w-24 font-bold tabular-nums">{moneyPlain(d)}</span>
                <button type="button" onClick={() => setCount(d, n - 1)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink-100" aria-label={`Bớt tờ ${moneyPlain(d)}`}><Minus className="h-5 w-5" /></button>
                <input inputMode="numeric" value={n || ''} placeholder="0" onChange={(e) => setCount(d, Number(e.target.value.replace(/\D/g, '') || 0))} className="h-11 w-16 rounded-xl border border-ink-300 text-center text-lg font-bold tabular-nums outline-none focus:border-brand-500" aria-label={`Số tờ ${moneyPlain(d)}`} />
                <button type="button" onClick={() => setCount(d, n + 1)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-100 text-brand-800" aria-label={`Thêm tờ ${moneyPlain(d)}`}><Plus className="h-5 w-5" /></button>
                <span className="ml-auto text-sm text-ink-700 tabular-nums">{moneyPlain(d * n)}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <>
          <AmountDisplay value={counted} />
          <NumberPad value={text} onChange={setText} />
        </>
      )}
      <Input label={v.tone === 'match' ? 'Ghi chú (tùy chọn)' : 'Lý do lệch két *'} value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-3" placeholder="Ví dụ: thối nhầm bàn 12" />
    </Dialog>
  );
}
