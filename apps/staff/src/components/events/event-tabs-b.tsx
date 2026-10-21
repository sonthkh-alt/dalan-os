'use client';

import { useEffect, useState } from 'react';
import { Plus, QrCode, Trash2 } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { useAction } from '@/lib/queries';
import { eventApi, useServiceCatalog, type AdjustmentKind, type DepositQr } from '@/lib/queries-ops';
import { addDays, bpsLabel, dateLabel, hhmmToMinutes, minutesToHhmm, vnDateTime, vnToday } from '@/lib/ops-utils';
import { cn, money, moneyPlain, qty } from '@/lib/utils';
import { renderQr } from '@/components/pay/qr-canvas';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Badge, Input, Row, Select, Textarea } from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';
import { Card, MoneyInput, NumberInput, Table } from '@/components/ops/ui';
import { ADJ_LABELS, ADJUSTABLE, DEPOSIT_ROW_STATUS, EVENT_PAYMENT_METHODS, PAYABLE, PAYMENT_KIND_LABELS, canGo } from './labels';
import { evInvalidate, useMenuItems, type TabProps } from './event-tabs-a';

const onErr = (e: unknown) => toast.error(errorMessage(e));
const METHOD_LABEL = (m: string) => EVENT_PAYMENT_METHODS.find((x) => x.value === m)?.label ?? m;

function DepositTable({ ev, onCollect }: { ev: TabProps['ev']; onCollect?: (seq: number, amount: number) => void }) {
  if (ev.deposits.length === 0) return <p className="py-3 text-center text-sm text-ink-500">Chưa có lịch đặt cọc.</p>;
  return (
    <Table head={['Đợt', 'Nội dung', 'Hạn', 'Số tiền', 'Trạng thái', '']}>
      {ev.deposits.map((d) => (
        <tr key={d.id}>
          <td className="px-3 py-2 font-bold">{d.seq}</td>
          <td className="px-3 py-2">
            {d.label}
            {d.percentBps ? <span className="text-ink-500"> ({bpsLabel(d.percentBps)})</span> : null}
          </td>
          <td className="px-3 py-2 whitespace-nowrap">{dateLabel(d.dueDate, false)}</td>
          <td className="px-3 py-2 text-right font-semibold tabular-nums">{money(d.amount)}</td>
          <td className="px-3 py-2">
            <Badge tone={DEPOSIT_ROW_STATUS[d.status]?.tone ?? 'neutral'}>{DEPOSIT_ROW_STATUS[d.status]?.label ?? d.status}</Badge>
          </td>
          <td className="px-3 py-2">
            {onCollect && (d.status === 'DUE' || d.status === 'OVERDUE') && (
              <Button size="sm" variant="outline" onClick={() => onCollect(d.seq, d.amount)}>
                Thu đợt này
              </Button>
            )}
          </td>
        </tr>
      ))}
    </Table>
  );
}

// ───────────────────────── Hợp đồng ─────────────────────────

interface StepDraft {
  label: string;
  mode: 'percent' | 'amount';
  percent: number | null;
  amount: number | null;
  dueDate: string;
}

export function ContractTab({ ev, canManage }: TabProps) {
  const allowed = canManage && canGo(ev.status, 'CONTRACTED');
  const [steps, setSteps] = useState<StepDraft[]>([
    { label: 'Cọc đợt 1 khi ký', mode: 'percent', percent: 30, amount: null, dueDate: addDays(vnToday(), 2) },
    { label: 'Cọc đợt 2', mode: 'percent', percent: 40, amount: null, dueDate: addDays(ev.eventDate, -7) < vnToday() ? vnToday() : addDays(ev.eventDate, -7) },
  ]);
  const [finalDue, setFinalDue] = useState(ev.eventDate);
  const [docUrl, setDocUrl] = useState('');
  const [note, setNote] = useState('');
  const total = ev.totals.total;
  const amountOf = (s: StepDraft) => (s.mode === 'percent' ? Math.round((total * (s.percent ?? 0)) / 100) : (s.amount ?? 0));
  const sum = steps.reduce((t, s) => t + amountOf(s), 0);
  const upd = (i: number, p: Partial<StepDraft>) => setSteps((ss) => ss.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const contract = useAction(
    () =>
      eventApi.contract(ev.id, {
        depositSteps: steps.map((s) => ({ label: s.label.trim(), dueDate: s.dueDate, ...(s.mode === 'percent' ? { percentBps: Math.round((s.percent ?? 0) * 100) } : { amount: s.amount ?? 0 }) })),
        finalDueDate: finalDue || undefined,
        ...(docUrl.trim() ? { signedDocumentUrl: docUrl.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    () => evInvalidate(ev.id),
    () => toast.success('Đã ký hợp đồng, lập lịch đặt cọc'),
  );
  const valid = steps.length > 0 && steps.every((s) => s.label.trim() && s.dueDate && amountOf(s) > 0) && sum <= total;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card title="Lịch đặt cọc">
        <DepositTable ev={ev} />
        {ev.status !== 'LEAD' && ev.status !== 'QUOTED' && <p className="mt-2 text-sm text-ink-500">Tổng hợp đồng tại thời điểm hiện tại: {money(total)}.</p>}
      </Card>
      <Card title="Ký hợp đồng">
        {!allowed ? (
          <p className="text-sm text-ink-500">{ev.status === 'LEAD' ? 'Lập báo giá trước khi ký hợp đồng.' : 'Hợp đồng chỉ ký khi tiệc ở trạng thái “Đã báo giá”.'}</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-ink-700">
              Tổng giá trị theo báo giá hiện tại: <b>{money(total)}</b>. Phần còn lại ({money(Math.max(0, total - sum))}) tự thành đợt “Thanh toán còn lại”.
            </p>
            {steps.map((s, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 rounded-xl border border-ink-100 p-2 sm:grid-cols-[1fr_120px_150px_150px_auto]">
                <Input value={s.label} onChange={(e) => upd(i, { label: e.target.value })} aria-label="Tên đợt" className="col-span-2 sm:col-span-1" />
                <select value={s.mode} onChange={(e) => upd(i, { mode: e.target.value as StepDraft['mode'] })} className="min-h-[48px] rounded-xl border border-ink-300 bg-white px-2" aria-label="Cách tính">
                  <option value="percent">Theo %</option>
                  <option value="amount">Số tiền</option>
                </select>
                {s.mode === 'percent' ? <NumberInput value={s.percent} onChange={(v) => upd(i, { percent: v })} min={0} suffix="%" /> : <MoneyInput value={s.amount} onChange={(v) => upd(i, { amount: v })} />}
                <Input type="date" value={s.dueDate} onChange={(e) => upd(i, { dueDate: e.target.value })} aria-label="Hạn" />
                <button type="button" onClick={() => setSteps((ss) => ss.filter((_, j) => j !== i))} className="flex h-12 w-12 items-center justify-center text-red-700" aria-label="Xóa đợt">
                  <Trash2 className="h-5 w-5" />
                </button>
                <div className="col-span-2 text-right text-sm text-ink-700 sm:col-span-5">= {money(amountOf(s))}</div>
              </div>
            ))}
            <Button variant="outline" onClick={() => setSteps((ss) => [...ss, { label: `Cọc đợt ${ss.length + 1}`, mode: 'percent', percent: 10, amount: null, dueDate: ev.eventDate }])} disabled={steps.length >= 6}>
              <Plus className="h-5 w-5" /> Thêm đợt
            </Button>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Hạn thanh toán còn lại" type="date" value={finalDue} onChange={(e) => setFinalDue(e.target.value)} />
              <Input label="Đường dẫn bản hợp đồng đã ký" value={docUrl} onChange={(e) => setDocUrl(e.target.value)} placeholder="https://..." />
            </div>
            <Input label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} />
            {sum > total && <p className="text-sm text-red-700">Tổng các đợt cọc vượt giá trị hợp đồng.</p>}
            <Button block onClick={() => contract.mutate(undefined, { onError: onErr })} loading={contract.isPending} disabled={!valid}>
              Ký hợp đồng ({money(sum)} cọc)
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

// ───────────────────────── Thanh toán ─────────────────────────

export function PaymentsTab({ ev, canCollect }: TabProps) {
  const allowed = canCollect && PAYABLE.includes(ev.status);
  const nextDue = ev.deposits.find((d) => d.status === 'DUE' || d.status === 'OVERDUE');
  const [kind, setKind] = useState<'DEPOSIT' | 'BALANCE' | 'REFUND'>(nextDue ? 'DEPOSIT' : 'BALANCE');
  const [method, setMethod] = useState('BANK_TRANSFER');
  const [amount, setAmount] = useState<number | null>(nextDue?.amount ?? (ev.totals.due || null));
  const [seq, setSeq] = useState<number | ''>(nextDue?.seq ?? '');
  const [ref, setRef] = useState('');
  const [note, setNote] = useState('');
  const [qr, setQr] = useState<(DepositQr & { image: string | null }) | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const pay = useAction(
    () => eventApi.pay(ev.id, { kind, method, amount: amount ?? 0, ...(kind === 'DEPOSIT' && seq ? { depositSeq: seq } : {}), ...(ref.trim() ? { externalRef: ref.trim() } : {}), ...(note.trim() ? { note: note.trim() } : {}) }),
    () => evInvalidate(ev.id),
    () => {
      toast.success(kind === 'REFUND' ? 'Đã ghi nhận hoàn tiền' : 'Đã ghi nhận thanh toán');
      setQr(null);
      setRef('');
      setNote('');
    },
  );
  useEffect(() => {
    setQr(null);
  }, [amount, method]);
  const showQr = async () => {
    setQrLoading(true);
    try {
      const r = await eventApi.depositQr(ev.id, amount ?? undefined);
      setQr({ ...r, image: r.qrDataUrl ?? (await renderQr(r.payload)) });
    } catch (e) {
      onErr(e);
    } finally {
      setQrLoading(false);
    }
  };
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="space-y-3">
        <Card title="Tổng hợp">
          <Row label="Tổng giá trị tiệc" value={money(ev.totals.total)} bold />
          <Row label="Đã cọc" value={money(ev.totals.depositsPaid)} />
          <Row label="Đã thu (trừ hoàn)" value={money(ev.totals.paid)} className="text-emerald-800" />
          <Row label="Còn phải thu" value={money(ev.totals.due)} bold className="text-brand-800" />
        </Card>
        <Card title="Lịch đặt cọc">
          <DepositTable
            ev={ev}
            onCollect={
              allowed
                ? (s, a) => {
                    setKind('DEPOSIT');
                    setSeq(s);
                    setAmount(a);
                  }
                : undefined
            }
          />
        </Card>
        <Card title="Các khoản đã thu">
          {ev.payments.length === 0 ? (
            <p className="py-3 text-center text-sm text-ink-500">Chưa có khoản thu.</p>
          ) : (
            <ul className="divide-y divide-ink-100 text-sm">
              {ev.payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="min-w-0 flex-1">
                    <b>{PAYMENT_KIND_LABELS[p.kind] ?? p.kind}</b> · {METHOD_LABEL(p.method)}
                    <span className="block text-xs text-ink-500">
                      {vnDateTime(p.paidAt)}
                      {p.externalRef ? ` · Mã GD ${p.externalRef}` : ''}
                      {p.note ? ` · ${p.note}` : ''}
                    </span>
                  </span>
                  <span className={cn('font-semibold tabular-nums', p.kind === 'REFUND' && 'text-red-700')}>
                    {p.kind === 'REFUND' ? '-' : ''}
                    {money(p.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Card title="Thu tiền">
        {!allowed ? (
          <p className="text-sm text-ink-500">{canCollect ? 'Chỉ thu tiền khi tiệc đã báo giá/ký hợp đồng và chưa đóng hồ sơ.' : 'Bạn không có quyền thu tiền tiệc.'}</p>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="Loại khoản" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                <option value="DEPOSIT">Đặt cọc</option>
                <option value="BALANCE">Thanh toán còn lại</option>
                <option value="REFUND">Hoàn tiền cho khách</option>
              </Select>
              <Select label="Hình thức" value={method} onChange={(e) => setMethod(e.target.value)}>
                {EVENT_PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
              <MoneyInput label="Số tiền" value={amount} onChange={setAmount} />
              {kind === 'DEPOSIT' && ev.deposits.length > 0 && (
                <Select label="Đợt cọc" value={String(seq)} onChange={(e) => setSeq(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">Đợt đến hạn sớm nhất</option>
                  {ev.deposits
                    .filter((d) => d.status !== 'PAID')
                    .map((d) => (
                      <option key={d.seq} value={d.seq}>
                        Đợt {d.seq}: {d.label} · {moneyPlain(d.amount)}
                      </option>
                    ))}
                </Select>
              )}
              <Input label={method === 'CARD_TERMINAL' ? 'Mã chuẩn chi / 4 số cuối thẻ' : 'Mã giao dịch (nếu có)'} value={ref} onChange={(e) => setRef(e.target.value)} />
              <Input label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setAmount(ev.totals.due)}>
                Còn phải thu {moneyPlain(ev.totals.due)}
              </Button>
              {nextDue && (
                <Button variant="outline" size="sm" onClick={() => setAmount(nextDue.amount)}>
                  Đợt {nextDue.seq}: {moneyPlain(nextDue.amount)}
                </Button>
              )}
            </div>
            {method === 'BANK_TRANSFER' && kind !== 'REFUND' && (
              <div className="rounded-xl border border-ink-100 bg-paper p-3">
                {!qr ? (
                  <Button variant="secondary" onClick={showQr} loading={qrLoading} disabled={!amount}>
                    <QrCode className="h-5 w-5" /> Hiện mã VietQR {amount ? money(amount) : ''}
                  </Button>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-center">
                    {qr.image ? <img src={qr.image} alt="Mã VietQR chuyển khoản" className="h-60 w-60 rounded-xl bg-white p-2" /> : <p className="text-sm text-ink-500">Không dựng được ảnh QR, khách chuyển theo thông tin bên dưới.</p>}
                    <div className="text-2xl font-black text-brand-800 tabular-nums">{money(qr.amount)}</div>
                    <div className="text-sm">
                      {qr.bank.accountName} · STK <b>{qr.bank.accountNo}</b>
                    </div>
                    <div className="text-sm">
                      Nội dung: <b className="font-mono">{qr.purpose}</b>
                    </div>
                    {qr.forDeposit && <div className="text-xs text-ink-500">Cho đợt {qr.forDeposit.seq}: {qr.forDeposit.label}</div>}
                  </div>
                )}
              </div>
            )}
            <Button block size="lg" variant={kind === 'REFUND' ? 'danger' : 'success'} onClick={() => pay.mutate(undefined, { onError: onErr })} loading={pay.isPending} disabled={!amount}>
              {kind === 'REFUND' ? 'Ghi nhận hoàn tiền' : method === 'BANK_TRANSFER' ? 'Xác nhận đã nhận chuyển khoản' : 'Ghi nhận đã thu'} {amount ? money(amount) : ''}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

// ───────────────────────── Chốt mâm ─────────────────────────

export function ConfirmTab({ ev, canManage }: TabProps) {
  const allowed = canManage && canGo(ev.status, 'CONFIRMED');
  const [tables, setTables] = useState<number | null>(ev.confirmedTables ?? ev.expectedTables);
  const [reserve, setReserve] = useState<number | null>(ev.reserveTables || Math.ceil((ev.confirmedTables ?? ev.expectedTables) * 0.05));
  const [gpt, setGpt] = useState<number | null>(ev.guestsPerTable);
  const [menuTables, setMenuTables] = useState<Record<string, number>>(() => Object.fromEntries(ev.menus.map((m) => [m.id, m.tables])));
  const multi = ev.menus.length > 1;
  const menuSum = Object.values(menuTables).reduce((s, n) => s + n, 0);
  const confirm = useAction(
    () => eventApi.confirm(ev.id, { confirmedTables: tables ?? 0, reserveTables: reserve ?? 0, ...(gpt ? { guestsPerTable: gpt } : {}), ...(multi ? { menuTables: Object.entries(menuTables).map(([menuId, t]) => ({ menuId, tables: t })) } : {}) }),
    () => evInvalidate(ev.id),
    () => toast.success('Đã chốt số mâm và thực đơn'),
  );
  return (
    <Card title="Chốt số mâm, thực đơn cuối">
      {!allowed && <p className="mb-3 text-sm text-ink-500">Chốt mâm sau khi ký hợp đồng (hoặc chốt lại sau khi đã phát hành BEO). Trạng thái hiện tại không cho phép.</p>}
      <fieldset disabled={!allowed} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <NumberInput label="Số mâm chính thức" value={tables} onChange={setTables} min={1} step={1} />
          <NumberInput label="Mâm dự phòng" value={reserve} onChange={setReserve} min={0} step={1} hint="Bếp chuẩn bị thêm, chỉ tính tiền khi dùng" />
          <NumberInput label="Khách mỗi mâm" value={gpt} onChange={setGpt} min={1} step={1} />
        </div>
        {multi && (
          <div>
            <div className="mb-1 text-sm font-semibold text-ink-700">Chia mâm theo set</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {ev.menus.map((m) => (
                <NumberInput key={m.id} label={`${m.name} (${moneyPlain(m.pricePerTable)}/mâm)`} value={menuTables[m.id] ?? 0} onChange={(v) => setMenuTables((s) => ({ ...s, [m.id]: Math.max(0, Math.round(v ?? 0)) }))} min={0} step={1} />
              ))}
            </div>
            {menuSum !== (tables ?? 0) && <p className="mt-1 text-sm text-amber-700">Tổng mâm theo set ({menuSum}) khác số mâm chính thức ({tables ?? 0}).</p>}
          </div>
        )}
        <p className="text-sm text-ink-700">
          Tổng khách dự kiến: <b>{(tables ?? 0) * (gpt ?? 10)}</b> · Bếp chuẩn bị {(tables ?? 0) + (reserve ?? 0)} mâm.
        </p>
        {allowed && (
          <Button block onClick={() => confirm.mutate(undefined, { onError: onErr })} loading={confirm.isPending} disabled={!tables}>
            Chốt {tables ?? 0} mâm (+{reserve ?? 0} dự phòng)
          </Button>
        )}
      </fieldset>
    </Card>
  );
}

// ───────────────────────── BEO ─────────────────────────

export function BeoTab({ ev, canManage }: TabProps) {
  const allowed = canManage && ['CONFIRMED', 'BEO_ISSUED'].includes(ev.status);
  const latest = ev.beos[0];
  const start = hhmmToMinutes(ev.startTime);
  const confirmed = ev.confirmedTables ?? ev.expectedTables;
  const [timeline, setTimeline] = useState<{ time: string; activity: string; owner: string }[]>(
    latest?.content.timeline.map((t) => ({ time: t.time, activity: t.activity, owner: t.owner ?? '' })) ?? [
      { time: minutesToHhmm(Math.max(0, start - 180)), activity: 'Setup sảnh, kiểm tra âm thanh ánh sáng', owner: 'Kỹ thuật' },
      { time: minutesToHhmm(Math.max(0, start - 60)), activity: 'Đón khách', owner: 'Lễ tân' },
      { time: ev.startTime, activity: 'Khai tiệc, lên món khai vị', owner: 'Quản lý tiệc' },
      { time: ev.endTime, activity: 'Kết thúc, đếm vỏ đồ uống', owner: 'Quản lý tiệc' },
    ],
  );
  const [staffing, setStaffing] = useState<{ role: string; count: number; note: string }[]>(
    latest?.content.staffing.map((s) => ({ role: s.role, count: s.count, note: s.note ?? '' })) ?? [
      { role: 'Phục vụ', count: Math.ceil(confirmed / 2), note: '1 người / 2 mâm' },
      { role: 'Bếp', count: Math.max(2, Math.ceil(confirmed / 10)), note: '' },
      { role: 'Kỹ thuật', count: 2, note: '' },
    ],
  );
  const [setupNotes, setSetupNotes] = useState(latest?.content.setupNotes ?? '');
  const [specialNotes, setSpecialNotes] = useState(latest?.content.specialNotes ?? ev.internalNotes ?? '');
  const issue = useAction(
    () =>
      eventApi.beo(ev.id, {
        timeline: timeline.filter((t) => t.activity.trim()).map((t) => ({ time: t.time, activity: t.activity.trim(), ...(t.owner.trim() ? { owner: t.owner.trim() } : {}) })),
        staffing: staffing.filter((s) => s.role.trim()).map((s) => ({ role: s.role.trim(), count: s.count, ...(s.note.trim() ? { note: s.note.trim() } : {}) })),
        ...(setupNotes.trim() ? { setupNotes: setupNotes.trim() } : {}),
        ...(specialNotes.trim() ? { specialNotes: specialNotes.trim() } : {}),
      }),
    () => evInvalidate(ev.id),
    (r) => toast.success(`Đã phát hành BEO v${r.event.beos[0]?.version ?? ''}`),
  );
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card title={latest ? `Phát hành lại BEO (v${latest.version + 1})` : 'Phát hành BEO v1'}>
        {!allowed && <p className="mb-3 text-sm text-ink-500">BEO phát hành sau khi chốt thực đơn và số mâm.</p>}
        <fieldset disabled={!allowed} className="space-y-3">
          <div className="text-sm font-semibold text-ink-700">Kịch bản chương trình</div>
          {timeline.map((t, i) => (
            <div key={i} className="grid grid-cols-[100px_1fr_auto] gap-2 sm:grid-cols-[100px_1fr_140px_auto]">
              <Input type="time" value={t.time} onChange={(e) => setTimeline((ts) => ts.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)))} aria-label="Giờ" />
              <Input value={t.activity} onChange={(e) => setTimeline((ts) => ts.map((x, j) => (j === i ? { ...x, activity: e.target.value } : x)))} aria-label="Hoạt động" />
              <Input value={t.owner} onChange={(e) => setTimeline((ts) => ts.map((x, j) => (j === i ? { ...x, owner: e.target.value } : x)))} placeholder="Phụ trách" className="hidden sm:block" aria-label="Phụ trách" />
              <button type="button" onClick={() => setTimeline((ts) => ts.filter((_, j) => j !== i))} className="flex h-12 w-10 items-center justify-center text-red-700" aria-label="Xóa">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => setTimeline((ts) => [...ts, { time: ev.startTime, activity: '', owner: '' }])}>
            <Plus className="h-4 w-4" /> Thêm mốc
          </Button>
          <div className="text-sm font-semibold text-ink-700">Phân công nhân sự</div>
          {staffing.map((s, i) => (
            <div key={i} className="grid grid-cols-[1fr_90px_auto] gap-2 sm:grid-cols-[1fr_90px_1fr_auto]">
              <Input value={s.role} onChange={(e) => setStaffing((ss) => ss.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))} aria-label="Bộ phận" />
              <NumberInput value={s.count} onChange={(v) => setStaffing((ss) => ss.map((x, j) => (j === i ? { ...x, count: Math.max(0, Math.round(v ?? 0)) } : x)))} min={0} step={1} />
              <Input value={s.note} onChange={(e) => setStaffing((ss) => ss.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} placeholder="Ghi chú" className="hidden sm:block" aria-label="Ghi chú" />
              <button type="button" onClick={() => setStaffing((ss) => ss.filter((_, j) => j !== i))} className="flex h-12 w-10 items-center justify-center text-red-700" aria-label="Xóa">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => setStaffing((ss) => [...ss, { role: '', count: 1, note: '' }])}>
            <Plus className="h-4 w-4" /> Thêm bộ phận
          </Button>
          <Textarea label="Bố trí sảnh, setup" value={setupNotes} onChange={(e) => setSetupNotes(e.target.value)} />
          <Textarea label="Lưu ý đặc biệt (dị ứng, khách VIP, tôn giáo)" value={specialNotes} onChange={(e) => setSpecialNotes(e.target.value)} />
          {allowed && (
            <Button block onClick={() => issue.mutate(undefined, { onError: onErr })} loading={issue.isPending}>
              Phát hành BEO v{(latest?.version ?? 0) + 1}
            </Button>
          )}
        </fieldset>
      </Card>
      <div className="space-y-3">
        <Card title="Các phiên bản BEO">
          {ev.beos.length === 0 ? (
            <p className="py-3 text-center text-sm text-ink-500">Chưa phát hành BEO.</p>
          ) : (
            <ul className="space-y-2">
              {ev.beos.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-ink-100 p-3">
                  <span className="text-lg font-black">v{b.version}</span>
                  <Badge tone={b.status === 'ISSUED' ? 'success' : 'neutral'}>{b.status === 'ISSUED' ? 'Đang hiệu lực' : 'Đã thay thế'}</Badge>
                  <span className="text-sm text-ink-500">
                    {vnDateTime(b.issuedAt ?? b.createdAt)} · {b.content.issuedBy}
                  </span>
                  <a href={`/events/${ev.id}/print/beo?v=${b.version}`} target="_blank" rel="noreferrer" className="ml-auto min-h-[40px] rounded-xl border border-ink-300 px-3 py-2 text-sm font-semibold hover:bg-ink-100">
                    In / PDF
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {latest && (
          <Card title={`Bảng định lượng bếp (BEO v${latest.version})`}>
            <Table head={['Món', 'Số mâm', 'Tổng SL', 'Đơn vị']}>
              {latest.content.kitchenQuantities.map((k, i) => (
                <tr key={i}>
                  <td className="px-3 py-2">{k.name}</td>
                  <td className="px-3 py-2 tabular-nums">{k.tables}</td>
                  <td className="px-3 py-2 font-semibold tabular-nums">{qty(k.quantity)}</td>
                  <td className="px-3 py-2">{k.unit ?? ''}</td>
                </tr>
              ))}
            </Table>
          </Card>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Phát sinh ngày tiệc ─────────────────────────

export function AdjustTab({ ev, canManage, canSettle }: TabProps) {
  const allowed = (canManage || canSettle) && ADJUSTABLE.includes(ev.status);
  const items = useMenuItems();
  const catalog = useServiceCatalog();
  const beverages = items.filter((i) => i.countEmpties);
  const tablePrice = ev.menus[0]?.pricePerTable ?? 0;
  const [kind, setKind] = useState<AdjustmentKind>('EXTRA_TABLE');
  const [description, setDescription] = useState('Mâm phát sinh');
  const [quantity, setQuantity] = useState<number | null>(1);
  const [unitPrice, setUnitPrice] = useState<number | null>(tablePrice);
  const [amount, setAmount] = useState<number | null>(null);
  const flat = kind === 'DAMAGE' || kind === 'DISCOUNT';
  const pickKind = (k: AdjustmentKind) => {
    setKind(k);
    setAmount(null);
    setQuantity(1);
    if (k === 'EXTRA_TABLE') {
      setDescription(`Mâm phát sinh${ev.menus[0] ? ` (${ev.menus[0].name})` : ''}`);
      setUnitPrice(tablePrice);
    } else {
      setDescription(k === 'DISCOUNT' ? 'Giảm giá thiện chí' : k === 'DAMAGE' ? 'Hỏng vỡ: ' : '');
      setUnitPrice(0);
    }
  };
  const add = useAction(
    () => eventApi.adjust(ev.id, { kind, description: description.trim(), quantity: flat ? 1 : (quantity ?? 1), unitPrice: flat ? 0 : (unitPrice ?? 0), ...(flat ? { amount: amount ?? 0 } : {}) }),
    () => evInvalidate(ev.id),
    () => {
      toast.success('Đã ghi phát sinh');
      setQuantity(1);
      setAmount(null);
    },
  );
  const lineTotal = flat ? (amount ?? 0) * (kind === 'DISCOUNT' ? -1 : 1) : Math.round((quantity ?? 0) * (unitPrice ?? 0));
  const byKind = ev.adjustments.reduce<Record<string, number>>((m, a) => ({ ...m, [a.kind]: (m[a.kind] ?? 0) + a.amount }), {});
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card title="Ghi phát sinh">
        {!allowed ? (
          <p className="text-sm text-ink-500">Chỉ ghi phát sinh khi tiệc đã chốt hoặc đang diễn ra.</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(Object.keys(ADJ_LABELS) as AdjustmentKind[]).map((k) => (
                <button key={k} type="button" onClick={() => pickKind(k)} className={cn('min-h-[48px] rounded-xl border px-2 text-sm font-semibold', kind === k ? 'border-brand-700 bg-brand-50 text-brand-900' : 'border-ink-100 bg-white')}>
                  {ADJ_LABELS[k]}
                </button>
              ))}
            </div>
            {kind === 'BEVERAGE' && beverages.length > 0 && (
              <Select
                label="Đồ uống (đếm vỏ)"
                value=""
                onChange={(e) => {
                  const b = beverages.find((x) => x.id === e.target.value);
                  if (b) {
                    setDescription(`${b.name} (đếm vỏ)`);
                    setUnitPrice(b.price ?? 0);
                  }
                }}
              >
                <option value="">Chọn đồ uống...</option>
                {beverages.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} · {moneyPlain(b.price ?? 0)}/{b.unit}
                  </option>
                ))}
              </Select>
            )}
            {kind === 'SERVICE' && (
              <Select
                label="Từ danh mục dịch vụ"
                value=""
                onChange={(e) => {
                  const c = catalog.data?.find((x) => x.id === e.target.value);
                  if (c) {
                    setDescription(c.name);
                    setUnitPrice(c.price);
                  }
                }}
              >
                <option value="">Chọn dịch vụ...</option>
                {(catalog.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {moneyPlain(c.price)}/{c.unit}
                  </option>
                ))}
              </Select>
            )}
            <Input label="Nội dung" value={description} onChange={(e) => setDescription(e.target.value)} />
            {flat ? (
              <MoneyInput label={kind === 'DISCOUNT' ? 'Số tiền giảm' : 'Số tiền bồi thường'} value={amount} onChange={setAmount} />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <NumberInput label={kind === 'BEVERAGE' ? 'Số vỏ đếm được' : kind === 'EXTRA_TABLE' ? 'Số mâm thêm' : 'Số lượng'} value={quantity} onChange={setQuantity} min={0} />
                <MoneyInput label="Đơn giá" value={unitPrice} onChange={setUnitPrice} />
              </div>
            )}
            <p className={cn('text-right text-lg font-bold tabular-nums', lineTotal < 0 && 'text-emerald-700')}>{money(lineTotal)}</p>
            <Button block onClick={() => add.mutate(undefined, { onError: onErr })} loading={add.isPending} disabled={!description.trim() || lineTotal === 0}>
              Ghi phát sinh
            </Button>
          </div>
        )}
      </Card>
      <Card title="Đã ghi" actions={<span className="font-semibold tabular-nums">{money(ev.totals.adjustmentsTotal)}</span>}>
        {ev.adjustments.length === 0 ? (
          <p className="py-3 text-center text-sm text-ink-500">Chưa có phát sinh.</p>
        ) : (
          <>
            <ul className="divide-y divide-ink-100 text-sm">
              {ev.adjustments.map((a) => (
                <li key={a.id} className="flex items-center gap-2 py-2">
                  <Badge>{ADJ_LABELS[a.kind]}</Badge>
                  <span className="min-w-0 flex-1">
                    {a.description}
                    <span className="block text-xs text-ink-500">
                      {a.kind === 'DAMAGE' || a.kind === 'DISCOUNT' ? '' : `${qty(a.quantity)} × ${moneyPlain(a.unitPrice)} · `}
                      {vnDateTime(a.createdAt)}
                    </span>
                  </span>
                  <span className={cn('font-semibold tabular-nums', a.amount < 0 && 'text-emerald-700')}>{money(a.amount)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 border-t border-ink-100 pt-2 text-sm">
              {Object.entries(byKind).map(([k, v]) => (
                <Row key={k} label={ADJ_LABELS[k as AdjustmentKind]} value={money(v)} />
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// ───────────────────────── Quyết toán ─────────────────────────

export function SettleTab({ ev, canSettle, onGoPayments }: TabProps & { onGoPayments: () => void }) {
  const [confirmSettle, setConfirmSettle] = useState(false);
  const settle = useAction(() => eventApi.settle(ev.id), () => evInvalidate(ev.id), () => {
    setConfirmSettle(false);
    toast.success('Đã quyết toán tiệc');
  });
  const close = useAction(() => eventApi.close(ev.id), () => evInvalidate(ev.id), () => toast.success('Đã đóng hồ sơ tiệc'));
  const t = ev.totals;
  const byKind = ev.adjustments.reduce<Record<string, number>>((m, a) => ({ ...m, [a.kind]: (m[a.kind] ?? 0) + a.amount }), {});
  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_360px]">
      <Card title="Bảng quyết toán">
        <Table head={['Khoản mục', 'Chi tiết', 'Thành tiền']}>
          {ev.menus.map((m) => (
            <tr key={m.id}>
              <td className="px-3 py-2">Thực đơn: {m.name}</td>
              <td className="px-3 py-2 tabular-nums">
                {m.tables} mâm × {moneyPlain(m.pricePerTable)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{moneyPlain(m.tables * m.pricePerTable)}</td>
            </tr>
          ))}
          {ev.services.map((s) => (
            <tr key={s.id}>
              <td className="px-3 py-2">Dịch vụ: {s.name}</td>
              <td className="px-3 py-2 tabular-nums">{s.isIncluded ? 'Tặng kèm' : `${qty(s.quantity)} × ${moneyPlain(s.unitPrice)}`}</td>
              <td className="px-3 py-2 text-right tabular-nums">{s.isIncluded ? '0' : moneyPlain(s.total)}</td>
            </tr>
          ))}
          {Object.entries(byKind).map(([k, v]) => (
            <tr key={k}>
              <td className="px-3 py-2">Phát sinh: {ADJ_LABELS[k as AdjustmentKind]}</td>
              <td className="px-3 py-2 text-ink-500">{ev.adjustments.filter((a) => a.kind === k).length} dòng</td>
              <td className="px-3 py-2 text-right tabular-nums">{moneyPlain(v)}</td>
            </tr>
          ))}
        </Table>
        <div className="mt-3 rounded-xl border border-ink-100 bg-paper px-3 py-2 text-sm">
          <Row label="Thực đơn" value={moneyPlain(t.subtotalMenu)} />
          <Row label="Dịch vụ" value={moneyPlain(t.subtotalServices)} />
          <Row label="Phát sinh" value={moneyPlain(t.adjustmentsTotal)} />
          {t.discountAmount > 0 && <Row label="Giảm giá" value={`-${moneyPlain(t.discountAmount)}`} />}
          {t.serviceChargeAmount > 0 && <Row label={`Phí phục vụ ${bpsLabel(ev.serviceChargeBps)}`} value={moneyPlain(t.serviceChargeAmount)} />}
          <Row label={`Trong đó VAT ${bpsLabel(ev.vatBps)}`} value={moneyPlain(t.vatAmount)} className="text-ink-500" />
          <Row label="Tổng quyết toán" value={money(t.total)} bold className="border-t border-ink-100 pt-2" />
          <Row label="Đã cọc" value={`-${moneyPlain(t.depositsPaid)}`} />
          <Row label="Đã thu (gồm cọc, trừ hoàn)" value={moneyPlain(t.paid)} className="text-emerald-800" />
          <Row label="Còn phải thu" value={money(t.due)} bold className="text-brand-800" />
        </div>
      </Card>
      <Card title="Hoàn tất">
        <div className="space-y-3 text-sm">
          {canGo(ev.status, 'SETTLED') && canSettle && (
            <>
              <p>Quyết toán khóa tổng tiền, miễn các đợt cọc chưa thu (gộp vào khoản còn phải thu) và tạo hóa đơn điện tử nháp nếu có mã số thuế.</p>
              <Button block onClick={() => setConfirmSettle(true)}>
                Quyết toán {money(t.total)}
              </Button>
            </>
          )}
          {canGo(ev.status, 'CLOSED') && canSettle && (
            <>
              {t.due > 0 ? (
                <>
                  <p className="text-amber-800">Còn phải thu {money(t.due)} trước khi đóng hồ sơ.</p>
                  <Button block variant="outline" onClick={onGoPayments}>
                    Thu tiền còn lại
                  </Button>
                </>
              ) : (
                <Button block variant="success" onClick={() => close.mutate(undefined, { onError: onErr })} loading={close.isPending}>
                  Đóng hồ sơ tiệc
                </Button>
              )}
            </>
          )}
          {!canGo(ev.status, 'SETTLED') && !canGo(ev.status, 'CLOSED') && <p className="text-ink-500">{ev.status === 'CLOSED' ? 'Hồ sơ đã đóng.' : 'Quyết toán khi tiệc đang diễn ra hoặc đã kết thúc (trạng thái “Đang diễn ra”).'}</p>}
          {ev.settledTotal !== null && <p>Đã quyết toán: {money(ev.settledTotal)}</p>}
          {ev.eInvoices.length > 0 && (
            <div className="rounded-xl bg-paper p-2">
              Hóa đơn điện tử:{' '}
              {ev.eInvoices.map((i) => (
                <span key={i.id}>
                  {i.invoiceNo ?? 'chưa có số'} ({i.status === 'DRAFT' ? 'nháp' : i.status}){' '}
                </span>
              ))}
            </div>
          )}
        </div>
      </Card>
      <ConfirmDialog open={confirmSettle} onClose={() => setConfirmSettle(false)} title="Quyết toán tiệc?" message={`Tổng ${money(t.total)}, đã thu ${money(t.paid)}, còn phải thu ${money(t.due)}.`} confirmLabel="Quyết toán" loading={settle.isPending} onConfirm={() => settle.mutate(undefined, { onError: onErr })} />
    </div>
  );
}
