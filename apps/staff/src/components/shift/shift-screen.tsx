'use client';

import { useState } from 'react';
import { PAYMENT_METHOD_LABELS } from '@dalan/contracts';
import { errorMessage } from '@/lib/api';
import { useBranchId } from '@/lib/auth-store';
import { keys, shiftApi, useAction, useShift } from '@/lib/queries';
import type { ShiftSummary } from '@/lib/types';
import { cn, dateTimeVi, money, moneyPlain } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { NumberPad } from '@/components/ui/number-pad';
import { Input, Loading, Row } from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';

export function ShiftScreen() {
  const branchId = useBranchId();
  const shift = useShift();
  const [openDlg, setOpenDlg] = useState(false);
  const [closeDlg, setCloseDlg] = useState(false);
  const [cashDlg, setCashDlg] = useState<'IN' | 'OUT' | null>(null);
  const [report, setReport] = useState<ShiftSummary | null>(null);
  const onError = (e: unknown) => toast.error(errorMessage(e));
  const inv = () => [keys.shift(branchId)] as const;
  const open = useAction((cash: number) => shiftApi.open(branchId, cash), inv, () => { setOpenDlg(false); toast.success('Đã mở ca'); });
  const close = useAction((input: { shiftId: string; counted: number; notes?: string }) => shiftApi.close(input.shiftId, input.counted, input.notes), inv, (r) => { setCloseDlg(false); setReport(r); toast.success('Đã kết ca'); });
  const cash = useAction((input: { shiftId: string; kind: 'IN' | 'OUT'; amount: number; reason: string }) => shiftApi.cash(input.shiftId, input), inv, () => { setCashDlg(null); toast.success('Đã ghi phiếu'); });

  if (shift.isLoading) return <Loading />;
  const s = shift.data;

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="mb-3 text-xl font-bold">Ca làm việc và két tiền</h1>
      {!s ? (
        <div className="rounded-2xl border border-ink-100 bg-white p-6 text-center">
          <p className="mb-3 text-ink-700">Chưa có ca nào đang mở tại cơ sở này.</p>
          <Button size="xl" onClick={() => setOpenDlg(true)}>Mở ca</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-2xl border border-ink-100 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-bold">Ca đang mở</span>
              <span className="text-sm text-ink-500">từ {dateTimeVi(s.shift.openedAt)}</span>
            </div>
            <Row label="Tiền đầu ca" value={moneyPlain(s.shift.openingCash)} />
            <Row label="Thu tiền mặt" value={moneyPlain(s.byMethod.CASH?.amount ?? 0)} />
            {(s.byMethod.CASH?.refunded ?? 0) > 0 && <Row label="Hoàn tiền mặt" value={`-${moneyPlain(s.byMethod.CASH?.refunded ?? 0)}`} />}
            <Row label="Phiếu thu khác" value={moneyPlain(s.cashIn)} />
            <Row label="Phiếu chi" value={`-${moneyPlain(s.cashOut)}`} />
            <Row label="Tiền mặt phải có trong két" value={money(s.expectedCash)} bold className="border-t border-ink-100 pt-2" />
          </div>
          <div className="rounded-2xl border border-ink-100 bg-white p-4">
            <h2 className="mb-2 font-bold">Doanh thu trong ca</h2>
            <Row label="Số bill đã thanh toán" value={s.billCount} />
            <Row label="Doanh thu" value={money(s.revenue)} bold />
            <Row label="Giảm giá" value={moneyPlain(s.discounts)} />
            <Row label={`Hủy món (${s.voids.count})`} value={moneyPlain(s.voids.amount)} />
            <div className="mt-2 border-t border-ink-100 pt-2 text-sm">
              {Object.entries(s.byMethod).map(([m, v]) => (
                <Row key={m} label={`${PAYMENT_METHOD_LABELS[m as keyof typeof PAYMENT_METHOD_LABELS] ?? m} (${v.count})`} value={moneyPlain(v.amount - v.refunded)} />
              ))}
            </div>
          </div>
          {s.shift.cashMovements.length > 0 && (
            <div className="rounded-2xl border border-ink-100 bg-white p-4 text-sm">
              <h2 className="mb-2 font-bold">Phiếu thu chi</h2>
              {s.shift.cashMovements.map((m) => (
                <Row key={m.id} label={`${m.kind === 'IN' ? 'Thu' : 'Chi'} · ${m.reason}`} value={<span className={cn(m.kind === 'OUT' && 'text-red-700')}>{m.kind === 'OUT' ? '-' : '+'}{moneyPlain(m.amount)}</span>} />
              ))}
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" size="lg" onClick={() => setCashDlg('IN')}>Phiếu thu</Button>
            <Button variant="outline" size="lg" onClick={() => setCashDlg('OUT')}>Phiếu chi</Button>
            <Button variant="danger" size="lg" onClick={() => setCloseDlg(true)}>Kết ca</Button>
          </div>
        </div>
      )}

      <AmountDialog open={openDlg} title="Mở ca – tiền đầu ca" onClose={() => setOpenDlg(false)} loading={open.isPending} onSubmit={(n) => open.mutate(n, { onError })} />
      {s && <AmountDialog open={closeDlg} title="Kết ca – tiền mặt đếm được" hint={`Hệ thống dự kiến ${moneyPlain(s.expectedCash)}đ`} withNotes onClose={() => setCloseDlg(false)} loading={close.isPending} onSubmit={(n, notes) => close.mutate({ shiftId: s.shift.id, counted: n, notes }, { onError })} />}
      {s && <AmountDialog open={!!cashDlg} title={cashDlg === 'IN' ? 'Phiếu thu tiền mặt' : 'Phiếu chi tiền mặt'} withReason onClose={() => setCashDlg(null)} loading={cash.isPending} onSubmit={(n, reason) => cash.mutate({ shiftId: s.shift.id, kind: cashDlg ?? 'OUT', amount: n, reason: reason ?? '' }, { onError })} />}
      <Dialog open={!!report} onClose={() => setReport(null)} title="Báo cáo kết ca (Z)" size="sm" mode="center">
        {report && (
          <div className="text-sm">
            <Row label="Doanh thu" value={money(report.revenue)} bold />
            <Row label="Số bill" value={report.billCount} />
            <Row label="Tiền mặt dự kiến" value={moneyPlain(report.expectedCash)} />
            <Row label="Tiền mặt đếm" value={moneyPlain(report.shift.closingCashCounted ?? 0)} />
            <Row label="Chênh lệch" value={<span className={cn((report.shift.variance ?? 0) < 0 ? 'text-red-700' : 'text-emerald-700')}>{moneyPlain(report.shift.variance ?? 0)}</span>} bold />
            <p className="mt-2 text-xs text-ink-500">Báo cáo đã được gửi tới máy in hóa đơn của cơ sở.</p>
          </div>
        )}
      </Dialog>
    </div>
  );
}

function AmountDialog({ open, title, hint, withNotes, withReason, onClose, onSubmit, loading }: { open: boolean; title: string; hint?: string; withNotes?: boolean; withReason?: boolean; onClose: () => void; onSubmit: (amount: number, extra?: string) => void; loading?: boolean }) {
  const [text, setText] = useState('');
  const [extra, setExtra] = useState('');
  return (
    <Dialog open={open} onClose={() => { setText(''); setExtra(''); onClose(); }} title={title} size="sm" mode="center">
      {hint && <p className="mb-2 text-sm text-ink-500">{hint}</p>}
      <div className="mb-2 rounded-xl bg-paper px-4 py-3 text-right text-3xl font-bold tabular-nums">{moneyPlain(Number(text || 0))}</div>
      {withReason && <Input label="Lý do *" value={extra} onChange={(e) => setExtra(e.target.value)} className="mb-2" placeholder="Mua đá, trả shipper..." />}
      {withNotes && <Input label="Ghi chú" value={extra} onChange={(e) => setExtra(e.target.value)} className="mb-2" />}
      <NumberPad value={text} onChange={setText} quick={[500_000, 1_000_000, 2_000_000, 5_000_000].map((n) => ({ label: moneyPlain(n), value: String(n) }))} onSubmit={() => { if (loading) return; if (withReason && !extra.trim()) return; onSubmit(Number(text || 0), extra || undefined); setText(''); setExtra(''); }} submitLabel="Xác nhận" />
    </Dialog>
  );
}
