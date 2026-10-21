'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileText, LayoutGrid, Percent, Printer, RefreshCw, Split, Trash2, UtensilsCrossed } from 'lucide-react';
import { PAYMENT_METHOD_LABELS } from '@dalan/contracts';
import { errorMessage, needsApproval } from '@/lib/api';
import { billApi, keys, useAction, useBill, useSession } from '@/lib/queries';
import { useBranchId } from '@/lib/auth-store';
import type { AddPaymentResult, BillDetail } from '@/lib/types';
import { cn, elapsed, money, moneyPlain, qty, timeHM } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Badge, EmptyState, Loading, Row } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page-header';
import { ManagerPinDialog } from '@/components/ui/pin-dialog';
import { toast } from '@/components/ui/toast';
import { CreateBillDialog, DiscountDialog, TaxInfoDialog } from './pay-dialogs';
import { CardPanel, CashPanel, MethodTiles, QrPanel, QrStart, type PayMethod } from './pay-panels';

const PAY_STATUS: Record<string, { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' }> = {
  PENDING: { label: 'Chờ xác nhận', tone: 'warning' },
  SUCCEEDED: { label: 'Thành công', tone: 'success' },
  FAILED: { label: 'Thất bại', tone: 'danger' },
  REFUNDED: { label: 'Đã hoàn', tone: 'neutral' },
  PARTIALLY_REFUNDED: { label: 'Hoàn một phần', tone: 'neutral' },
  CANCELLED: { label: 'Đã hủy', tone: 'neutral' },
};

type QrState = AddPaymentResult['payment'] | null;

/** Màn thanh toán: hóa đơn dạng biên lai, ô phương thức lớn, bàn phím tiền mặt, VietQR cỡ lớn, tách bill. */
export function PayScreen({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const branchId = useBranchId();
  const session = useSession(sessionId);
  const openBills = useMemo(() => (session.data?.bills ?? []).filter((b) => b.status !== 'VOID'), [session.data]);
  const [billId, setBillId] = useState<string | null>(null);
  useEffect(() => {
    if (!billId && openBills.length > 0) setBillId(openBills.find((b) => b.status !== 'PAID')?.id ?? openBills[0]!.id);
  }, [openBills, billId]);
  const bill = useBill(billId);
  const [method, setMethod] = useState<PayMethod>('cash');
  const [createOpen, setCreateOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [pinFor, setPinFor] = useState<Record<string, unknown> | null>(null);
  const [taxOpen, setTaxOpen] = useState(false);
  const [qrCreated, setQrCreated] = useState<QrState>(null);
  const [voidConfirm, setVoidConfirm] = useState(false);
  const [lastChange, setLastChange] = useState<number>(0);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const invalidate = () => [keys.session(sessionId), keys.floor(branchId), keys.bill(billId ?? ''), keys.shift(branchId)] as const;
  const onError = (e: unknown) => toast.error(errorMessage(e));
  const create = useAction((body: Parameters<typeof billApi.create>[1]) => billApi.create(sessionId, body), invalidate, (bills) => {
    setCreateOpen(false);
    setBillId(bills[0]?.id ?? null);
    toast.success(bills.length > 1 ? `Đã tạo ${bills.length} bill` : 'Đã tạo bill');
  });
  const discount = useAction((body: Record<string, unknown>) => billApi.discount(billId!, body), invalidate, () => {
    setDiscountOpen(false);
    setPinFor(null);
    toast.success('Đã áp dụng giảm giá');
  });
  const removeDiscount = useAction((id: string) => billApi.removeDiscount(billId!, id), invalidate);
  const pay = useAction((body: Record<string, unknown>) => billApi.pay(billId!, body), invalidate);
  const confirm = useAction((paymentId: string) => billApi.confirm(paymentId), invalidate, () => {
    setQrCreated(null);
    toast.success('Đã xác nhận nhận tiền');
  });
  const cancelPayment = useAction((paymentId: string) => billApi.cancelPayment(paymentId), invalidate, () => setQrCreated(null));
  const print = useAction(() => billApi.printProvisional(billId!), invalidate, () => toast.success('Đã gửi lệnh in'));
  const tax = useAction((info: unknown) => billApi.taxInfo(billId!, info), invalidate, () => {
    setTaxOpen(false);
    toast.success('Đã lưu thông tin hóa đơn');
  });
  const voidBill = useAction(() => billApi.void(billId!, 'Thu ngân hủy bill'), invalidate, () => {
    setVoidConfirm(false);
    setBillId(null);
    toast.success('Đã hủy bill');
  });

  const submitDiscount = (body: Record<string, unknown>, managerPin?: string) =>
    discount.mutate(
      { ...body, managerPin },
      {
        onError: (e) => {
          if (needsApproval(e) && !managerPin) {
            setDiscountOpen(false);
            setPinFor(body);
            return;
          }
          onError(e);
        },
      },
    );

  const b = bill.data;
  // Mã QR đang chờ: lấy từ bill (bền khi tải lại trang), ưu tiên dữ liệu ảnh vừa tạo
  const pendingQr = useMemo(() => {
    const p = b?.payments.find((x) => x.status === 'PENDING' && x.method === 'BANK_TRANSFER');
    if (!p) return null;
    return qrCreated && qrCreated.id === p.id ? { ...p, qrDataUrl: qrCreated.qrDataUrl } : p;
  }, [b, qrCreated]);
  const pendingQrId = pendingQr?.id ?? null;
  useEffect(() => {
    if (pendingQrId) setMethod('qr');
  }, [pendingQrId]);
  useEffect(() => {
    setLastChange(0);
  }, [billId]);

  if (session.isLoading) return <Loading label="Đang tải thanh toán..." />;
  if (!session.data) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader title="Thanh toán" back={`/sessions/${sessionId}`} />
        <EmptyState
          title="Không tải được phiên bàn"
          hint={errorMessage(session.error)}
          action={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => session.refetch()}><RefreshCw className="h-5 w-5" /> Thử lại</Button>
              <Button onClick={() => router.push('/')}>Về sơ đồ bàn</Button>
            </div>
          }
        />
      </div>
    );
  }

  const s = session.data;
  const sessionClosed = s.status === 'CLOSED' || s.status === 'CANCELLED';
  const tableNames = s.tables.map((t) => t.table.name).join(' + ') || s.code;
  const paid = b?.status === 'PAID';
  const nextUnpaid = openBills.find((x) => x.id !== billId && x.status !== 'PAID');
  const hasDraft = s.orders.flatMap((o) => o.lines).some((l) => l.status === 'DRAFT' || l.status === 'HOLD');

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        back={sessionClosed ? '/' : `/sessions/${sessionId}`}
        title={`Thanh toán · ${tableNames}`}
        subtitle={`${s.code} · ${s.guestCount} khách · ngồi ${elapsed(s.openedAt, now)}`}
        actions={
          openBills.length > 0 && !sessionClosed ? (
            <Button variant="outline" onClick={() => setCreateOpen(true)}>
              <Split className="h-5 w-5" /> <span className="hidden sm:inline">Tách bill</span>
            </Button>
          ) : undefined
        }
      />

      {openBills.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-3 pb-2 no-scrollbar md:px-4" role="tablist" aria-label="Các bill">
          {openBills.map((x, i) => (
            <button key={x.id} type="button" role="tab" aria-selected={billId === x.id} onClick={() => setBillId(x.id)} className={cn('flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold', billId === x.id ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-100 bg-white')}>
              Bill {i + 1}
              <span className="tabular-nums">{moneyPlain(x.total)}</span>
              {x.status === 'PAID' ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : x.status === 'PARTIALLY_PAID' ? <span className="h-2 w-2 rounded-full bg-amber-400" /> : null}
            </button>
          ))}
        </div>
      )}

      {openBills.length === 0 ? (
        <div className="flex flex-1 items-start justify-center overflow-y-auto p-4 md:items-center">
          <div className="w-full max-w-lg rounded-3xl border border-ink-100 bg-white p-6 text-center shadow-sm">
            <p className="text-sm font-semibold text-ink-500">Tạm tính hiện tại</p>
            <p className="mb-1 text-5xl font-black text-brand-800 tabular-nums">{money(s.totals.total)}</p>
            <p className="mb-5 text-sm text-ink-500">{s.orders.flatMap((o) => o.lines).filter((l) => ['SENT', 'PREPARING', 'READY', 'SERVED'].includes(l.status)).length} món đã gọi · {s.guestCount} khách</p>
            {hasDraft && <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">Còn món đang giữ hoặc chưa gửi bếp – gọi đợt/gửi bếp hoặc hủy trước khi tính cả bàn.</p>}
            <div className="grid gap-2">
              <Button size="xl" block disabled={sessionClosed || hasDraft} loading={create.isPending} onClick={() => create.mutate({ mode: 'ALL' }, { onError })}>
                Tính tiền cả bàn
              </Button>
              <Button size="lg" variant="outline" block disabled={sessionClosed} onClick={() => setCreateOpen(true)}>
                <Split className="h-5 w-5" /> Tách bill: theo món, theo khách, chia đều
              </Button>
              <Button variant="ghost" block onClick={() => router.push(sessionClosed ? '/' : `/sessions/${sessionId}`)}>
                {sessionClosed ? <><LayoutGrid className="h-5 w-5" /> Về sơ đồ bàn</> : <><UtensilsCrossed className="h-5 w-5" /> Quay lại gọi món</>}
              </Button>
            </div>
          </div>
        </div>
      ) : !b ? (
        bill.isError ? (
          <EmptyState title="Không tải được bill" hint={errorMessage(bill.error)} action={<Button variant="outline" onClick={() => bill.refetch()}>Thử lại</Button>} />
        ) : (
          <Loading label="Đang tải bill..." />
        )
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
          {/* Biên lai */}
          <div className="scrollbar-thin p-3 md:min-h-0 md:w-1/2 md:overflow-y-auto md:p-4 lg:w-[45%]">
            <Receipt bill={b} tableNames={tableNames} onRemoveDiscount={(id) => removeDiscount.mutate(id, { onError })} onConfirmPayment={(id) => confirm.mutate(id, { onError })} confirming={confirm.isPending} />
          </div>

          {/* Thu tiền */}
          <div className="safe-bottom scrollbar-thin border-t border-ink-100 bg-white p-3 md:min-h-0 md:flex-1 md:overflow-y-auto md:border-t-0 md:border-l md:p-5">
            {paid ? (
              <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-6 text-center">
                <span className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100">
                  <CheckCircle2 className="h-16 w-16 text-emerald-600" />
                </span>
                <div>
                  <p className="text-2xl font-black text-ink-900">Đã thanh toán đủ</p>
                  <p className="text-lg font-bold text-emerald-700 tabular-nums">{money(b.total)}</p>
                </div>
                {lastChange > 0 && (
                  <div className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-white">
                    <div className="text-sm font-semibold">Tiền thừa trả khách</div>
                    <div className="text-4xl font-black tabular-nums">{money(lastChange)}</div>
                  </div>
                )}
                <p className="text-sm text-ink-500">{sessionClosed ? 'Phiên bàn đã đóng, bàn đã trống sẵn sàng đón khách mới.' : nextUnpaid ? 'Bàn còn bill khác chưa thanh toán.' : 'Phiên vẫn mở vì còn món chưa tính tiền.'}</p>
                <div className="grid w-full gap-2">
                  {nextUnpaid ? (
                    <Button size="xl" block onClick={() => setBillId(nextUnpaid.id)}>Sang bill tiếp theo</Button>
                  ) : (
                    <Button size="xl" block autoFocus onClick={() => router.push('/')}>
                      <LayoutGrid className="h-6 w-6" /> Về sơ đồ bàn
                    </Button>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="lg" loading={print.isPending} onClick={() => print.mutate(undefined, { onError })}>
                      <Printer className="h-5 w-5" /> In lại
                    </Button>
                    <Button variant="outline" size="lg" onClick={() => setTaxOpen(true)}>
                      <FileText className="h-5 w-5" /> Hóa đơn VAT
                    </Button>
                  </div>
                  {!sessionClosed && !nextUnpaid && (
                    <Button variant="ghost" onClick={() => router.push(`/sessions/${sessionId}`)}>Quay lại bàn</Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-xl space-y-4">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-ink-500">Còn phải thu</div>
                    <div className="text-4xl leading-tight font-black text-brand-800 tabular-nums md:text-5xl">{money(b.due)}</div>
                  </div>
                  {b.paidTotal > 0 && (
                    <div className="text-right text-sm">
                      <div className="text-ink-500">Đã thu</div>
                      <div className="font-bold text-emerald-700 tabular-nums">{moneyPlain(b.paidTotal)}</div>
                    </div>
                  )}
                </div>
                {b.paidTotal > 0 && (
                  <div className="h-2 overflow-hidden rounded-full bg-ink-100" aria-hidden>
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, (b.paidTotal / Math.max(1, b.total)) * 100)}%` }} />
                  </div>
                )}
                <MethodTiles value={method} onChange={setMethod} qrPending={!!pendingQr} />
                {method === 'cash' && (
                  <CashPanel
                    due={b.due}
                    loading={pay.isPending}
                    onSubmit={(amount, tendered) =>
                      pay.mutate(
                        { method: 'CASH', amount, tenderedAmount: tendered },
                        {
                          onError,
                          onSuccess: (r) => {
                            setLastChange(r.payment.changeAmount);
                            if (r.payment.changeAmount > 0) toast.info(`Tiền thừa trả khách ${money(r.payment.changeAmount)}`);
                          },
                        },
                      )
                    }
                  />
                )}
                {method === 'qr' &&
                  (pendingQr ? (
                    <QrPanel payment={pendingQr} bill={b} purpose={qrCreated?.bank?.purpose} loading={confirm.isPending || cancelPayment.isPending} onConfirm={() => confirm.mutate(pendingQr.id, { onError })} onCancel={() => cancelPayment.mutate(pendingQr.id, { onError })} />
                  ) : (
                    <QrStart due={b.due} loading={pay.isPending} onCreate={(amount) => pay.mutate({ method: 'BANK_TRANSFER', amount }, { onError, onSuccess: (r) => setQrCreated(r.payment) })} />
                  ))}
                {method === 'card' && <CardPanel due={b.due} loading={pay.isPending} onSubmit={(body) => pay.mutate(body, { onError, onSuccess: () => toast.success('Đã ghi nhận thanh toán thẻ') })} />}
                <div className="grid grid-cols-3 gap-2 border-t border-ink-100 pt-4">
                  <Button variant="outline" onClick={() => setDiscountOpen(true)} disabled={b.status !== 'OPEN'}>
                    <Percent className="h-5 w-5" /> Giảm giá
                  </Button>
                  <Button variant="outline" onClick={() => print.mutate(undefined, { onError })} loading={print.isPending}>
                    <Printer className="h-5 w-5" /> <span className="truncate">In tạm tính</span>
                  </Button>
                  <Button variant="outline" onClick={() => setTaxOpen(true)}>
                    <FileText className="h-5 w-5" /> Xuất HĐ
                  </Button>
                </div>
                {b.status === 'OPEN' && (
                  <button type="button" onClick={() => setVoidConfirm(true)} className="min-h-11 w-full text-center text-sm font-semibold text-red-700 hover:underline">
                    Hủy bill này
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <CreateBillDialog open={createOpen} session={s} onClose={() => setCreateOpen(false)} loading={create.isPending} onSubmit={(body) => create.mutate(body, { onError })} />
      {b && (
        <>
          <DiscountDialog open={discountOpen} bill={b} onClose={() => setDiscountOpen(false)} loading={discount.isPending} onSubmit={(body) => submitDiscount(body)} />
          <ManagerPinDialog open={!!pinFor} onClose={() => setPinFor(null)} loading={discount.isPending} message="Mức giảm vượt hạn mức, cần quản lý duyệt." onSubmit={(pin) => pinFor && submitDiscount(pinFor, pin)} />
          <TaxInfoDialog open={taxOpen} bill={b} onClose={() => setTaxOpen(false)} loading={tax.isPending} onSubmit={(info) => tax.mutate(info, { onError })} />
          <ConfirmDialog open={voidConfirm} onClose={() => setVoidConfirm(false)} onConfirm={() => voidBill.mutate(undefined, { onError })} title="Hủy bill?" message="Các món sẽ trở lại trạng thái chưa tính tiền. Bill đã có thanh toán không hủy được." danger confirmLabel="Hủy bill" loading={voidBill.isPending} />
        </>
      )}
    </div>
  );
}

/** Hóa đơn dạng biên lai giấy: đầu bill, món, giảm giá, phí, VAT, tổng, các lần thu. */
function Receipt({ bill: b, tableNames, onRemoveDiscount, onConfirmPayment, confirming }: { bill: BillDetail; tableNames: string; onRemoveDiscount: (id: string) => void; onConfirmPayment: (id: string) => void; confirming?: boolean }) {
  const paid = b.status === 'PAID';
  return (
    <div className="mx-auto max-w-md overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm">
      <div className="border-b border-dashed border-ink-300 px-4 pt-4 pb-3 text-center">
        <div className="text-lg font-black tracking-wide text-brand-800 uppercase">{b.branch.name}</div>
        <div className="mt-1 flex items-center justify-center gap-2 text-xs text-ink-500">
          <span className="font-semibold text-ink-700">{b.code}</span>·<span>{tableNames}</span>·<span>{timeHM(b.createdAt)}</span>
        </div>
        <div className="mt-2 flex justify-center">
          <Badge tone={paid ? 'success' : b.status === 'PARTIALLY_PAID' ? 'warning' : 'neutral'}>{paid ? 'Đã thanh toán' : b.status === 'PARTIALLY_PAID' ? 'Đã trả một phần' : 'Chưa thanh toán'}</Badge>
          {b.printedCount > 0 && <span className="ml-2 text-xs text-ink-500">đã in {b.printedCount} lần</span>}
        </div>
      </div>
      <ul className="divide-y divide-dashed divide-ink-100 px-4">
        {b.lines.map((l) => (
          <li key={l.id} className="flex items-start gap-2 py-2 text-sm">
            <span className="w-9 shrink-0 text-right font-bold tabular-nums">{qty(l.orderLine.quantity * l.quantityShare)}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{l.orderLine.nameSnapshot}</span>
              <span className="block text-xs text-ink-500 tabular-nums">
                {moneyPlain(l.orderLine.unitPrice)}/{l.orderLine.unitSnapshot}
                {l.orderLine.modifiersSnapshot.length > 0 && ` · ${l.orderLine.modifiersSnapshot.map((m) => m.optionName).join(', ')}`}
              </span>
              {l.discountAmount > 0 && <span className="block text-xs font-semibold text-emerald-700">Giảm {moneyPlain(l.discountAmount)}</span>}
            </span>
            <span className="font-semibold tabular-nums">{moneyPlain(l.amount)}</span>
          </li>
        ))}
      </ul>
      <div className="border-t border-dashed border-ink-300 px-4 py-3 text-sm">
        <Row label="Tổng hàng" value={moneyPlain(b.subtotal)} />
        {b.lineDiscountTotal > 0 && <Row label="Giảm theo món" value={`-${moneyPlain(b.lineDiscountTotal)}`} className="text-emerald-800" />}
        {b.discounts.map((d) => (
          <div key={d.id} className="flex min-h-9 items-center justify-between gap-2 text-emerald-800">
            <span className="min-w-0 flex-1 truncate">
              {d.kind === 'PERCENT' ? `Giảm ${(d.valueBps ?? 0) / 100}%` : d.kind === 'VOUCHER' ? 'Voucher' : d.kind === 'POINTS' ? 'Đổi điểm' : 'Giảm giá'}
              {d.reason ? ` · ${d.reason}` : ''}
            </span>
            <span className="tabular-nums">-{moneyPlain(d.amount)}</span>
            {!paid && b.status === 'OPEN' && (
              <button type="button" onClick={() => onRemoveDiscount(d.id)} className="flex h-11 w-11 items-center justify-center rounded-lg text-red-700 hover:bg-red-50" aria-label="Bỏ giảm giá">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
        {b.serviceChargeAmount > 0 && <Row label={`Phí phục vụ ${b.serviceChargeBps / 100}%`} value={moneyPlain(b.serviceChargeAmount)} />}
        <Row label={b.branch.priceIncludesVat ? 'Trong đó VAT' : 'VAT'} value={moneyPlain(b.vatAmount)} className="text-ink-500" />
        {b.roundingAdjustment !== 0 && <Row label="Làm tròn" value={moneyPlain(b.roundingAdjustment)} />}
        <div className="mt-2 flex items-center justify-between border-t-2 border-ink-900 pt-2">
          <span className="text-base font-bold">Tổng thanh toán</span>
          <span className="text-2xl font-black tabular-nums">{money(b.total)}</span>
        </div>
        {b.paidTotal > 0 && <Row label="Đã thu" value={moneyPlain(b.paidTotal)} className="text-emerald-800" />}
        {!paid && b.paidTotal > 0 && <Row label="Còn phải thu" value={money(b.due)} bold className="text-brand-800" />}
      </div>
      {b.payments.length > 0 && (
        <ul className="space-y-1 border-t border-dashed border-ink-300 bg-paper px-4 py-3">
          {b.payments.map((p) => (
            <li key={p.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1">
                <b>{PAYMENT_METHOD_LABELS[p.method as keyof typeof PAYMENT_METHOD_LABELS] ?? p.method}</b>
                {p.subMethod ? ` · ${p.subMethod.replace('_', ' ').toLowerCase()}` : ''}
                {p.cardLast4 ? ` · ****${p.cardLast4}` : ''}
                {p.changeAmount > 0 && <span className="block text-xs text-ink-500 tabular-nums">Khách đưa {moneyPlain(p.tenderedAmount ?? 0)} · thừa {moneyPlain(p.changeAmount)}</span>}
              </span>
              <span className="font-semibold tabular-nums">{moneyPlain(p.amount)}</span>
              <Badge tone={PAY_STATUS[p.status]?.tone ?? 'neutral'}>{PAY_STATUS[p.status]?.label ?? p.status}</Badge>
              {p.status === 'PENDING' && p.method !== 'BANK_TRANSFER' && (
                <Button size="sm" loading={confirming} onClick={() => onConfirmPayment(p.id)}>
                  Xác nhận
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {b.taxInvoiceInfo && (
        <p className="border-t border-dashed border-ink-300 bg-gold-100 px-4 py-2 text-xs">
          Xuất hóa đơn: <b>{b.taxInvoiceInfo.buyerName}</b>
          {b.taxInvoiceInfo.buyerTaxCode ? ` · MST ${b.taxInvoiceInfo.buyerTaxCode}` : ''}
        </p>
      )}
    </div>
  );
}
