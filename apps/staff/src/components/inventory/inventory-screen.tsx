'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Pencil, Plus, Search } from 'lucide-react';
import { STOCK_MOVEMENT_LABELS } from '@dalan/contracts';
import { errorMessage } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { useAction } from '@/lib/queries';
import { inventoryApi, opsKeys, useInventoryAlerts, useMovements, useStockItems, useStockLevels, useSuppliers, useWarehouses, type StockItem, type StockLevelRow, type Supplier } from '@/lib/queries-ops';
import { fold, vnDateTime } from '@/lib/ops-utils';
import { cn, money, moneyPlain, qty } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Badge, EmptyState, Input, Loading, Select, Textarea } from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';
import { Checkbox, ErrorBox, MoneyInput, NumberInput, PageHeader, Stat, TabBar, Table } from '@/components/ops/ui';
import { WarehouseSelect } from './common';
import { PurchaseOrdersTab, ReceiptsTab, StocktakeTab, TransfersTab, WasteTab } from './inventory-docs';
import { CogsTab, RecipesTab } from './inventory-recipes';

type Tab = 'levels' | 'items' | 'suppliers' | 'po' | 'gr' | 'transfers' | 'stocktake' | 'waste' | 'recipes' | 'cogs';

export function InventoryScreen() {
  const [tab, setTab] = useState<Tab>('levels');
  const warehouses = useWarehouses('branch');
  const alerts = useInventoryAlerts();
  const [wh, setWh] = useState('');
  useEffect(() => {
    if (!wh && warehouses.data?.length) setWh(warehouses.data.find((w) => w.kind === 'MAIN')?.id ?? warehouses.data[0]!.id);
  }, [wh, warehouses.data]);
  const tabs: { value: Tab; label: string; badge?: number | null }[] = [
    { value: 'levels', label: 'Tồn kho', badge: alerts.data?.length || null },
    { value: 'items', label: 'Nguyên liệu' },
    { value: 'suppliers', label: 'Nhà cung cấp' },
    { value: 'po', label: 'Đặt hàng' },
    { value: 'gr', label: 'Nhập kho' },
    { value: 'transfers', label: 'Chuyển kho' },
    { value: 'stocktake', label: 'Kiểm kê' },
    { value: 'waste', label: 'Hao hụt' },
    { value: 'recipes', label: 'Định lượng' },
    { value: 'cogs', label: 'Giá vốn' },
  ];
  const shared = { warehouseId: wh, setWarehouseId: setWh, warehouses: warehouses.data ?? [] };
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title="Kho và định lượng" subtitle="Tồn kho, nhập xuất, kiểm kê và giá vốn theo món" />
      <TabBar value={tab} onChange={setTab} tabs={tabs} />
      <div className="p-3 md:p-4">
        <ErrorBox error={warehouses.error} className="mb-3" />
        {tab === 'levels' && <LevelsTab {...shared} />}
        {tab === 'items' && <ItemsTab />}
        {tab === 'suppliers' && <SuppliersTab />}
        {tab === 'po' && <PurchaseOrdersTab {...shared} />}
        {tab === 'gr' && <ReceiptsTab {...shared} />}
        {tab === 'transfers' && <TransfersTab />}
        {tab === 'stocktake' && <StocktakeTab {...shared} />}
        {tab === 'waste' && <WasteTab {...shared} />}
        {tab === 'recipes' && <RecipesTab />}
        {tab === 'cogs' && <CogsTab />}
      </div>
    </div>
  );
}

export interface SharedWh {
  warehouseId: string;
  setWarehouseId: (id: string) => void;
  warehouses: import('@/lib/queries-ops').Warehouse[];
}

// ───────────────────────── Tồn kho ─────────────────────────

function LevelsTab({ warehouseId, setWarehouseId, warehouses }: SharedWh) {
  const levels = useStockLevels(warehouseId || null);
  const alerts = useInventoryAlerts();
  const [search, setSearch] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);
  const [detail, setDetail] = useState<StockLevelRow | null>(null);
  const rows = useMemo(() => {
    const s = fold(search);
    return (levels.data ?? []).filter((r) => (!onlyLow || r.isLow) && (!s || fold(r.name).includes(s) || fold(r.code).includes(s) || fold(r.category).includes(s)));
  }, [levels.data, search, onlyLow]);
  const totalValue = (levels.data ?? []).reduce((s, r) => s + r.value, 0);
  const lowCount = (levels.data ?? []).filter((r) => r.isLow).length;
  return (
    <div className="space-y-3">
      {alerts.data && alerts.data.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="mb-1 flex items-center gap-2 font-bold">
            <AlertTriangle className="h-5 w-5" /> {alerts.data.length} nguyên liệu dưới mức tồn tối thiểu (toàn cơ sở)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {alerts.data.map((a) => (
              <span key={a.stockItemId} className="rounded-full bg-white px-2 py-0.5">
                {a.name}: <b>{qty(a.quantity)}</b>/{qty(a.minStock)} {a.baseUnit}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-[260px_1fr_auto]">
        <WarehouseSelect value={warehouseId} onChange={setWarehouseId} warehouses={warehouses} label="" />
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-ink-300" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm nguyên liệu, nhóm" className="pl-10" />
        </div>
        <Checkbox label="Chỉ hàng dưới mức" checked={onlyLow} onChange={setOnlyLow} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Mặt hàng" value={levels.data?.length ?? '—'} />
        <Stat label="Giá trị tồn" value={money(totalValue)} tone="brand" />
        <Stat label="Dưới mức" value={lowCount} tone={lowCount ? 'warning' : 'neutral'} />
      </div>
      <ErrorBox error={levels.error} />
      {levels.isLoading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState title="Kho chưa có tồn" hint="Nhập hàng để bắt đầu theo dõi tồn kho." />
      ) : (
        <Table head={['Mã', 'Nguyên liệu', 'Nhóm', 'Tồn', 'Tối thiểu', 'Giá vốn/ĐV', 'Giá trị', '']}>
          {rows.map((r) => (
            <tr key={r.stockItemId} className={cn('cursor-pointer hover:bg-paper', r.isLow && 'bg-amber-50')} onClick={() => setDetail(r)}>
              <td className="px-3 py-2 font-mono text-xs">{r.code}</td>
              <td className="px-3 py-2 font-semibold">{r.name}</td>
              <td className="px-3 py-2 text-ink-500">{r.category}</td>
              <td className={cn('px-3 py-2 text-right font-bold tabular-nums', r.isLow && 'text-amber-800', r.quantity < 0 && 'text-red-700')}>
                {qty(r.quantity)} {r.baseUnit}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-500">{r.minStock === null ? '—' : qty(r.minStock)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{moneyPlain(r.costPerBaseUnit)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{moneyPlain(r.value)}</td>
              <td className="px-3 py-2">{r.isLow && <Badge tone="warning">Sắp hết</Badge>}</td>
            </tr>
          ))}
        </Table>
      )}
      {detail && <MovementsDialog warehouseId={warehouseId} row={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function MovementsDialog({ warehouseId, row, onClose }: { warehouseId: string; row: StockLevelRow; onClose: () => void }) {
  const mv = useMovements(warehouseId, { stockItemId: row.stockItemId });
  return (
    <Dialog open onClose={onClose} title={`Biến động: ${row.name}`} size="lg">
      <p className="mb-2 text-sm text-ink-700">
        Tồn hiện tại <b>{qty(row.quantity)} {row.baseUnit}</b> · giá vốn bình quân {moneyPlain(row.costPerBaseUnit)}đ/{row.baseUnit}
      </p>
      {mv.isLoading ? (
        <Loading />
      ) : (
        <Table head={['Thời gian', 'Loại', 'Số lượng', 'Giá vốn', 'Ghi chú']}>
          {(mv.data ?? []).map((m) => (
            <tr key={m.id}>
              <td className="px-3 py-2 whitespace-nowrap">{vnDateTime(m.occurredAt)}</td>
              <td className="px-3 py-2">{STOCK_MOVEMENT_LABELS[m.kind] ?? m.kind}</td>
              <td className={cn('px-3 py-2 text-right font-semibold tabular-nums', m.quantity < 0 ? 'text-red-700' : 'text-emerald-700')}>
                {m.quantity > 0 ? '+' : ''}
                {qty(m.quantity)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{moneyPlain(m.unitCost)}</td>
              <td className="px-3 py-2 text-ink-500">{m.reason ?? m.refType ?? ''}</td>
            </tr>
          ))}
        </Table>
      )}
    </Dialog>
  );
}

// ───────────────────────── Nguyên liệu ─────────────────────────

function ItemsTab() {
  const items = useStockItems();
  const suppliers = useSuppliers();
  const canManage = useCan('inventory.manage');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [edit, setEdit] = useState<StockItem | 'new' | null>(null);
  const categories = [...new Set((items.data ?? []).map((i) => i.category))].sort();
  const rows = (items.data ?? []).filter((i) => (!category || i.category === category) && (!search || fold(i.name).includes(fold(search)) || fold(i.code).includes(fold(search))));
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_200px_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-ink-300" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tên, mã" className="pl-10" />
        </div>
        <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Nhóm">
          <option value="">Mọi nhóm</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        {canManage && (
          <Button onClick={() => setEdit('new')}>
            <Plus className="h-5 w-5" /> Thêm nguyên liệu
          </Button>
        )}
      </div>
      {items.isLoading ? (
        <Loading />
      ) : (
        <Table head={['Mã', 'Tên', 'Nhóm', 'ĐV cơ sở', 'ĐV mua', 'Tồn tối thiểu', 'Giá vốn/ĐV', 'Tổng tồn', '']}>
          {rows.map((i) => (
            <tr key={i.id} className={cn(!i.isActive && 'opacity-50')}>
              <td className="px-3 py-2 font-mono text-xs">{i.code}</td>
              <td className="px-3 py-2 font-semibold">{i.name}</td>
              <td className="px-3 py-2">{i.category}</td>
              <td className="px-3 py-2">{i.baseUnit}</td>
              <td className="px-3 py-2">
                {i.purchaseUnit}
                {i.purchaseUnit !== i.baseUnit && <span className="text-xs text-ink-500"> = {qty(i.purchaseUnitFactor)} {i.baseUnit}</span>}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{i.minStock === null ? '—' : qty(i.minStock)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{moneyPlain(i.costPerBaseUnit)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{qty(i.totalQuantity)}</td>
              <td className="px-3 py-2">
                {canManage && (
                  <button type="button" onClick={() => setEdit(i)} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-ink-100" aria-label="Sửa">
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
      {edit && <StockItemDialog item={edit === 'new' ? null : edit} suppliers={suppliers.data ?? []} onClose={() => setEdit(null)} />}
    </div>
  );
}

function StockItemDialog({ item, suppliers, onClose }: { item: StockItem | null; suppliers: Supplier[]; onClose: () => void }) {
  const initial = {
    code: item?.code ?? '',
    name: item?.name ?? '',
    category: item?.category ?? '',
    baseUnit: item?.baseUnit ?? 'g',
    purchaseUnit: item?.purchaseUnit ?? 'kg',
    purchaseUnitFactor: item?.purchaseUnitFactor ?? 1000,
    minStock: item?.minStock ?? null,
    trackLots: item?.trackLots ?? false,
    defaultSupplierId: item?.defaultSupplierId ?? '',
    costPerBaseUnit: item?.costPerBaseUnit ?? 0,
    isActive: item?.isActive ?? true,
  };
  const [f, setF] = useState(initial);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const save = useAction(
    (body: Record<string, unknown>) => (item ? inventoryApi.updateStockItem(item.id, body) : inventoryApi.createStockItem(body)),
    () => [opsKeys.inventory],
    () => {
      toast.success(item ? 'Đã lưu nguyên liệu' : 'Đã thêm nguyên liệu');
      onClose();
    },
  );
  const submit = () => {
    const full: Record<string, unknown> = { ...f, defaultSupplierId: f.defaultSupplierId || null, code: f.code.trim(), name: f.name.trim(), category: f.category.trim() };
    let body: Record<string, unknown> = full;
    if (item) {
      body = {};
      for (const k of Object.keys(f) as (keyof typeof f)[]) if (f[k] !== initial[k]) body[k] = full[k];
      if (Object.keys(body).length === 0) return onClose();
    }
    save.mutate(body, { onError: (e) => toast.error(errorMessage(e)) });
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={item ? `Sửa ${item.name}` : 'Thêm nguyên liệu'}
      size="lg"
      footer={
        <Button block onClick={submit} loading={save.isPending} disabled={!f.code.trim() || !f.name.trim() || !f.category.trim() || !f.baseUnit || !f.purchaseUnit || f.purchaseUnitFactor <= 0}>
          Lưu
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Mã" value={f.code} onChange={(e) => set('code', e.target.value.toUpperCase())} />
        <Input label="Tên" value={f.name} onChange={(e) => set('name', e.target.value)} />
        <Input label="Nhóm" value={f.category} onChange={(e) => set('category', e.target.value)} placeholder="Thịt, Hải sản, Rau, Đồ uống..." />
        <Select label="Nhà cung cấp mặc định" value={f.defaultSupplierId} onChange={(e) => set('defaultSupplierId', e.target.value)}>
          <option value="">Không</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Input label="Đơn vị cơ sở" value={f.baseUnit} onChange={(e) => set('baseUnit', e.target.value)} hint="g, ml, cái, lon..." />
        <Input label="Đơn vị mua" value={f.purchaseUnit} onChange={(e) => set('purchaseUnit', e.target.value)} hint="kg, thùng 24 lon, két 20 chai..." />
        <NumberInput label={`1 ${f.purchaseUnit || 'ĐV mua'} = ? ${f.baseUnit || 'ĐV cơ sở'}`} value={f.purchaseUnitFactor} onChange={(v) => set('purchaseUnitFactor', v ?? 1)} min={0} />
        <NumberInput label={`Tồn tối thiểu (${f.baseUnit})`} value={f.minStock} onChange={(v) => set('minStock', v)} min={0} />
        <MoneyInput label={`Giá vốn mỗi ${f.baseUnit || 'ĐV'}`} value={Math.round(f.costPerBaseUnit)} onChange={(v) => set('costPerBaseUnit', v ?? 0)} hint="Tự cập nhật bình quân khi nhập hàng" />
        <div>
          <Checkbox label="Theo dõi lô, hạn dùng" checked={f.trackLots} onChange={(v) => set('trackLots', v)} />
          <Checkbox label="Đang sử dụng" checked={f.isActive} onChange={(v) => set('isActive', v)} />
        </div>
      </div>
    </Dialog>
  );
}

// ───────────────────────── Nhà cung cấp ─────────────────────────

function SuppliersTab() {
  const suppliers = useSuppliers();
  const canManage = useCan('inventory.manage');
  const [edit, setEdit] = useState<Supplier | 'new' | null>(null);
  return (
    <div className="space-y-3">
      {canManage && (
        <Button onClick={() => setEdit('new')}>
          <Plus className="h-5 w-5" /> Thêm nhà cung cấp
        </Button>
      )}
      {suppliers.isLoading ? (
        <Loading />
      ) : (suppliers.data ?? []).length === 0 ? (
        <EmptyState title="Chưa có nhà cung cấp" />
      ) : (
        <Table head={['Mã', 'Tên', 'Điện thoại', 'Email', 'Mã số thuế', 'Điều khoản thanh toán', '']}>
          {(suppliers.data ?? []).map((s) => (
            <tr key={s.id} className={cn(!s.isActive && 'opacity-50')}>
              <td className="px-3 py-2 font-mono text-xs">{s.code}</td>
              <td className="px-3 py-2 font-semibold">
                {s.name}
                {s.address && <span className="block text-xs font-normal text-ink-500">{s.address}</span>}
              </td>
              <td className="px-3 py-2">{s.phone ?? '—'}</td>
              <td className="px-3 py-2">{s.email ?? '—'}</td>
              <td className="px-3 py-2">{s.taxCode ?? '—'}</td>
              <td className="px-3 py-2">{s.paymentTerms ?? '—'}</td>
              <td className="px-3 py-2">
                {canManage && (
                  <button type="button" onClick={() => setEdit(s)} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-ink-100" aria-label="Sửa">
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
      {edit && <SupplierDialog supplier={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function SupplierDialog({ supplier, onClose }: { supplier: Supplier | null; onClose: () => void }) {
  const initial = {
    code: supplier?.code ?? '',
    name: supplier?.name ?? '',
    phone: supplier?.phone ?? '',
    email: supplier?.email ?? '',
    address: supplier?.address ?? '',
    taxCode: supplier?.taxCode ?? '',
    paymentTerms: supplier?.paymentTerms ?? '',
    notes: supplier?.notes ?? '',
    isActive: supplier?.isActive ?? true,
  };
  const [f, setF] = useState(initial);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const save = useAction(
    (body: Record<string, unknown>) => (supplier ? inventoryApi.updateSupplier(supplier.id, body) : inventoryApi.createSupplier(body)),
    () => [opsKeys.inventory],
    () => {
      toast.success('Đã lưu nhà cung cấp');
      onClose();
    },
  );
  const norm = (k: keyof typeof f) => {
    const v = f[k];
    if (typeof v === 'boolean') return v;
    if (k === 'code' || k === 'name') return v.trim();
    return v.trim() ? v.trim() : null;
  };
  const submit = () => {
    const body: Record<string, unknown> = {};
    for (const k of Object.keys(f) as (keyof typeof f)[]) if (!supplier || f[k] !== initial[k]) body[k] = norm(k);
    if (!supplier) for (const k of Object.keys(body)) if (body[k] === null) delete body[k];
    if (supplier && Object.keys(body).length === 0) return onClose();
    save.mutate(body, { onError: (e) => toast.error(errorMessage(e)) });
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={supplier ? `Sửa ${supplier.name}` : 'Thêm nhà cung cấp'}
      size="lg"
      footer={
        <Button block onClick={submit} loading={save.isPending} disabled={!f.code.trim() || !f.name.trim()}>
          Lưu
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Mã" value={f.code} onChange={(e) => set('code', e.target.value.toUpperCase())} />
        <Input label="Tên" value={f.name} onChange={(e) => set('name', e.target.value)} />
        <Input label="Điện thoại" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
        <Input label="Email" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
        <Input label="Mã số thuế" value={f.taxCode} onChange={(e) => set('taxCode', e.target.value)} />
        <Input label="Điều khoản thanh toán" value={f.paymentTerms} onChange={(e) => set('paymentTerms', e.target.value)} placeholder="Công nợ 15 ngày..." />
      </div>
      <Input label="Địa chỉ" value={f.address} onChange={(e) => set('address', e.target.value)} className="mt-3" />
      <Textarea label="Ghi chú" value={f.notes} onChange={(e) => set('notes', e.target.value)} />
      <Checkbox label="Đang giao dịch" checked={f.isActive} onChange={(v) => set('isActive', v)} />
    </Dialog>
  );
}
