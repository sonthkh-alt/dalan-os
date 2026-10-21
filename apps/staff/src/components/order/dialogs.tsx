'use client';

import { useEffect, useMemo, useState } from 'react';
import { VOID_REASON_LABELS } from '@dalan/contracts';
import { useFloor } from '@/lib/queries';
import type { FloorTable, OrderLine, SessionDetail } from '@/lib/types';
import { cn, moneyPlain, qty } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { NumberPad } from '@/components/ui/number-pad';
import { Input, Segmented, Textarea } from '@/components/ui/primitives';

type VoidReason = keyof typeof VOID_REASON_LABELS;

/** Hủy món: lý do bắt buộc, cờ hao phí với món đã nấu; PIN quản lý hỏi riêng khi API yêu cầu. */
export function VoidLineDialog({ line, onClose, onSubmit, loading }: { line: OrderLine | null; onClose: () => void; onSubmit: (input: { reason: VoidReason; note?: string; waste: boolean }) => void; loading?: boolean }) {
  const [reason, setReason] = useState<VoidReason>('GUEST_CHANGED_MIND');
  const [note, setNote] = useState('');
  const [waste, setWaste] = useState(false);
  useEffect(() => {
    if (line) {
      setReason('GUEST_CHANGED_MIND');
      setNote('');
      setWaste(line.status === 'READY' || line.status === 'SERVED' || line.status === 'PREPARING');
    }
  }, [line]);
  if (!line) return null;
  const sent = line.status !== 'DRAFT' && line.status !== 'HOLD';
  return (
    <Dialog open onClose={onClose} title={`Hủy: ${line.nameSnapshot}`} size="sm" mode="center">
      <p className="mb-3 text-sm text-ink-500">
        {qty(line.quantity)} {line.unitSnapshot} · {moneyPlain(line.lineTotal)}đ {sent && '· đã gửi bếp'}
      </p>
      <div className="grid grid-cols-1 gap-2">
        {(Object.keys(VOID_REASON_LABELS) as VoidReason[]).map((r) => (
          <button key={r} type="button" onClick={() => setReason(r)} className={cn('min-h-[44px] rounded-xl border px-3 text-left font-semibold', reason === r ? 'border-brand-700 bg-brand-50' : 'border-ink-100 bg-white')}>
            {VOID_REASON_LABELS[r]}
          </button>
        ))}
      </div>
      {sent && (
        <label className="mt-3 flex min-h-[44px] items-center gap-2 rounded-xl bg-amber-50 px-3 text-sm">
          <input type="checkbox" checked={waste} onChange={(e) => setWaste(e.target.checked)} className="h-5 w-5" />
          Món đã nấu (hao phí, không hoàn kho)
        </label>
      )}
      <Textarea label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} className="mt-3 min-h-[60px]" />
      <div className="mt-4 flex gap-2">
        <Button variant="outline" block onClick={onClose}>Không hủy</Button>
        <Button variant="danger" block loading={loading} onClick={() => onSubmit({ reason, note: note || undefined, waste })}>Hủy món</Button>
      </div>
    </Dialog>
  );
}

/** Sửa trọng lượng cân thực tế cho món bán theo kg. */
export function WeightDialog({ line, onClose, onSubmit, loading }: { line: OrderLine | null; onClose: () => void; onSubmit: (weightKg: number) => void; loading?: boolean }) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (line) setText(String(line.weightKg ?? line.quantity));
  }, [line]);
  if (!line) return null;
  const n = Number(text.replace(',', '.'));
  return (
    <Dialog open onClose={onClose} title={`Cân thực tế: ${line.nameSnapshot}`} size="sm" mode="center">
      <div className="mb-3 rounded-xl bg-paper px-4 py-3 text-center text-4xl font-bold tabular-nums">
        {text || '0'} <span className="text-lg text-ink-500">kg</span>
      </div>
      <p className="mb-2 text-center text-sm text-ink-500">Đơn giá {moneyPlain(line.unitPrice)}đ/kg → {Number.isFinite(n) ? moneyPlain(Math.round(line.unitPrice * n)) : '—'}đ</p>
      <NumberPad value={text} onChange={setText} decimal maxLength={7} onSubmit={() => Number.isFinite(n) && n > 0 && !loading && onSubmit(Math.round(n * 1000) / 1000)} submitLabel={loading ? 'Đang lưu...' : 'Lưu trọng lượng'} />
    </Dialog>
  );
}

/** Chuyển bàn, gộp bàn, tách bàn trên cùng một hộp thoại chọn bàn từ sơ đồ. */
export function MoveDialog({ open, session, onClose, onMove, onMerge, onSplit, loading }: { open: boolean; session: SessionDetail; onClose: () => void; onMove: (tableIds: string[]) => void; onMerge: (otherSessionId: string) => void; onSplit: (lineIds: string[], tableIds: string[], guestCount: number) => void; loading?: boolean }) {
  const [mode, setMode] = useState<'move' | 'merge' | 'split'>('move');
  const [tableIds, setTableIds] = useState<string[]>([]);
  const [lineIds, setLineIds] = useState<string[]>([]);
  const [guests, setGuests] = useState('2');
  const floor = useFloor();
  useEffect(() => {
    if (open) {
      setMode('move');
      setTableIds([]);
      setLineIds([]);
    }
  }, [open]);
  const tables = useMemo(() => (floor.data?.areas ?? []).flatMap((a) => a.tables.map((t) => ({ ...t, areaName: a.name }))), [floor.data]);
  const current = new Set(session.tables.map((t) => t.tableId));
  const candidates = tables.filter((t) => (mode === 'merge' ? t.session && t.session.id !== session.id : !t.session || current.has(t.id)));
  const splittable = session.orders.flatMap((o) => o.lines).filter((l) => ['SENT', 'PREPARING', 'READY', 'SERVED'].includes(l.status) && !l.isAdjustment);
  const toggle = (t: FloorTable) => {
    if (mode === 'merge') return onMerge(t.session!.id);
    setTableIds((cur) => (cur.includes(t.id) ? cur.filter((x) => x !== t.id) : [...cur, t.id]));
  };
  const canSubmit = mode === 'move' ? tableIds.length > 0 : mode === 'split' ? tableIds.length > 0 && lineIds.length > 0 : false;
  return (
    <Dialog open={open} onClose={onClose} title="Chuyển · Gộp · Tách bàn" size="lg" footer={
      mode !== 'merge' && (
        <div className="flex w-full gap-2">
          <Button variant="outline" onClick={onClose}>Đóng</Button>
          <Button block loading={loading} disabled={!canSubmit} onClick={() => (mode === 'move' ? onMove(tableIds) : onSplit(lineIds, tableIds, Number(guests) || 0))}>
            {mode === 'move' ? `Chuyển sang ${tableIds.length} bàn` : `Tách ${lineIds.length} món sang bàn mới`}
          </Button>
        </div>
      )
    }>
      <Segmented value={mode} onChange={(m) => { setMode(m); setTableIds([]); }} className="mb-3 w-full [&>button]:flex-1" options={[{ value: 'move', label: 'Chuyển bàn' }, { value: 'merge', label: 'Gộp bàn' }, { value: 'split', label: 'Tách bàn' }]} />
      {mode === 'split' && (
        <div className="mb-3">
          <p className="mb-1 text-sm font-semibold text-ink-700">Chọn món tách sang bàn mới</p>
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-ink-100 p-2">
            {splittable.map((l) => (
              <label key={l.id} className="flex min-h-[40px] items-center gap-2 text-sm">
                <input type="checkbox" className="h-5 w-5" checked={lineIds.includes(l.id)} onChange={(e) => setLineIds((cur) => (e.target.checked ? [...cur, l.id] : cur.filter((x) => x !== l.id)))} />
                <span className="flex-1">{qty(l.quantity)} × {l.nameSnapshot}</span>
                <span className="tabular-nums text-ink-500">{moneyPlain(l.lineTotal)}</span>
              </label>
            ))}
            {splittable.length === 0 && <p className="text-sm text-ink-500">Chưa có món đã gửi bếp để tách.</p>}
          </div>
          <Input label="Số khách bàn mới" inputMode="numeric" value={guests} onChange={(e) => setGuests(e.target.value.replace(/\D/g, ''))} className="mt-2" />
        </div>
      )}
      <p className="mb-1 text-sm font-semibold text-ink-700">{mode === 'merge' ? 'Chạm bàn đang có khách để gộp vào phiên này' : mode === 'move' ? 'Chọn bàn đích (có thể nhiều bàn)' : 'Chọn bàn trống cho phần tách'}</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {candidates.map((t) => (
          <button key={t.id} type="button" onClick={() => toggle(t)} className={cn('min-h-[56px] rounded-xl border p-2 text-left text-sm', tableIds.includes(t.id) ? 'border-brand-700 bg-brand-50' : current.has(t.id) ? 'border-ink-300 bg-ink-100' : 'border-ink-100 bg-white')}>
            <span className="block font-bold">{t.name}</span>
            <span className="block text-xs text-ink-500">{t.areaName}{t.session ? ` · ${t.session.code}` : ''}</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}

/** Đếm vỏ bia, nước, khăn lạnh: nhập số thực đếm cho từng món có cờ đếm vỏ. */
export function EmptiesDialog({ open, session, onClose, onSubmit, loading }: { open: boolean; session: SessionDetail; onClose: () => void; onSubmit: (counts: { itemId: string; countedQty: number }[]) => void; loading?: boolean }) {
  const items = useMemo(() => {
    const map = new Map<string, { itemId: string; name: string; unit: string; ordered: number }>();
    for (const l of session.orders.flatMap((o) => o.lines)) {
      if (!l.isCountedEmpties || !l.itemId || !['SENT', 'PREPARING', 'READY', 'SERVED'].includes(l.status)) continue;
      const e = map.get(l.itemId) ?? { itemId: l.itemId, name: l.nameSnapshot.replace(/ \(đếm vỏ\)$/, ''), unit: l.unitSnapshot, ordered: 0 };
      e.ordered += Number(l.quantity);
      map.set(l.itemId, e);
    }
    return [...map.values()];
  }, [session]);
  const [counts, setCounts] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) setCounts(Object.fromEntries(items.map((i) => [i.itemId, String(i.ordered)])));
  }, [open, items]);
  return (
    <Dialog open={open} onClose={onClose} title="Đếm vỏ cuối bữa" size="sm" mode="center" footer={
      <div className="flex w-full gap-2">
        <Button variant="outline" onClick={onClose}>Bỏ qua</Button>
        <Button block loading={loading} disabled={items.length === 0} onClick={() => onSubmit(items.map((i) => ({ itemId: i.itemId, countedQty: Number(counts[i.itemId] ?? i.ordered) || 0 })))}>Lưu số đếm</Button>
      </div>
    }>
      {items.length === 0 ? (
        <p className="py-4 text-center text-ink-500">Bàn này không có bia, nước hay khăn lạnh cần đếm.</p>
      ) : (
        <div className="space-y-2">
          {items.map((i) => (
            <div key={i.itemId} className="flex items-center gap-2 rounded-xl border border-ink-100 p-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{i.name}</div>
                <div className="text-xs text-ink-500">Đã gọi {i.ordered} {i.unit}</div>
              </div>
              <button type="button" onClick={() => setCounts((c) => ({ ...c, [i.itemId]: String(Math.max(0, Number(c[i.itemId] ?? 0) - 1)) }))} className="h-11 w-11 rounded-xl bg-ink-100 text-xl font-bold">−</button>
              <input inputMode="numeric" value={counts[i.itemId] ?? ''} onChange={(e) => setCounts((c) => ({ ...c, [i.itemId]: e.target.value.replace(/\D/g, '') }))} className="h-11 w-16 rounded-xl border border-ink-300 text-center text-xl font-bold" />
              <button type="button" onClick={() => setCounts((c) => ({ ...c, [i.itemId]: String(Number(c[i.itemId] ?? 0) + 1) }))} className="h-11 w-11 rounded-xl bg-brand-100 text-xl font-bold text-brand-800">+</button>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}

export function GuestCountDialog({ open, value, onClose, onSubmit, loading }: { open: boolean; value: number; onClose: () => void; onSubmit: (n: number) => void; loading?: boolean }) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    if (open) setText(String(value));
  }, [open, value]);
  return (
    <Dialog open={open} onClose={onClose} title="Số khách" size="sm" mode="center">
      <div className="mb-3 rounded-xl bg-paper px-4 py-3 text-center text-4xl font-bold tabular-nums">{text || '0'}</div>
      <NumberPad value={text} onChange={(v) => setText(v.slice(0, 3))} maxLength={3} quick={[2, 4, 6, 8, 10, 12].map((n) => ({ label: `${n}`, value: `${n}` }))} onSubmit={() => !loading && onSubmit(Number(text) || 0)} submitLabel="Lưu" />
    </Dialog>
  );
}
