'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Banknote, CheckCircle2, CreditCard, FileText, Percent, Printer, QrCode, Trash2 } from 'lucide-react';
import { PAYMENT_METHOD_LABELS } from '@dalan/contracts';
import { errorMessage, needsApproval } from '@/lib/api';
import { billApi, keys, useAction, useBill, useSession } from '@/lib/queries';
import { useBranchId } from '@/lib/auth-store';
import type { BillDetail, Payment } from '@/lib/types';
import { cn, money, moneyPlain, qty, timeHM } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Badge, Loading, Row } from '@/components/ui/primitives';
import { ManagerPinDialog } from '@/components/ui/pin-dialog';
import { toast } from '@/components/ui/toast';
import { CardDialog, CashDialog, CreateBillDialog, DiscountDialog, TaxInfoDialog, VietQrDialog } from './pay-dialogs';

const PAY_STATUS: Record<string, { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' }> = {
  PENDING: { label: 'Chờ xác nhận', tone: 'warning' },
  SUCCEEDED: { label: 'Thành công', tone: 'success' },
  FAILED: { label: 'Thất bại', tone: 'danger' },
  REFUNDED: { label: 'Đã hoàn', tone: 'neutral' },
  PARTIALLY_REFUNDED: { label: 'Hoàn một phần', tone: 'neutral' },
  CANCELLED: { label: 'Đã hủy', tone: 'neutral' },
};

export function PayScreen({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const branchId = useBranchId();
  const session = useSession(sessionId);
  const openBills = useMemo(() => (session.data?.bills ?? []).filter((b) => b.status !== 'VOID'), [session.data]);
  const [billId, setBillId] = useState<string | null>(null);
  useEffect(() => {
    if (!billId && openBills.length > 0) setBillId(openBills.find((b) => b.status !== 'PAID')?.id ?? openBills[0]!.id);
  }, [openBills, billId]);
  const bill = useBill(billId);
  const [createOpen, setCreateOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [pinFor, setPinFor] = useState<Record<string, unknown> | null>(null);
  const [cashOpen, setCashOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [taxOpen, setTaxOpen] = useState(false);
  const [qrPayment, setQrPayment] = useState<(Payment & { qrDataUrl: string | null; bank: { bin: string | null; accountNo: string | null; accountName: string | null; purpose: string } | null }) | null>(null);
  const [voidConfirm, setVoidConfirm] = useState(false);

  const invalidate = () => [keys.session(sessionId), keys.floor(branchId), keys.bill(billId ?? ''), keys.shift(branchId)] as const;
  const onError = (e: unknown) => toast.error(errorMessage(e));
  const create = useAction((body: Parameters<typeof billApi.create>[1]) => billApi.create(sessionId, body), () => invalidate(), (bills) => {
    setCreateOpen(false);
    setBillId(bills[0]?.id ?? null);
    toast.success(bills.length > 1 ? `Đã tạo ${bills.length} bill` : 'Đã tạo bill');
  });
  const discount = useAction((body: Record<string, unknown>) => billApi.discount(billId!, body), () => invalidate(), () => { setDiscountOpen(false); setPinFor(null); toast.success('Đã áp dụng giảm giá'); });
  const removeDiscount = useAction((id: string) => billApi.removeDiscount(billId!, id), () => invalidate());
  const pay = useAction((body: Record<string, unknown>) => billApi.pay(billId!, body), () => invalidate());
  const confirm = useAction((paymentId: string) => billApi.confirm(paymentId), () => invalidate(), () => { setQrPayment(null); toast.success('Đã xác nhận nhận tiền'); });
  const cancelPayment = useAction((paymentId: string) => billApi.cancelPayment(paymentId), () => invalidate(), () => setQrPayment(null));
  const print = useAction(() => billApi.printProvisional(billId!), () => invalidate(), () => toast.success('Đã gửi lệnh in tạm tính'));
  const tax = useAction((info: unknown) => billApi.taxInfo(billId!, info), () => invalidate(), () => { setTaxOpen(false); toast.success('Đã lưu thông tin hóa đơn'); });
  const voidBill = useAction(() => billApi.void(billId!, 'Thu ngân hủy bill'), () => invalidate(), () => { setVoidConfirm(false); setBillId(null); toast.success('Đã hủy bill'); });

  const submitDiscount = (body: Record<string, unknown>, managerPin?: string) =>
    discount.mutate({ ...body, managerPin }, {
      onError: (e) => {
        if (needsApproval(e) && !managerPin) {
          setDiscountOpen(false);
          setPinFor(body);
          return;
        }
        onError(e);
      },
    });

  const b = bill.data;
  const paid = b?.status === 'PAID';
  const sessionClosed = session.data?.status === 'CLOSED';

  if (session.isLoading) return <Loading />;
  if (!session.data) return <div className="p-4 text-red-700">{errorMessage(session.error)}</div>;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-ink-100 bg-white px-2 py-2">
        <Link href={sessionClosed ? '/' : `/sessions/${sessionId}`} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-ink-100" aria-label="Quay lại"><ArrowLeft className="h-6 w-6" /></Link>
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-bold">Thanh toán · {session.data.tables.map((t) => t.table.name).join(' + ')}</div>
          <div className="text-xs text-ink-500">{session.data.code} · {session.data.guestCount} khách</div>
        </div>
        {openBills.length > 0 && !sessionClosed && <Button variant="outline" onClick={() => setCreateOpen(true)}>+ Bill</Button>}
      </div>

      {openBills.length > 1 && (
        <div className="flex gap-2 overflow-x-auto border-b border-ink-100 bg-white px-3 py-2 no-scrollbar">
          {openBills.map((x) => (
            <button key={x.id} type="button" onClick={() => setBillId(x.id)} className={cn('min-h-[40px] shrink-0 rounded-full border px-3 text-sm font-semibold', billId === x.id ? 'border-brand-700 bg-brand-50 text-brand-900' : 'border-ink-100 bg-white')}>
              {x.code.split('-').pop()} · {moneyPlain(x.total)} {x.status === 'PAID' && '✓'}
            </button>
          ))}
        </div>
      )}

      {openBills.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-ink-700">Tạm tính hiện tại: <b className="text-2xl text-brand-800">{money(session.data.totals.total)}</b></p>
          <p className="max-w-sm text-sm text-ink-500">Tạo bill để chốt món, giảm giá và thu tiền. Có thể tính cả bàn, chọn món, theo từng khách hoặc chia đều.</p>
          <Button size="xl" onClick={() => setCreateOpen(true)} disabled={sessionClosed}>Tạo bill</Button>
        </div>
      ) : !b ? (
        <Loading label="Đang tải bill..." />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-3 md:w-1/2">
            <div className="mb-2 flex items-center gap-2">
              <span className="font-bold">{b.code}</span>
              <Badge tone={paid ? 'success' : b.status === 'PARTIALLY_PAID' ? 'warning' : 'neutral'}>{paid ? 'Đã thanh toán' : b.status === 'PARTIALLY_PAID' ? 'Trả một phần' : 'Chưa thanh toán'}</Badge>
              <span className="ml-auto text-xs text-ink-500">{timeHM(b.createdAt)}{b.printedCount > 0 && ` · in ${b.printedCount} lần`}</span>
            </div>
            <ul className="divide-y divide-ink-100 rounded-xl border border-ink-100 bg-white">
              {b.lines.map((l) => (
                <li key={l.id} className="flex items-start gap-2 px-3 py-2 text-sm">
                  <span className="w-12 shrink-0 text-right font-bold tabular-nums">{qty(l.orderLine.quantity * l.quantityShare)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{l.orderLine.nameSnapshot}</span>
                    {l.orderLine.modifiersSnapshot.length > 0 && <span className="block text-xs text-ink-500">{l.orderLine.modifiersSnapshot.map((m) => m.optionName).join(', ')}</span>}
                    {l.discountAmount > 0 && <span className="block text-xs text-emerald-700">Giảm {moneyPlain(l.discountAmount)}</span>}
                  </span>
                  <span className="tabular-nums">{moneyPlain(l.amount)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm">
              <Row label="Tổng hàng" value={moneyPlain(b.subtotal)} />
              {b.lineDiscountTotal > 0 && <Row label="Giảm theo món" value={`-${moneyPlain(b.lineDiscountTotal)}`} />}
              {b.discounts.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2 py-1 text-emerald-800">
                  <span className="min-w-0 flex-1 truncate">
                    {d.kind === 'PERCENT' ? `Giảm ${(d.valueBps ?? 0) / 100}%` : d.kind === 'VOUCHER' ? 'Voucher' : d.kind === 'POINTS' ? 'Đổi điểm' : 'Giảm giá'}{d.reason ? ` · ${d.reason}` : ''}
                  </span>
                  <span className="tabular-nums">-{moneyPlain(d.amount)}</span>
                  {!paid && b.status === 'OPEN' && (
                    <button type="button" onClick={() => removeDiscount.mutate(d.id, { onError })} className="flex h-8 w-8 items-center justify-center rounded-lg text-red-700" aria-label="Bỏ giảm giá"><Trash2 className="h-4 w-4" /></button>
                  )}
                </div>
              ))}
              {b.serviceChargeAmount > 0 && <Row label={`Phí phục vụ ${b.serviceChargeBps / 100}%`} value={moneyPlain(b.serviceChargeAmount)} />}
              <Row label={b.branch.priceIncludesVat ? 'Trong đó VAT' : 'VAT'} value={moneyPlain(b.vatAmount)} className="text-ink-500" />
              {b.roundingAdjustment !== 0 && <Row label="Làm tròn" value={moneyPlain(b.roundingAdjustment)} />}
              <Row label="Tổng phải trả" value={money(b.total)} bold className="border-t border-ink-100 pt-2" />
              {b.paidTotal > 0 && <Row label="Đã thu" value={moneyPlain(b.paidTotal)} className="text-emerald-800" />}
              {!paid && <Row label="Còn phải thu" value={money(b.due)} bold className="text-brand-800" />}
            </div>
            {b.payments.length > 0 && (
              <ul className="mt-3 space-y-1">
                {b.payments.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 rounded-xl border border-ink-100 bg-white px-3 py-2 text-sm">
                    <span className="flex-1">
                      <b>{PAYMENT_METHOD_LABELS[p.method as keyof typeof PAYMENT_METHOD_LABELS] ?? p.method}</b>{p.subMethod ? ` · ${p.subMethod}` : ''}{p.cardLast4 ? ` · ****${p.cardLast4}` : ''}
                      {p.changeAmount > 0 && <span className="block text-xs text-ink-500">Khách đưa {moneyPlain(p.tenderedAmount ?? 0)} · thừa {moneyPlain(p.changeAmount)}</span>}
                    </span>
                    <span className="tabular-nums font-semibold">{moneyPlain(p.amount)}</span>
                    <Badge tone={PAY_STATUS[p.status]?.tone ?? 'neutral'}>{PAY_STATUS[p.status]?.label ?? p.status}</Badge>
                    {p.status === 'PENDING' && p.method === 'BANK_TRANSFER' && <Button size="sm" onClick={() => setQrPayment({ ...p, qrDataUrl: null, bank: { bin: b.branch.bankBin, accountNo: b.branch.bankAccountNo, accountName: b.branch.bankAccountName, purpose: `DL ${b.code}` } })}>Xem QR</Button>}
                    {p.status === 'PENDING' && p.method !== 'BANK_TRANSFER' && <Button size="sm" onClick={() => confirm.mutate(p.id, { onError })}>Xác nhận</Button>}
                  </li>
                ))}
              </ul>
            )}
            {b.taxInvoiceInfo && <p className="mt-2 rounded-xl bg-gold-100 px-3 py-2 text-xs">Xuất HĐ: <b>{b.taxInvoiceInfo.buyerName}</b>{b.taxInvoiceInfo.buyerTaxCode ? ` · MST ${b.taxInvoiceInfo.buyerTaxCode}` : ''}</p>}
          </div>

          <div className="safe-bottom border-t border-ink-100 bg-white p-3 md:w-1/2 md:border-t-0 md:border-l">
            {paid ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <CheckCircle2 className="h-14 w-14 text-emerald-600" />
                <p className="text-xl font-bold">Đã thanh toán {money(b.total)}</p>
                {sessionClosed ? <p className="text-sm text-ink-500">Phiên bàn đã đóng, bàn đã trống.</p> : <p className="text-sm text-ink-500">Phiên vẫn mở vì còn bill khác hoặc món chưa tính.</p>}
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => print.mutate(undefined, { onError })}><Printer className="h-5 w-5" /> In lại</Button>
                  <Button variant="outline" onClick={() => setTaxOpen(true)}><FileText className="h-5 w-5" /> Hóa đơn VAT</Button>
                  <Button onClick={() => router.push('/')}>Về sơ đồ bàn</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-center">
                  <div className="text-sm text-ink-500">Còn phải thu</div>
                  <div className="text-4xl font-black text-brand-800 tabular-nums">{money(b.due)}</div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <PayButton icon={Banknote} label="Tiền mặt" onClick={() => setCashOpen(true)} />
                  <PayButton icon={QrCode} label="VietQR" onClick={() => pay.mutate({ method: 'BANK_TRANSFER' }, { onError, onSuccess: (r) => setQrPayment(r.payment) })} loading={pay.isPending} />
                  <PayButton icon={CreditCard} label="Thẻ / Apple Pay" onClick={() => setCardOpen(true)} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Button variant="outline" onClick={() => setDiscountOpen(true)} disabled={b.status !== 'OPEN'}><Percent className="h-5 w-5" /> Giảm giá</Button>
                  <Button variant="outline" onClick={() => print.mutate(undefined, { onError })} loading={print.isPending}><Printer className="h-5 w-5" /> In tạm tính</Button>
                  <Button variant="outline" onClick={() => setTaxOpen(true)}><FileText className="h-5 w-5" /> Xuất HĐ</Button>
                </div>
                {b.status === 'OPEN' && (
                  <button type="button" onClick={() => setVoidConfirm(true)} className="w-full py-2 text-center text-sm text-red-700 underline">Hủy bill này</button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <CreateBillDialog open={createOpen} session={session.data} onClose={() => setCreateOpen(false)} loading={create.isPending} onSubmit={(body) => create.mutate(body, { onError })} />
      {b && (
        <>
          <DiscountDialog open={discountOpen} bill={b} onClose={() => setDiscountOpen(false)} loading={discount.isPending} onSubmit={(body) => submitDiscount(body)} />
          <ManagerPinDialog open={!!pinFor} onClose={() => setPinFor(null)} loading={discount.isPending} message="Mức giảm vượt hạn mức, cần quản lý duyệt." onSubmit={(pin) => pinFor && submitDiscount(pinFor, pin)} />
          <CashDialog open={cashOpen} due={b.due} onClose={() => setCashOpen(false)} loading={pay.isPending} onSubmit={(amount, tendered) => pay.mutate({ method: 'CASH', amount, tenderedAmount: tendered }, { onError, onSuccess: (r) => { setCashOpen(false); const p = r.payment; if (p.changeAmount > 0) toast.info(`Tiền thừa ${money(p.changeAmount)}`); } })} />
          <CardDialog open={cardOpen} due={b.due} onClose={() => setCardOpen(false)} loading={pay.isPending} onSubmit={(body) => pay.mutate(body, { onError, onSuccess: () => setCardOpen(false) })} />
          <VietQrDialog payment={qrPayment} bill={b} onClose={() => setQrPayment(null)} loading={confirm.isPending || cancelPayment.isPending} onConfirm={(id) => confirm.mutate(id, { onError })} onCancel={(id) => cancelPayment.mutate(id, { onError })} />
          <TaxInfoDialog open={taxOpen} bill={b} onClose={() => setTaxOpen(false)} loading={tax.isPending} onSubmit={(info) => tax.mutate(info, { onError })} />
          <ConfirmDialog open={voidConfirm} onClose={() => setVoidConfirm(false)} onConfirm={() => voidBill.mutate(undefined, { onError })} title="Hủy bill?" message="Các món sẽ trở lại trạng thái chưa tính tiền. Bill đã có thanh toán không hủy được." danger confirmLabel="Hủy bill" loading={voidBill.isPending} />
        </>
      )}
    </div>
  );
}

function PayButton({ icon: Icon, label, onClick, loading }: { icon: typeof Banknote; label: string; onClick: () => void; loading?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={loading} className="flex min-h-[80px] flex-col items-center justify-center gap-1 rounded-2xl bg-brand-700 font-semibold text-white active:bg-brand-900 disabled:opacity-60">
      <Icon className="h-7 w-7" />
      {label}
    </button>
  );
}

export type { BillDetail };
