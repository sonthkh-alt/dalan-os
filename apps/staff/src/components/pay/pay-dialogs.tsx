'use client';

import { useEffect, useMemo, useState } from 'react';
import { splitEqual } from '@dalan/domain';
import type { BillDetail, Payment, SessionDetail } from '@/lib/types';
import { cn, money, moneyPlain, qty } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { NumberPad } from '@/components/ui/number-pad';
import { Input, Segmented, Textarea } from '@/components/ui/primitives';

type BillMode = 'ALL' | 'BY_ITEM' | 'BY_PARTICIPANT' | 'EQUAL';

export function CreateBillDialog({ open, session, onClose, onSubmit, loading }: { open: boolean; session: SessionDetail; onClose: () => void; onSubmit: (body: { mode: BillMode; lineIds?: string[]; participantId?: string; parts?: number }) => void; loading?: boolean }) {
  const [mode, setMode] = useState<BillMode>('ALL');
  const [lineIds, setLineIds] = useState<string[]>([]);
  const [participantId, setParticipantId] = useState<string>('');
  const [parts, setParts] = useState('2');
  useEffect(() => {
    if (open) {
      setMode('ALL');
      setLineIds([]);
    }
  }, [open]);
  const billable = session.orders.flatMap((o) => o.lines).filter((l) => ['SENT', 'PREPARING', 'READY', 'SERVED'].includes(l.status));
  const draft = session.orders.flatMap((o) => o.lines).some((l) => l.status === 'DRAFT' || l.status === 'HOLD');
  const canSubmit = mode === 'ALL' ? !draft : mode === 'BY_ITEM' ? lineIds.length > 0 : mode === 'BY_PARTICIPANT' ? !!participantId : Number(parts) >= 2;
  const shares = useMemo(() => (mode === 'EQUAL' && Number(parts) >= 2 ? splitEqual(session.totals.total, Number(parts)) : []), [mode, parts, session.totals.total]);
  return (
    <Dialog open={open} onClose={onClose} title="Tạo bill" size="md" footer={
      <div className="flex w-full gap-2">
        <Button variant="outline" onClick={onClose}>Đóng</Button>
        <Button block loading={loading} disabled={!canSubmit} onClick={() => onSubmit(mode === 'ALL' ? { mode } : mode === 'BY_ITEM' ? { mode, lineIds } : mode === 'BY_PARTICIPANT' ? { mode, participantId } : { mode, parts: Number(parts) })}>
          Tạo bill
        </Button>
      </div>
    }>
      <Segmented value={mode} onChange={setMode} className="mb-3 w-full [&>button]:flex-1" options={[{ value: 'ALL', label: 'Cả bàn' }, { value: 'BY_ITEM', label: 'Theo món' }, { value: 'BY_PARTICIPANT', label: 'Theo khách' }, { value: 'EQUAL', label: 'Chia đều' }]} />
      {mode === 'ALL' && (
        <div className="rounded-xl bg-paper p-3 text-sm">
          <p>Tính toàn bộ {billable.length} món đã gửi bếp. Tạm tính <b>{money(session.totals.total)}</b>.</p>
          {draft && <p className="mt-1 font-semibold text-amber-700">Còn món nháp hoặc đang giữ: gửi bếp hoặc bỏ trước khi tính cả bàn.</p>}
        </div>
      )}
      {mode === 'BY_ITEM' && (
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {billable.map((l) => (
            <label key={l.id} className="flex min-h-[44px] items-center gap-2 rounded-xl border border-ink-100 px-2 text-sm">
              <input type="checkbox" className="h-5 w-5" checked={lineIds.includes(l.id)} onChange={(e) => setLineIds((c) => (e.target.checked ? [...c, l.id] : c.filter((x) => x !== l.id)))} />
              <span className="flex-1">{qty(l.quantity)} × {l.nameSnapshot}</span>
              <span className="tabular-nums">{moneyPlain(l.lineTotal)}</span>
            </label>
          ))}
        </div>
      )}
      {mode === 'BY_PARTICIPANT' && (
        <div className="grid grid-cols-2 gap-2">
          {session.participants.length === 0 && <p className="col-span-2 text-sm text-ink-500">Bàn này không có khách gọi qua QR, không chia theo khách được.</p>}
          {session.participants.map((p) => {
            const total = billable.filter((l) => l.participantId === p.id).reduce((s, l) => s + l.lineTotal, 0);
            return (
              <button key={p.id} type="button" onClick={() => setParticipantId(p.id)} className={cn('min-h-[56px] rounded-xl border p-2 text-left', participantId === p.id ? 'border-brand-700 bg-brand-50' : 'border-ink-100')}>
                <span className="block font-semibold">{p.nickname ?? 'Khách'}{p.isHost ? ' (mở bàn)' : ''}</span>
                <span className="text-xs text-ink-500">{moneyPlain(total)}</span>
              </button>
            );
          })}
        </div>
      )}
      {mode === 'EQUAL' && (
        <div>
          <Input label="Số phần" inputMode="numeric" value={parts} onChange={(e) => setParts(e.target.value.replace(/\D/g, ''))} />
          <div className="mt-2 flex flex-wrap gap-1">
            {[2, 3, 4, 5, 6, 8, 10].map((n) => (
              <button key={n} type="button" onClick={() => setParts(String(n))} className="min-h-[40px] rounded-full bg-ink-100 px-4 font-semibold">{n}</button>
            ))}
          </div>
          {shares.length > 0 && <p className="mt-2 text-sm text-ink-700">Mỗi phần khoảng <b>{moneyPlain(shares[0] ?? 0)}</b> (tổng {moneyPlain(session.totals.total)}).</p>}
        </div>
      )}
    </Dialog>
  );
}

export function DiscountDialog({ open, bill, onClose, onSubmit, loading }: { open: boolean; bill: BillDetail; onClose: () => void; onSubmit: (body: Record<string, unknown>) => void; loading?: boolean }) {
  const [kind, setKind] = useState<'PERCENT' | 'AMOUNT' | 'VOUCHER' | 'POINTS'>('PERCENT');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [voucher, setVoucher] = useState('');
  useEffect(() => {
    if (open) {
      setKind('PERCENT');
      setValue('');
      setReason('');
      setVoucher('');
    }
  }, [open]);
  const base = bill.subtotal - bill.lineDiscountTotal;
  const preview = kind === 'PERCENT' ? Math.round((base * Number(value || 0)) / 100) : kind === 'AMOUNT' ? Number(value || 0) : 0;
  const submit = () => {
    if (kind === 'PERCENT') return onSubmit({ kind, valueBps: Math.round(Number(value) * 100), reason });
    if (kind === 'AMOUNT') return onSubmit({ kind, amount: Number(value), reason });
    if (kind === 'VOUCHER') return onSubmit({ kind, voucherCode: voucher.trim() });
    return onSubmit({ kind: 'POINTS' });
  };
  const valid = kind === 'PERCENT' ? Number(value) > 0 && Number(value) <= 100 && reason.trim() : kind === 'AMOUNT' ? Number(value) > 0 && reason.trim() : kind === 'VOUCHER' ? voucher.trim().length > 0 : !!bill.customer;
  return (
    <Dialog open={open} onClose={onClose} title="Giảm giá" size="sm" mode="center" footer={
      <div className="flex w-full gap-2">
        <Button variant="outline" onClick={onClose}>Đóng</Button>
        <Button block loading={loading} disabled={!valid} onClick={submit}>Áp dụng{preview ? ` (-${moneyPlain(preview)})` : ''}</Button>
      </div>
    }>
      <Segmented value={kind} onChange={setKind} className="mb-3 w-full [&>button]:flex-1" options={[{ value: 'PERCENT', label: '%' }, { value: 'AMOUNT', label: 'Số tiền' }, { value: 'VOUCHER', label: 'Voucher' }, { value: 'POINTS', label: 'Điểm' }]} />
      {(kind === 'PERCENT' || kind === 'AMOUNT') && (
        <>
          <div className="mb-2 rounded-xl bg-paper px-4 py-3 text-center text-3xl font-bold tabular-nums">{value || '0'}{kind === 'PERCENT' ? '%' : 'đ'}</div>
          <NumberPad value={value} onChange={(v) => setValue(kind === 'PERCENT' ? v.slice(0, 3) : v)} quick={kind === 'PERCENT' ? [5, 10, 15, 20].map((n) => ({ label: `${n}%`, value: `${n}` })) : [20000, 50000, 100000].map((n) => ({ label: moneyPlain(n), value: `${n}` }))} />
          <Textarea label="Lý do (bắt buộc)" value={reason} onChange={(e) => setReason(e.target.value)} className="mt-2 min-h-[56px]" placeholder="Khách quen, sinh nhật, lỗi phục vụ..." />
        </>
      )}
      {kind === 'VOUCHER' && <Input label="Mã voucher" value={voucher} onChange={(e) => setVoucher(e.target.value.toUpperCase())} autoCapitalize="characters" />}
      {kind === 'POINTS' && (
        <div className="rounded-xl bg-paper p-3 text-sm">
          {bill.customer ? <p>Khách <b>{bill.customer.fullName ?? bill.customer.phone}</b> có <b>{bill.customer.pointsBalance}</b> điểm. Hệ thống sẽ dùng tối đa theo chính sách.</p> : <p className="text-amber-700">Chưa gắn khách thành viên vào bill này.</p>}
        </div>
      )}
    </Dialog>
  );
}

export function CashDialog({ open, due, onClose, onSubmit, loading }: { open: boolean; due: number; onClose: () => void; onSubmit: (amount: number, tendered: number) => void; loading?: boolean }) {
  const [tendered, setTendered] = useState('');
  useEffect(() => {
    if (open) setTendered(String(due));
  }, [open, due]);
  const t = Number(tendered || 0);
  const change = t - due;
  const quick = useMemo(() => {
    const denoms = [50_000, 100_000, 200_000, 500_000, 1_000_000, 2_000_000];
    const opts = new Set<number>([due]);
    for (const d of denoms) {
      const up = Math.ceil(due / d) * d;
      if (up > due) opts.add(up);
      if (d > due) opts.add(d);
    }
    return [...opts].sort((a, b) => a - b).slice(0, 5).map((n) => ({ label: moneyPlain(n), value: String(n) }));
  }, [due]);
  return (
    <Dialog open={open} onClose={onClose} title="Thu tiền mặt" size="sm" mode="center">
      <div className="mb-2 flex justify-between text-sm"><span className="text-ink-500">Còn phải thu</span><b className="tabular-nums">{moneyPlain(due)}</b></div>
      <div className="mb-1 text-xs text-ink-500">Khách đưa</div>
      <div className="mb-2 rounded-xl bg-paper px-4 py-3 text-right text-3xl font-bold tabular-nums">{moneyPlain(t)}</div>
      <div className={cn('mb-3 flex justify-between rounded-xl px-3 py-2 text-lg font-bold', change >= 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700')}>
        <span>{change >= 0 ? 'Tiền thừa' : 'Còn thiếu'}</span>
        <span className="tabular-nums">{moneyPlain(Math.abs(change))}</span>
      </div>
      <NumberPad value={tendered} onChange={setTendered} quick={quick} onSubmit={() => t > 0 && !loading && onSubmit(Math.min(t, due), t)} submitLabel={loading ? 'Đang ghi nhận...' : change >= 0 ? 'Thu tiền' : 'Thu một phần'} />
    </Dialog>
  );
}

export function CardDialog({ open, due, onClose, onSubmit, loading }: { open: boolean; due: number; onClose: () => void; onSubmit: (body: Record<string, unknown>) => void; loading?: boolean }) {
  const [sub, setSub] = useState<'CONTACTLESS' | 'APPLE_PAY' | 'GOOGLE_PAY' | 'CHIP'>('CONTACTLESS');
  const [last4, setLast4] = useState('');
  const [approval, setApproval] = useState('');
  const [amount, setAmount] = useState('');
  useEffect(() => {
    if (open) {
      setAmount(String(due));
      setLast4('');
      setApproval('');
    }
  }, [open, due]);
  return (
    <Dialog open={open} onClose={onClose} title="Thẻ / ví tại máy POS ngân hàng" size="sm" mode="center" footer={
      <div className="flex w-full gap-2">
        <Button variant="outline" onClick={onClose}>Đóng</Button>
        <Button block loading={loading} disabled={!(Number(amount) > 0)} onClick={() => onSubmit({ method: 'CARD_TERMINAL', subMethod: sub, amount: Math.min(Number(amount), due), cardLast4: last4 || undefined, approvalCode: approval || undefined })}>Ghi nhận</Button>
      </div>
    }>
      <p className="mb-3 text-sm text-ink-500">Quẹt/chạm trên máy POS ngân hàng rồi ghi nhận kết quả ở đây.</p>
      <div className="mb-3 grid grid-cols-2 gap-2">
        {([['CONTACTLESS', 'Thẻ không tiếp xúc'], ['APPLE_PAY', 'Apple Pay'], ['GOOGLE_PAY', 'Google Pay'], ['CHIP', 'Thẻ chip / quẹt']] as const).map(([v, l]) => (
          <button key={v} type="button" onClick={() => setSub(v)} className={cn('min-h-[44px] rounded-xl border px-2 text-sm font-semibold', sub === v ? 'border-brand-700 bg-brand-50' : 'border-ink-100')}>{l}</button>
        ))}
      </div>
      <div className="space-y-2">
        <Input label="Số tiền" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} />
        <Input label="4 số cuối thẻ" inputMode="numeric" maxLength={4} value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))} />
        <Input label="Mã chuẩn chi (trên biên lai)" value={approval} onChange={(e) => setApproval(e.target.value.toUpperCase())} />
      </div>
    </Dialog>
  );
}

export function VietQrDialog({ payment, bill, onClose, onConfirm, onCancel, loading }: { payment: (Payment & { qrDataUrl: string | null; bank: { bin: string | null; accountNo: string | null; accountName: string | null; purpose: string } | null }) | null; bill: BillDetail; onClose: () => void; onConfirm: (paymentId: string) => void; onCancel: (paymentId: string) => void; loading?: boolean }) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!payment) return setImgUrl(null);
    if (payment.qrDataUrl) return setImgUrl(payment.qrDataUrl);
    // Khi mở lại thanh toán đang chờ, dựng ảnh QR từ payload qua dịch vụ ảnh nội bộ không có; dùng canvas nhỏ gọn
    import('./qr-canvas').then((m) => m.renderQr(payment.qrPayload ?? '').then(setImgUrl)).catch(() => setImgUrl(null));
  }, [payment]);
  if (!payment) return null;
  return (
    <Dialog open onClose={onClose} title="Chuyển khoản VietQR" size="sm" mode="center" dismissible={!loading}>
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="text-3xl font-black text-brand-800 tabular-nums">{money(payment.amount)}</div>
        {imgUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imgUrl} alt="Mã VietQR" className="h-64 w-64 rounded-xl border border-ink-100" />
        ) : (
          <div className="flex h-64 w-64 items-center justify-center rounded-xl border border-ink-100 bg-paper text-sm text-ink-500">Đang tạo mã...</div>
        )}
        {payment.bank && (
          <div className="w-full rounded-xl bg-paper p-3 text-left text-sm">
            <div className="flex justify-between"><span className="text-ink-500">Ngân hàng</span><b>{payment.bank.bin}</b></div>
            <div className="flex justify-between"><span className="text-ink-500">Số tài khoản</span><b className="tabular-nums">{payment.bank.accountNo}</b></div>
            <div className="flex justify-between"><span className="text-ink-500">Chủ tài khoản</span><b>{payment.bank.accountName}</b></div>
            <div className="flex justify-between"><span className="text-ink-500">Nội dung</span><b>{payment.bank.purpose}</b></div>
          </div>
        )}
        <p className="text-xs text-ink-500">Bill {bill.code}. Khách quét bằng app ngân hàng; khi thấy tiền về, bấm "Đã nhận tiền".</p>
        <div className="flex w-full gap-2">
          <Button variant="outline" block loading={loading} onClick={() => onCancel(payment.id)}>Hủy QR</Button>
          <Button variant="success" block loading={loading} onClick={() => onConfirm(payment.id)}>Đã nhận tiền</Button>
        </div>
      </div>
    </Dialog>
  );
}

export function TaxInfoDialog({ open, bill, onClose, onSubmit, loading }: { open: boolean; bill: BillDetail; onClose: () => void; onSubmit: (info: Record<string, string> | null) => void; loading?: boolean }) {
  const [form, setForm] = useState({ buyerName: '', buyerTaxCode: '', buyerAddress: '', buyerEmail: '', buyerPhone: '' });
  useEffect(() => {
    if (open) setForm({ buyerName: bill.taxInvoiceInfo?.buyerName ?? '', buyerTaxCode: bill.taxInvoiceInfo?.buyerTaxCode ?? '', buyerAddress: bill.taxInvoiceInfo?.buyerAddress ?? '', buyerEmail: bill.taxInvoiceInfo?.buyerEmail ?? '', buyerPhone: bill.taxInvoiceInfo?.buyerPhone ?? '' });
  }, [open, bill]);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <Dialog open={open} onClose={onClose} title="Thông tin xuất hóa đơn điện tử" size="sm" mode="center" footer={
      <div className="flex w-full gap-2">
        {bill.taxInvoiceInfo && <Button variant="ghost" onClick={() => onSubmit(null)}>Xóa</Button>}
        <Button variant="outline" onClick={onClose}>Đóng</Button>
        <Button block loading={loading} disabled={!form.buyerName.trim()} onClick={() => onSubmit(Object.fromEntries(Object.entries(form).filter(([, v]) => v.trim())) as Record<string, string>)}>Lưu</Button>
      </div>
    }>
      <div className="space-y-2">
        <Input label="Tên đơn vị / khách hàng *" value={form.buyerName} onChange={set('buyerName')} />
        <Input label="Mã số thuế" inputMode="numeric" value={form.buyerTaxCode} onChange={set('buyerTaxCode')} />
        <Input label="Địa chỉ" value={form.buyerAddress} onChange={set('buyerAddress')} />
        <Input label="Email nhận hóa đơn" type="email" value={form.buyerEmail} onChange={set('buyerEmail')} />
        <Input label="Điện thoại" inputMode="tel" value={form.buyerPhone} onChange={set('buyerPhone')} />
      </div>
    </Dialog>
  );
}
