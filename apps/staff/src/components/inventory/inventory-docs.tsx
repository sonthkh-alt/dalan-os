'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { useBranchId, useCan } from '@/lib/auth-store';
import { useAction } from '@/lib/queries';
import {
  inventoryApi,
  opsKeys,
  useGoodsReceipts,
  useMovements,
  usePurchaseOrder,
  usePurchaseOrders,
  useStockItems,
  useStocktake,
  useStocktakes,
  useSuppliers,
  useTransfer,
  useTransfers,
  useWarehouses,
  type PurchaseOrderDetail,
  type TransferRow,
} from '@/lib/queries-ops';
import { dateLabel, fold, vnDateTime } from '@/lib/ops-utils';
import { cn, money, moneyPlain, qty } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Badge, EmptyState, Input, Loading, Select } from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';
import { Card, Checkbox, ErrorBox, FilterChips, Table } from '@/components/ops/ui';
import { emptyLine, PO_STATUS, STOCKTAKE_STATUS, StockLineEditor, TRANSFER_STATUS, validLines, WarehouseSelect, type StockLine } from './common';
import type { SharedWh } from './inventory-screen';

const onErr = (e: unknown) => toast.error(errorMessage(e));
const inv = () => [opsKeys.inventory] as const;
const lineTotal = (lines: StockLine[]) => lines.reduce((s, l) => s + Math.round((l.quantity ?? 0) * (l.unitPrice ?? 0)), 0);

// ───────────────────────── Đặt hàng NCC ─────────────────────────

export function PurchaseOrdersTab({ warehouseId, warehouses }: SharedWh) {
  const [status, setStatus] = useState('');
  const pos = usePurchaseOrders(status || undefined);
  const canManage = useCan('inventory.manage');
  const [createOpen, setCreateOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <FilterChips value={status} onChange={setStatus} options={[{ value: '', label: 'Tất cả' }, ...Object.entries(PO_STATUS).map(([k, v]) => ({ value: k, label: v.label }))]} />
        {canManage && (
          <Button className="ml-auto" onClick={() => setCreateOpen(true)}>
            <Plus className="h-5 w-5" /> Tạo đơn đặt hàng
          </Button>
        )}
      </div>
      <ErrorBox error={pos.error} />
      {pos.isLoading ? (
        <Loading />
      ) : (pos.data ?? []).length === 0 ? (
        <EmptyState title="Chưa có đơn đặt hàng" />
      ) : (
        <Table head={['Mã', 'Ngày tạo', 'Nhà cung cấp', 'Kho nhận', 'Dự kiến giao', 'Số dòng', 'Tổng tiền', 'Trạng thái']}>
          {(pos.data ?? []).map((p) => (
            <tr key={p.id} className="cursor-pointer hover:bg-paper" onClick={() => setOpenId(p.id)}>
              <td className="px-3 py-2 font-mono">{p.code}</td>
              <td className="px-3 py-2">{vnDateTime(p.createdAt)}</td>
              <td className="px-3 py-2">{p.supplier.name}</td>
              <td className="px-3 py-2">{p.warehouse.name}</td>
              <td className="px-3 py-2">{p.expectedDate ? dateLabel(p.expectedDate.slice(0, 10), false) : '—'}</td>
              <td className="px-3 py-2 tabular-nums">{p._count.lines}</td>
              <td className="px-3 py-2 text-right tabular-nums">{moneyPlain(p.total)}</td>
              <td className="px-3 py-2">
                <Badge tone={PO_STATUS[p.status]?.tone ?? 'neutral'}>{PO_STATUS[p.status]?.label ?? p.status}</Badge>
              </td>
            </tr>
          ))}
        </Table>
      )}
      {createOpen && <CreatePoDialog defaultWarehouse={warehouseId} warehouses={warehouses} onClose={() => setCreateOpen(false)} />}
      {openId && <PoDetailDialog id={openId} onClose={() => setOpenId(null)} warehouses={warehouses} />}
    </div>
  );
}

function CreatePoDialog({ defaultWarehouse, warehouses, onClose }: { defaultWarehouse: string; warehouses: SharedWh['warehouses']; onClose: () => void }) {
  const branchId = useBranchId();
  const items = useStockItems();
  const suppliers = useSuppliers();
  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState(defaultWarehouse);
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<StockLine[]>([emptyLine()]);
  // Gợi ý: thêm nhanh các mặt hàng dưới mức tồn tối thiểu của nhà cung cấp đã chọn
  const suggest = () => {
    const low = (items.data ?? []).filter((i) => i.isActive && i.minStock !== null && i.totalQuantity < i.minStock && (!supplierId || i.defaultSupplierId === supplierId || !i.defaultSupplierId));
    if (low.length === 0) return toast.info('Không có mặt hàng dưới mức tồn tối thiểu');
    setLines(low.map((i) => ({ stockItemId: i.id, unit: i.purchaseUnit, quantity: Math.max(1, Math.ceil(((i.minStock ?? 0) * 2 - i.totalQuantity) / i.purchaseUnitFactor)), unitPrice: Math.round(i.costPerBaseUnit * i.purchaseUnitFactor) })));
  };
  const create = useAction(
    () => inventoryApi.createPo({ branchId, warehouseId, supplierId, ...(expectedDate ? { expectedDate } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}), lines: lines.map((l) => ({ stockItemId: l.stockItemId, quantity: l.quantity, unit: l.unit, unitPrice: l.unitPrice ?? 0 })) }),
    inv,
    (po) => {
      toast.success(`Đã tạo đơn ${po.code}`);
      onClose();
    },
  );
  return (
    <Dialog
      open
      onClose={onClose}
      title="Tạo đơn đặt hàng"
      size="lg"
      footer={
        <Button block onClick={() => create.mutate(undefined, { onError: onErr })} loading={create.isPending} disabled={!supplierId || !warehouseId || !validLines(lines, true)}>
          Tạo đơn · {money(lineTotal(lines))}
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Select label="Nhà cung cấp" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">Chọn...</option>
            {(suppliers.data ?? [])
              .filter((s) => s.isActive)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </Select>
          <WarehouseSelect label="Kho nhận" value={warehouseId} onChange={setWarehouseId} warehouses={warehouses} />
          <Input label="Ngày giao dự kiến" type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
        </div>
        <Button size="sm" variant="secondary" onClick={suggest}>
          Gợi ý theo tồn tối thiểu
        </Button>
        <StockLineEditor lines={lines} onChange={setLines} items={items.data ?? []} withUnit withPrice />
        <Input label="Ghi chú" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Dialog>
  );
}

function PoDetailDialog({ id, onClose, warehouses }: { id: string; onClose: () => void; warehouses: SharedWh['warehouses'] }) {
  const po = usePurchaseOrder(id);
  const canManage = useCan('inventory.manage');
  const [receiveOpen, setReceiveOpen] = useState(false);
  const send = useAction(() => inventoryApi.sendPo(id), inv, () => toast.success('Đã đánh dấu gửi nhà cung cấp'));
  const cancel = useAction(() => inventoryApi.cancelPo(id), inv, () => toast.success('Đã hủy đơn'));
  const d = po.data;
  return (
    <>
      <Dialog open onClose={onClose} title={d ? `Đơn ${d.code}` : 'Đơn đặt hàng'} size="lg">
        {!d ? (
          <Loading />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone={PO_STATUS[d.status]?.tone ?? 'neutral'}>{PO_STATUS[d.status]?.label}</Badge>
              <span>
                {d.supplier.name} → {d.warehouse.name}
              </span>
              {d.supplier.phone && <span className="text-ink-500">· {d.supplier.phone}</span>}
              {d.expectedDate && <span className="text-ink-500">· giao {dateLabel(d.expectedDate.slice(0, 10), false)}</span>}
            </div>
            <Table head={['Nguyên liệu', 'Đặt', 'Đã nhận', 'Đơn giá', 'Thành tiền']}>
              {d.lines.map((l) => (
                <tr key={l.id}>
                  <td className="px-3 py-2">{l.stockItem.name}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {qty(l.quantity)} {l.unit}
                  </td>
                  <td className={cn('px-3 py-2 tabular-nums', l.receivedQty >= l.quantity ? 'text-emerald-700' : 'text-amber-700')}>{qty(l.receivedQty)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{moneyPlain(l.unitPrice)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{moneyPlain(Math.round(l.quantity * l.unitPrice))}</td>
                </tr>
              ))}
            </Table>
            <div className="text-right font-bold">Tổng {money(d.total)}</div>
            {d.receipts.length > 0 && <div className="text-sm text-ink-700">Phiếu nhập: {d.receipts.map((r) => `${r.code} (${moneyPlain(r.total)})`).join(', ')}</div>}
            {d.notes && <div className="text-sm text-ink-500">Ghi chú: {d.notes}</div>}
            {canManage && (
              <div className="flex flex-wrap gap-2 border-t border-ink-100 pt-3">
                {d.status === 'DRAFT' && (
                  <Button onClick={() => send.mutate(undefined, { onError: onErr })} loading={send.isPending}>
                    Đánh dấu đã gửi NCC
                  </Button>
                )}
                {['DRAFT', 'SENT', 'PARTIAL'].includes(d.status) && (
                  <Button variant="success" onClick={() => setReceiveOpen(true)}>
                    Nhận hàng theo đơn
                  </Button>
                )}
                {['DRAFT', 'SENT'].includes(d.status) && (
                  <Button variant="ghost" className="text-red-700" onClick={() => cancel.mutate(undefined, { onError: onErr })} loading={cancel.isPending}>
                    Hủy đơn
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </Dialog>
      {receiveOpen && d && <ReceiptDialog po={d} warehouses={warehouses} defaultWarehouse={d.warehouseId} onClose={() => setReceiveOpen(false)} />}
    </>
  );
}

// ───────────────────────── Nhập kho ─────────────────────────

export function ReceiptsTab({ warehouseId, warehouses }: SharedWh) {
  const grs = useGoodsReceipts();
  const canManage = useCan('inventory.manage');
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3">
      {canManage && (
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-5 w-5" /> Nhập hàng (không theo đơn)
        </Button>
      )}
      <p className="text-sm text-ink-500">Nhận hàng theo đơn đặt: mở đơn trong tab “Đặt hàng” và chọn “Nhận hàng theo đơn”.</p>
      <ErrorBox error={grs.error} />
      {grs.isLoading ? (
        <Loading />
      ) : (grs.data ?? []).length === 0 ? (
        <EmptyState title="Chưa có phiếu nhập" />
      ) : (
        <Table head={['Mã', 'Thời gian', 'Nhà cung cấp', 'Kho', 'Số HĐ NCC', 'Số dòng', 'Tổng tiền', 'Theo đơn']}>
          {(grs.data ?? []).map((g) => (
            <tr key={g.id}>
              <td className="px-3 py-2 font-mono">{g.code}</td>
              <td className="px-3 py-2">{vnDateTime(g.receivedAt)}</td>
              <td className="px-3 py-2">{g.supplier?.name ?? '—'}</td>
              <td className="px-3 py-2">{g.warehouse.code}</td>
              <td className="px-3 py-2">{g.invoiceNo ?? '—'}</td>
              <td className="px-3 py-2 tabular-nums">{g._count.lines}</td>
              <td className="px-3 py-2 text-right tabular-nums">{moneyPlain(g.total)}</td>
              <td className="px-3 py-2">{g.poId ? 'Có' : '—'}</td>
            </tr>
          ))}
        </Table>
      )}
      {open && <ReceiptDialog warehouses={warehouses} defaultWarehouse={warehouseId} onClose={() => setOpen(false)} />}
    </div>
  );
}

function ReceiptDialog({ po, warehouses, defaultWarehouse, onClose }: { po?: PurchaseOrderDetail; warehouses: SharedWh['warehouses']; defaultWarehouse: string; onClose: () => void }) {
  const branchId = useBranchId();
  const items = useStockItems();
  const suppliers = useSuppliers();
  const [warehouseId, setWarehouseId] = useState(po?.warehouseId ?? defaultWarehouse);
  const [supplierId, setSupplierId] = useState(po?.supplierId ?? '');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceImageUrl, setInvoiceImageUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<StockLine[]>(() =>
    po ? po.lines.filter((l) => l.receivedQty < l.quantity).map((l) => ({ stockItemId: l.stockItemId, unit: l.unit, quantity: Math.round((l.quantity - l.receivedQty) * 1000) / 1000, unitPrice: l.unitPrice })) : [emptyLine()],
  );
  const create = useAction(
    () =>
      inventoryApi.createReceipt({
        branchId: po?.branchId ?? branchId,
        warehouseId,
        ...(po ? { poId: po.id } : {}),
        ...(supplierId ? { supplierId } : {}),
        ...(invoiceNo.trim() ? { invoiceNo: invoiceNo.trim() } : {}),
        ...(invoiceImageUrl.trim() ? { invoiceImageUrl: invoiceImageUrl.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        lines: lines.map((l) => ({ stockItemId: l.stockItemId, quantity: l.quantity, unit: l.unit, unitPrice: l.unitPrice ?? 0 })),
      }),
    inv,
    (gr) => {
      toast.success(`Đã nhập kho ${gr.code}`);
      onClose();
    },
  );
  return (
    <Dialog
      open
      onClose={onClose}
      title={po ? `Nhận hàng theo đơn ${po.code}` : 'Phiếu nhập kho'}
      size="lg"
      footer={
        <Button block variant="success" onClick={() => create.mutate(undefined, { onError: onErr })} loading={create.isPending} disabled={!warehouseId || !validLines(lines, true)}>
          Nhập kho · {money(lineTotal(lines))}
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <WarehouseSelect label="Kho nhận" value={warehouseId} onChange={setWarehouseId} warehouses={warehouses} />
          <Select label="Nhà cung cấp" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} disabled={!!po}>
            <option value="">Không ghi</option>
            {(suppliers.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Input label="Số hóa đơn NCC" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
          <Input label="Ảnh hóa đơn (đường dẫn)" value={invoiceImageUrl} onChange={(e) => setInvoiceImageUrl(e.target.value)} placeholder="https://..." />
        </div>
        {po && <p className="text-sm text-ink-500">Đã điền số lượng còn thiếu theo đơn. Sửa theo thực nhận, giá vốn bình quân được cập nhật tự động.</p>}
        <StockLineEditor lines={lines} onChange={setLines} items={items.data ?? []} withUnit withPrice qtyLabel="Số lượng thực nhận" />
        <Input label="Ghi chú" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Dialog>
  );
}

// ───────────────────────── Chuyển kho ─────────────────────────

export function TransfersTab() {
  const transfers = useTransfers();
  const allWh = useWarehouses('all');
  const canManage = useCan('inventory.manage');
  const [open, setOpen] = useState(false);
  const [receiving, setReceiving] = useState<TransferRow | null>(null);
  const [sending, setSending] = useState<TransferRow | null>(null);
  const send = useAction((id: string) => inventoryApi.sendTransfer(id), inv, () => {
    setSending(null);
    toast.success('Đã xuất kho chuyển đi');
  });
  return (
    <div className="space-y-3">
      {canManage && (
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-5 w-5" /> Tạo phiếu chuyển kho
        </Button>
      )}
      <ErrorBox error={transfers.error} />
      {transfers.isLoading ? (
        <Loading />
      ) : (transfers.data ?? []).length === 0 ? (
        <EmptyState title="Chưa có phiếu chuyển kho" />
      ) : (
        <Table head={['Mã', 'Tạo lúc', 'Từ kho', 'Đến kho', 'Số dòng', 'Trạng thái', '']}>
          {(transfers.data ?? []).map((t) => (
            <tr key={t.id}>
              <td className="px-3 py-2 font-mono">{t.code}</td>
              <td className="px-3 py-2">{vnDateTime(t.createdAt)}</td>
              <td className="px-3 py-2">{t.fromWarehouse.name}</td>
              <td className="px-3 py-2">{t.toWarehouse.name}</td>
              <td className="px-3 py-2 tabular-nums">{t._count.lines}</td>
              <td className="px-3 py-2">
                <Badge tone={TRANSFER_STATUS[t.status]?.tone ?? 'neutral'}>{TRANSFER_STATUS[t.status]?.label ?? t.status}</Badge>
              </td>
              <td className="px-3 py-2">
                {canManage && t.status === 'DRAFT' && (
                  <Button size="sm" onClick={() => setSending(t)}>
                    Xuất đi
                  </Button>
                )}
                {canManage && t.status === 'SENT' && (
                  <Button size="sm" variant="success" onClick={() => setReceiving(t)}>
                    Nhận hàng
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
      {open && <CreateTransferDialog warehouses={allWh.data ?? []} onClose={() => setOpen(false)} />}
      {receiving && <ReceiveTransferDialog transfer={receiving} onClose={() => setReceiving(null)} />}
      <ConfirmDialog open={!!sending} onClose={() => setSending(null)} title={`Xuất phiếu ${sending?.code ?? ''}?`} message={`Trừ tồn ${sending?.fromWarehouse.name ?? ''} ngay, kho đến xác nhận khi nhận hàng.`} confirmLabel="Xuất đi" loading={send.isPending} onConfirm={() => sending && send.mutate(sending.id, { onError: onErr })} />
    </div>
  );
}

function CreateTransferDialog({ warehouses, onClose }: { warehouses: SharedWh['warehouses']; onClose: () => void }) {
  const items = useStockItems();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<StockLine[]>([emptyLine()]);
  const create = useAction(() => inventoryApi.createTransfer({ fromWarehouseId: from, toWarehouseId: to, ...(notes.trim() ? { notes: notes.trim() } : {}), lines: lines.map((l) => ({ stockItemId: l.stockItemId, quantitySent: l.quantity })) }), inv, (t) => {
    toast.success(`Đã tạo phiếu ${t.code}`);
    onClose();
  });
  const fromItems = (items.data ?? []).filter((i) => !from || i.levels.some((l) => l.warehouseId === from && l.quantity > 0));
  return (
    <Dialog
      open
      onClose={onClose}
      title="Phiếu chuyển kho"
      size="lg"
      footer={
        <Button block onClick={() => create.mutate(undefined, { onError: onErr })} loading={create.isPending} disabled={!from || !to || from === to || !validLines(lines)}>
          Tạo phiếu (nháp)
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <WarehouseSelect label="Từ kho" value={from} onChange={setFrom} warehouses={warehouses} allowEmpty="Chọn kho đi" />
          <WarehouseSelect label="Đến kho" value={to} onChange={setTo} warehouses={warehouses.filter((w) => w.id !== from)} allowEmpty="Chọn kho đến" />
        </div>
        <StockLineEditor lines={lines} onChange={setLines} items={fromItems} qtyLabel="Số lượng chuyển" />
        <Input label="Ghi chú" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Dialog>
  );
}

/** Nhận hàng chuyển kho theo dòng chi tiết của phiếu (GET /stock-transfers/:id). */
function ReceiveTransferDialog({ transfer, onClose }: { transfer: TransferRow; onClose: () => void }) {
  const detail = useTransfer(transfer.id);
  const lines = useMemo(() => (detail.data?.lines ?? []).map((l) => ({ stockItemId: l.stockItemId, name: l.stockItem.name, unit: l.stockItem.baseUnit, cost: l.stockItem.costPerBaseUnit, sent: l.quantitySent })), [detail.data]);
  const [received, setReceived] = useState<Record<string, number>>({});
  useEffect(() => {
    setReceived(Object.fromEntries(lines.map((l) => [l.stockItemId, l.sent])));
  }, [lines]);
  const shortLines = lines.filter((l) => (received[l.stockItemId] ?? l.sent) < l.sent);
  const shortValue = shortLines.reduce((s, l) => s + Math.round((l.sent - (received[l.stockItemId] ?? l.sent)) * l.cost), 0);
  const overLine = lines.some((l) => (received[l.stockItemId] ?? l.sent) > l.sent || (received[l.stockItemId] ?? 0) < 0 || Number.isNaN(received[l.stockItemId]));
  const receive = useAction(() => inventoryApi.receiveTransfer(transfer.id, lines.map((l) => ({ stockItemId: l.stockItemId, quantityReceived: received[l.stockItemId] ?? l.sent }))), inv, () => {
    toast.success(shortLines.length ? 'Đã nhận hàng, phần thiếu được ghi hao hụt' : 'Đã nhận hàng chuyển kho');
    onClose();
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Nhận phiếu ${transfer.code}`}
      size="md"
      footer={
        <Button block variant="success" onClick={() => receive.mutate(undefined, { onError: onErr })} loading={receive.isPending} disabled={lines.length === 0 || overLine}>
          Xác nhận đã nhận
        </Button>
      }
    >
      <p className="mb-2 text-sm text-ink-700">
        {transfer.fromWarehouse.name} → {transfer.toWarehouse.name}
      </p>
      <p className={cn('mb-2 rounded-xl px-3 py-2 text-sm', shortLines.length ? 'bg-amber-50 text-amber-900' : 'bg-paper text-ink-700')}>
        {shortLines.length
          ? `Thiếu ${shortLines.length} mặt hàng (khoảng ${money(shortValue)}). Phần thiếu sẽ được ghi nhận là hao hụt (WASTE) của kho đến khi xác nhận.`
          : 'Nhập số thực nhận nếu hàng về thiếu; phần thiếu sẽ được ghi nhận là hao hụt.'}
      </p>
      <ErrorBox error={detail.error} />
      {detail.isLoading ? (
        <Loading />
      ) : lines.length === 0 ? (
        <p className="text-sm text-red-700">Phiếu này không có dòng hàng.</p>
      ) : (
        <div className="space-y-2">
          {lines.map((l) => (
            <div key={l.stockItemId} className="flex items-center gap-2 rounded-xl border border-ink-100 p-2">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{l.name}</span>
                <span className="text-xs text-ink-500">
                  Gửi {qty(l.sent)} {l.unit}
                </span>
                {(received[l.stockItemId] ?? l.sent) < l.sent && <span className="block text-xs font-semibold text-amber-800">Thiếu {qty(l.sent - (received[l.stockItemId] ?? l.sent))} {l.unit} → ghi hao hụt</span>}
                {(received[l.stockItemId] ?? l.sent) > l.sent && <span className="block text-xs font-semibold text-red-700">Không nhận nhiều hơn số đã gửi</span>}
              </span>
              <input type="number" inputMode="decimal" min={0} max={l.sent} step="any" value={received[l.stockItemId] ?? ''} onChange={(e) => setReceived((r) => ({ ...r, [l.stockItemId]: Number(e.target.value) }))} className="min-h-[48px] w-28 rounded-xl border border-ink-300 px-2 text-right text-lg tabular-nums" aria-label={`Thực nhận ${l.name}`} />
              <span className="w-10 text-sm text-ink-500">{l.unit}</span>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}

// ───────────────────────── Kiểm kê ─────────────────────────

type StocktakeFilter = '' | 'OPEN' | 'APPROVED' | 'CANCELLED';
const OPEN_STOCKTAKE = ['DRAFT', 'COUNTING', 'REVIEW'];

export function StocktakeTab({ warehouseId, setWarehouseId, warehouses }: SharedWh) {
  const items = useStockItems();
  const canManage = useCan('inventory.manage');
  const [openId, setOpenId] = useState<string | null>(null);
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [filter, setFilter] = useState<StocktakeFilter>('');
  const list = useStocktakes({ warehouseId: warehouseId || undefined, status: filter === 'APPROVED' || filter === 'CANCELLED' ? filter : undefined });
  const rows = (list.data ?? []).filter((r) => filter !== 'OPEN' || OPEN_STOCKTAKE.includes(r.status));
  const categories = [...new Set((items.data ?? []).map((i) => i.category))].sort();
  const create = useAction(() => inventoryApi.createStocktake({ warehouseId, ...(category ? { category } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}) }), inv, (st) => {
    setOpenId(st.id);
    toast.success(`Đã tạo phiếu kiểm kê ${st.code}`);
  });
  if (openId) return <StocktakeView id={openId} onBack={() => setOpenId(null)} />;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {canManage && (
        <Card title="Tạo phiếu kiểm kê">
          <div className="space-y-3">
            <WarehouseSelect value={warehouseId} onChange={setWarehouseId} warehouses={warehouses} />
            <Select label="Nhóm hàng" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Toàn kho</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <Input label="Ghi chú" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Kiểm kê bar cuối ngày..." />
            <Button block onClick={() => create.mutate(undefined, { onError: onErr })} loading={create.isPending} disabled={!warehouseId}>
              Bắt đầu kiểm kê
            </Button>
            <p className="text-xs text-ink-500">Tồn lý thuyết được chụp tại thời điểm tạo phiếu. Nhân viên đếm trên điện thoại, quản lý duyệt chênh lệch.</p>
          </div>
        </Card>
      )}
      <Card title="Phiếu kiểm kê" className={canManage ? undefined : 'lg:col-span-2'}>
        <div className="mb-2">
          <FilterChips
            value={filter}
            onChange={setFilter}
            options={[
              { value: '', label: 'Tất cả' },
              { value: 'OPEN', label: 'Đang kiểm' },
              { value: 'APPROVED', label: 'Đã duyệt' },
              { value: 'CANCELLED', label: 'Đã hủy' },
            ]}
          />
        </div>
        <ErrorBox error={list.error} />
        {list.isLoading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <p className="py-3 text-center text-sm text-ink-500">{warehouseId ? 'Kho này chưa có phiếu kiểm kê phù hợp.' : 'Chưa có phiếu kiểm kê phù hợp.'}</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {rows.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => setOpenId(r.id)} className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 py-3 text-left">
                  <span className="font-mono font-semibold">{r.code}</span>
                  <Badge tone={STOCKTAKE_STATUS[r.status]?.tone ?? 'neutral'}>{STOCKTAKE_STATUS[r.status]?.label ?? r.status}</Badge>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-700">
                    {r.warehouse.name} · {r._count.lines} dòng
                  </span>
                  <span className="text-xs text-ink-500">{vnDateTime(r.startedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function StocktakeView({ id, onBack }: { id: string; onBack: () => void }) {
  const st = useStocktake(id);
  const canManage = useCan('inventory.manage');
  const canApprove = useCan('inventory.approve');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [showExpected, setShowExpected] = useState(false);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<'count' | 'review'>('count');
  const [confirmApprove, setConfirmApprove] = useState(false);
  useEffect(() => {
    if (st.data) {
      setCounts((c) => (Object.keys(c).length ? c : Object.fromEntries(st.data!.lines.filter((l) => l.countedQty !== null).map((l) => [l.stockItemId, String(l.countedQty)]))));
      if (st.data.status === 'REVIEW' || st.data.status === 'APPROVED') setMode((m) => (m === 'count' && st.data!.status === 'APPROVED' ? 'review' : m));
    }
  }, [st.data]);
  const save = useAction(
    () => inventoryApi.countStocktake(id, Object.entries(counts).filter(([, v]) => v !== '' && !Number.isNaN(Number(v))).map(([stockItemId, v]) => ({ stockItemId, countedQty: Number(v) }))),
    inv,
    () => {
      toast.success('Đã lưu số đếm');
      setMode('review');
    },
  );
  const approve = useAction(() => inventoryApi.approveStocktake(id), inv, () => {
    setConfirmApprove(false);
    toast.success('Đã duyệt, tồn kho được điều chỉnh');
  });
  const cancel = useAction(() => inventoryApi.cancelStocktake(id), inv, () => toast.success('Đã hủy phiếu'));
  if (st.isLoading) return <Loading />;
  if (!st.data) return <ErrorBox error={st.error} />;
  const d = st.data;
  const editable = canManage && ['COUNTING', 'REVIEW'].includes(d.status);
  const lines = d.lines.filter((l) => !search || fold(l.stockItem.name).includes(fold(search)) || fold(l.stockItem.code).includes(fold(search)));
  const entered = Object.values(counts).filter((v) => v !== '').length;
  const varianceLines = d.lines.filter((l) => l.varianceQty !== null && l.varianceQty !== 0);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={onBack}>
          ← Danh sách
        </Button>
        <span className="font-mono text-lg font-bold">{d.code}</span>
        <Badge tone={STOCKTAKE_STATUS[d.status]?.tone ?? 'neutral'}>{STOCKTAKE_STATUS[d.status]?.label ?? d.status}</Badge>
        <span className="text-sm text-ink-500">
          {d.warehouse.name} · {d.countedLines}/{d.lines.length} đã đếm
        </span>
        <div className="ml-auto flex gap-1 rounded-xl bg-ink-100 p-1">
          {(['count', 'review'] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={cn('min-h-[40px] rounded-lg px-3 text-sm font-semibold', mode === m ? 'bg-white text-brand-800 shadow' : 'text-ink-500')}>
              {m === 'count' ? 'Đếm' : 'Chênh lệch'}
            </button>
          ))}
        </div>
      </div>
      {mode === 'count' ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-ink-300" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm mặt hàng" className="pl-10" />
            </div>
            <Checkbox label="Hiện tồn lý thuyết" checked={showExpected} onChange={setShowExpected} />
          </div>
          <div className="divide-y divide-ink-100 overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-ink-900/[0.06]">
            {lines.map((l) => {
              const v = counts[l.stockItemId] ?? '';
              const diff = v === '' ? null : Number(v) - l.expectedQty;
              return (
                <div key={l.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{l.stockItem.name}</div>
                    <div className="text-xs text-ink-500">
                      {l.stockItem.category}
                      {showExpected && ` · lý thuyết ${qty(l.expectedQty)} ${l.stockItem.baseUnit}`}
                      {showExpected && diff !== null && diff !== 0 && <span className={diff < 0 ? ' text-red-700' : ' text-emerald-700'}> · {diff > 0 ? '+' : ''}{qty(Math.round(diff * 1000) / 1000)}</span>}
                    </div>
                  </div>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    disabled={!editable}
                    value={v}
                    onChange={(e) => setCounts((c) => ({ ...c, [l.stockItemId]: e.target.value }))}
                    className={cn('min-h-[52px] w-28 rounded-xl border px-2 text-right text-xl font-bold tabular-nums', v === '' ? 'border-ink-300' : 'border-emerald-500 bg-emerald-50')}
                    aria-label={`Số đếm ${l.stockItem.name}`}
                  />
                  <span className="w-10 text-sm text-ink-500">{l.stockItem.baseUnit}</span>
                </div>
              );
            })}
          </div>
          {editable && (
            <div className="safe-bottom sticky bottom-0 flex gap-2 border-t border-ink-100 bg-white p-2">
              <Button block size="lg" onClick={() => save.mutate(undefined, { onError: onErr })} loading={save.isPending} disabled={entered === 0}>
                Lưu {entered} số đếm
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-white shadow-card ring-1 ring-ink-900/[0.06] p-3">
              <div className="text-xs text-ink-500 uppercase">Đã đếm</div>
              <div className="text-2xl font-black">
                {d.countedLines}/{d.lines.length}
              </div>
            </div>
            <div className="rounded-2xl bg-white shadow-card ring-1 ring-ink-900/[0.06] p-3">
              <div className="text-xs text-ink-500 uppercase">Dòng chênh lệch</div>
              <div className="text-2xl font-black">{varianceLines.length}</div>
            </div>
            <div className="rounded-2xl bg-white shadow-card ring-1 ring-ink-900/[0.06] p-3">
              <div className="text-xs text-ink-500 uppercase">Giá trị chênh lệch</div>
              <div className={cn('text-2xl font-black tabular-nums', d.varianceValue < 0 ? 'text-red-700' : 'text-emerald-700')}>{money(d.varianceValue)}</div>
            </div>
          </div>
          <Table head={['Mặt hàng', 'Lý thuyết', 'Thực đếm', 'Chênh lệch', 'Giá trị']}>
            {d.lines
              .filter((l) => l.countedQty !== null)
              .map((l) => (
                <tr key={l.id} className={cn(l.varianceQty && l.varianceQty < 0 && 'bg-red-50')}>
                  <td className="px-3 py-2">{l.stockItem.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {qty(l.expectedQty)} {l.stockItem.baseUnit}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{qty(l.countedQty ?? 0)}</td>
                  <td className={cn('px-3 py-2 text-right font-semibold tabular-nums', (l.varianceQty ?? 0) < 0 ? 'text-red-700' : (l.varianceQty ?? 0) > 0 ? 'text-emerald-700' : '')}>
                    {(l.varianceQty ?? 0) > 0 ? '+' : ''}
                    {qty(l.varianceQty ?? 0)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{moneyPlain(l.varianceValue ?? 0)}</td>
                </tr>
              ))}
          </Table>
          {d.countedLines < d.lines.length && <p className="text-sm text-amber-700">Còn {d.lines.length - d.countedLines} mặt hàng chưa đếm, sẽ không được điều chỉnh khi duyệt.</p>}
          <div className="flex flex-wrap gap-2">
            {d.status === 'REVIEW' && canApprove && (
              <Button variant="success" onClick={() => setConfirmApprove(true)}>
                Duyệt điều chỉnh tồn kho
              </Button>
            )}
            {d.status === 'REVIEW' && !canApprove && <p className="text-sm text-ink-500">Chờ quản lý có quyền duyệt kiểm kê.</p>}
            {canManage && ['COUNTING', 'REVIEW'].includes(d.status) && (
              <Button variant="ghost" className="text-red-700" onClick={() => cancel.mutate(undefined, { onError: onErr })} loading={cancel.isPending}>
                Hủy phiếu
              </Button>
            )}
          </div>
        </>
      )}
      <ConfirmDialog open={confirmApprove} onClose={() => setConfirmApprove(false)} title="Duyệt kiểm kê?" message={`Điều chỉnh ${varianceLines.length} mặt hàng, giá trị chênh lệch ${money(d.varianceValue)}.`} confirmLabel="Duyệt" loading={approve.isPending} onConfirm={() => approve.mutate(undefined, { onError: onErr })} />
    </div>
  );
}

// ───────────────────────── Hao hụt ─────────────────────────

const WASTE_REASONS = ['Hỏng, hết hạn', 'Rơi vỡ', 'Nấu hỏng', 'Khách trả món', 'Sơ chế hao hụt'];

export function WasteTab({ warehouseId, setWarehouseId, warehouses }: SharedWh) {
  const items = useStockItems();
  const canManage = useCan('inventory.manage');
  const recentWaste = useMovements(warehouseId || null, { kind: 'WASTE' });
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<StockLine[]>([emptyLine()]);
  const whItems = (items.data ?? []).filter((i) => i.levels.some((l) => l.warehouseId === warehouseId));
  const record = useAction(() => inventoryApi.waste({ warehouseId, reason: reason.trim(), lines: lines.map((l) => ({ stockItemId: l.stockItemId, quantity: l.quantity })) }), inv, () => {
    toast.success('Đã ghi hao hụt');
    setLines([emptyLine()]);
    setReason('');
  });
  const estValue = lines.reduce((s, l) => s + (l.quantity ?? 0) * (items.data?.find((i) => i.id === l.stockItemId)?.costPerBaseUnit ?? 0), 0);
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card title="Ghi hao hụt, hủy hàng">
        {!canManage ? (
          <p className="text-sm text-ink-500">Bạn không có quyền ghi hao hụt.</p>
        ) : (
          <div className="space-y-3">
            <WarehouseSelect value={warehouseId} onChange={setWarehouseId} warehouses={warehouses} />
            <Input label="Lý do" value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="flex flex-wrap gap-1.5">
              {WASTE_REASONS.map((r) => (
                <button key={r} type="button" onClick={() => setReason(r)} className="min-h-[36px] rounded-full bg-gold-100 px-3 text-sm">
                  {r}
                </button>
              ))}
            </div>
            <StockLineEditor lines={lines} onChange={setLines} items={whItems.length ? whItems : (items.data ?? [])} qtyLabel="Số lượng hủy" />
            <p className="text-right text-sm text-ink-700">Giá trị ước tính: {money(Math.round(estValue))}</p>
            <Button block variant="danger" onClick={() => record.mutate(undefined, { onError: onErr })} loading={record.isPending} disabled={!warehouseId || !reason.trim() || !validLines(lines)}>
              Ghi hao hụt
            </Button>
          </div>
        )}
      </Card>
      <Card title="Hao hụt gần đây">
        {recentWaste.isLoading ? (
          <Loading />
        ) : (recentWaste.data ?? []).length === 0 ? (
          <p className="py-3 text-center text-sm text-ink-500">Chưa có hao hụt ở kho này.</p>
        ) : (
          <ul className="divide-y divide-ink-100 text-sm">
            {(recentWaste.data ?? []).slice(0, 50).map((m) => (
              <li key={m.id} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1">
                  <b>{m.stockItem.name}</b> · {m.reason ?? 'Không ghi lý do'}
                  <span className="block text-xs text-ink-500">{vnDateTime(m.occurredAt)}</span>
                </span>
                <span className="font-semibold text-red-700 tabular-nums">
                  {qty(m.quantity)} {m.stockItem.baseUnit}
                </span>
                <span className="w-24 text-right tabular-nums text-ink-500">{moneyPlain(Math.round(Math.abs(m.quantity) * m.unitCost))}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
