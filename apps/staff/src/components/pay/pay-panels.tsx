'use client';

import { useEffect, useMemo, useState } from 'react';
import { Banknote, CheckCircle2, CreditCard, QrCode, X } from 'lucide-react';
import type { BillDetail, Payment } from '@/lib/types';
import { cn, money, moneyPlain } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { NumberPad } from '@/components/ui/number-pad';
import { Input } from '@/components/ui/primitives';
import { cashOutcome, quickTenders } from './cash';

export type PayMethod = 'cash' | 'qr' | 'card';

const METHODS: { value: PayMethod; label: string; sub: string; icon: typeof Banknote }[] = [
  { value: 'cash', label: 'Tiền mặt', sub: 'Tính tiền thừa', icon: Banknote },
  { value: 'qr', label: 'VietQR', sub: 'Chuyển khoản', icon: QrCode },
  { value: 'card', label: 'Thẻ / ví', sub: 'Máy POS, Apple Pay', icon: CreditCard },
];

/** Ô chọn phương thức thanh toán cỡ lớn. */
export function MethodTiles({ value, onChange, qrPending }: { value: PayMethod; onChange: (m: PayMethod) => void; qrPending?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Phương thức thanh toán">
      {METHODS.map((m) => {
        const active = value === m.value;
        return (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(m.value)}
            className={cn('relative flex min-h-24 flex-col items-center justify-center gap-1 rounded-2xl border-2 px-2 text-center transition active:scale-[0.98]', active ? 'border-brand-700 bg-brand-700 text-white shadow-md' : 'border-ink-100 bg-white text-ink-900 hover:border-brand-300')}
          >
            <m.icon className="h-7 w-7" />
            <span className="text-base font-bold">{m.label}</span>
            <span className={cn('text-[11px]', active ? 'text-white/80' : 'text-ink-500')}>{m.sub}</span>
            {m.value === 'qr' && qrPending && <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-amber-400 animate-pulse-dot" />}
          </button>
        );
      })}
    </div>
  );
}

/** Thu tiền mặt: bàn phím số, mệnh giá nhanh (đúng tiền, làm tròn 50k/100k/500k), tiền thừa lớn rõ. */
export function CashPanel({ due, loading, onSubmit }: { due: number; loading?: boolean; onSubmit: (amount: number, tendered: number) => void }) {
  const [text, setText] = useState(String(due));
  useEffect(() => setText(String(due)), [due]);
  const tendered = Number(text || 0);
  const { amount, change, short } = cashOutcome(tendered, due);
  const quick = useMemo(() => quickTenders(due), [due]);
  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-paper p-3">
        <div className="flex items-center justify-between text-sm text-ink-500">
          <span>Khách đưa</span>
          {text !== String(due) && (
            <button type="button" onClick={() => setText('')} className="flex min-h-11 items-center gap-1 rounded-lg px-3 font-semibold text-ink-700 hover:bg-ink-100">
              <X className="h-4 w-4" /> Xóa
            </button>
          )}
        </div>
        <div className="text-right text-4xl font-black text-ink-900 tabular-nums">{moneyPlain(tendered)}</div>
      </div>
      <div className="flex flex-wrap gap-2">
        {quick.map((n, i) => (
          <button key={n} type="button" onClick={() => setText(String(n))} className={cn('min-h-11 rounded-full px-4 text-sm font-bold tabular-nums transition', tendered === n ? 'bg-ink-900 text-white' : 'bg-gold-100 text-ink-900 hover:bg-gold-300')}>
            {i === 0 ? `Đúng tiền · ${moneyPlain(n)}` : moneyPlain(n)}
          </button>
        ))}
      </div>
      <div className={cn('flex items-center justify-between rounded-2xl px-4 py-3', short > 0 ? 'bg-amber-50 text-amber-900' : 'bg-emerald-600 text-white')}>
        <span className="text-base font-semibold">{short > 0 ? 'Còn thiếu (thu một phần)' : 'Tiền thừa trả khách'}</span>
        <span className="text-3xl font-black tabular-nums">{moneyPlain(short > 0 ? short : change)}</span>
      </div>
      <NumberPad value={text} onChange={(v) => setText(v.replace(/^0+(?=\d)/, ''))} maxLength={11} />
      <Button size="xl" block variant="success" loading={loading} disabled={amount <= 0} onClick={() => onSubmit(amount, tendered)}>
        {short > 0 ? `Thu một phần ${moneyPlain(amount)}` : `Thu tiền mặt ${moneyPlain(amount)}`}
      </Button>
    </div>
  );
}

/** Tạo mã VietQR cho số tiền (mặc định = còn phải thu; nhập nhỏ hơn để thu một phần). */
export function QrStart({ due, loading, onCreate }: { due: number; loading?: boolean; onCreate: (amount: number) => void }) {
  const [text, setText] = useState(String(due));
  useEffect(() => setText(String(due)), [due]);
  const n = Math.min(Number(text || 0), due);
  return (
    <div className="space-y-3">
      <Input label="Số tiền chuyển khoản" inputMode="numeric" value={text} onChange={(e) => setText(e.target.value.replace(/\D/g, ''))} className="text-right text-2xl font-bold tabular-nums" />
      <div className="flex gap-2">
        <button type="button" onClick={() => setText(String(due))} className="min-h-11 rounded-full bg-gold-100 px-4 text-sm font-bold">Toàn bộ · {moneyPlain(due)}</button>
        {due >= 20_000 && <button type="button" onClick={() => setText(String(Math.round(due / 2)))} className="min-h-11 rounded-full bg-ink-100 px-4 text-sm font-bold">Một nửa</button>}
      </div>
      <Button size="xl" block loading={loading} disabled={!(n > 0)} onClick={() => onCreate(n)}>
        <QrCode className="h-6 w-6" /> Tạo mã VietQR {moneyPlain(n)}
      </Button>
      <p className="text-center text-xs text-ink-500">Mã hiển thị lớn để khách quét bằng ứng dụng ngân hàng.</p>
    </div>
  );
}

type QrPayment = Payment & { qrDataUrl?: string | null };

/** Mã VietQR cỡ lớn cho khách quét, kèm thông tin tài khoản và nút xác nhận đã nhận tiền. */
export function QrPanel({ payment, bill, purpose, loading, onConfirm, onCancel }: { payment: QrPayment; bill: BillDetail; purpose?: string; loading?: boolean; onConfirm: () => void; onCancel: () => void }) {
  const [img, setImg] = useState<string | null>(payment.qrDataUrl ?? null);
  useEffect(() => {
    if (payment.qrDataUrl) return setImg(payment.qrDataUrl);
    let alive = true;
    // Mở lại thanh toán đang chờ (sau khi tải lại trang): dựng ảnh QR từ payload trên trình duyệt
    import('./qr-canvas')
      .then((m) => m.renderQr(payment.qrPayload ?? ''))
      .then((url) => alive && setImg(url))
      .catch(() => alive && setImg(null));
    return () => {
      alive = false;
    };
  }, [payment.id, payment.qrDataUrl, payment.qrPayload]);
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="text-sm font-semibold text-ink-500">Khách quét mã để chuyển</div>
      <div className="text-4xl font-black text-brand-800 tabular-nums">{money(payment.amount)}</div>
      <div className="rounded-3xl border-4 border-brand-700 bg-white p-3 shadow-lg">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="Mã VietQR thanh toán" className="h-64 w-64 sm:h-72 sm:w-72 lg:h-80 lg:w-80" />
        ) : (
          <div className="flex h-64 w-64 items-center justify-center text-sm text-ink-500 sm:h-72 sm:w-72">{payment.qrPayload ? 'Đang tạo mã...' : 'Không có dữ liệu mã QR'}</div>
        )}
      </div>
      <div className="w-full max-w-sm rounded-2xl bg-paper p-3 text-left text-sm">
        <InfoRow label="Số tài khoản" value={bill.branch.bankAccountNo ?? '—'} />
        <InfoRow label="Chủ tài khoản" value={bill.branch.bankAccountName ?? '—'} />
        <InfoRow label="Ngân hàng (BIN)" value={bill.branch.bankBin ?? '—'} />
        <InfoRow label="Nội dung" value={purpose ?? `DL ${bill.code}`} />
      </div>
      <p className="max-w-sm text-xs text-ink-500">Khi tiền về, hệ thống tự xác nhận nếu đã kết nối ngân hàng; nếu không, kiểm tra ứng dụng ngân hàng rồi bấm “Đã nhận tiền”.</p>
      <div className="flex w-full max-w-sm gap-2">
        <Button variant="outline" size="lg" className="flex-1" loading={loading} onClick={onCancel}>
          Hủy mã
        </Button>
        <Button variant="success" size="lg" className="flex-[2]" loading={loading} onClick={onConfirm}>
          <CheckCircle2 className="h-5 w-5" /> Đã nhận tiền
        </Button>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <span className="text-ink-500">{label}</span>
      <b className="truncate text-right tabular-nums">{value}</b>
    </div>
  );
}

const CARD_SUBS = [
  ['CONTACTLESS', 'Thẻ chạm'],
  ['CHIP', 'Thẻ chip'],
  ['SWIPE', 'Quẹt thẻ'],
  ['APPLE_PAY', 'Apple Pay'],
  ['GOOGLE_PAY', 'Google Pay'],
  ['SAMSUNG_PAY', 'Samsung Pay'],
] as const;

/** Ghi nhận thanh toán thẻ/ví đã quẹt trên máy POS ngân hàng. */
export function CardPanel({ due, loading, onSubmit }: { due: number; loading?: boolean; onSubmit: (body: Record<string, unknown>) => void }) {
  const [sub, setSub] = useState<(typeof CARD_SUBS)[number][0]>('CONTACTLESS');
  const [amount, setAmount] = useState(String(due));
  const [last4, setLast4] = useState('');
  const [approval, setApproval] = useState('');
  useEffect(() => setAmount(String(due)), [due]);
  const n = Math.min(Number(amount || 0), due);
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-500">Quẹt/chạm trên máy POS ngân hàng, xong ghi nhận kết quả tại đây.</p>
      <div className="grid grid-cols-3 gap-2">
        {CARD_SUBS.map(([v, l]) => (
          <button key={v} type="button" onClick={() => setSub(v)} className={cn('min-h-12 rounded-xl border-2 px-2 text-sm font-semibold', sub === v ? 'border-brand-700 bg-brand-50 text-brand-900' : 'border-ink-100 bg-white')}>
            {l}
          </button>
        ))}
      </div>
      <Input label="Số tiền" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} className="text-right text-2xl font-bold tabular-nums" />
      <div className="grid grid-cols-2 gap-2">
        <Input label="4 số cuối thẻ" inputMode="numeric" maxLength={4} value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))} />
        <Input label="Mã chuẩn chi" value={approval} onChange={(e) => setApproval(e.target.value.toUpperCase())} />
      </div>
      <Button size="xl" block loading={loading} disabled={!(n > 0) || (last4.length > 0 && last4.length < 4)} onClick={() => onSubmit({ method: 'CARD_TERMINAL', subMethod: sub, amount: n, cardLast4: last4 || undefined, approvalCode: approval || undefined })}>
        <CreditCard className="h-6 w-6" /> Ghi nhận {moneyPlain(n)}
      </Button>
    </div>
  );
}
