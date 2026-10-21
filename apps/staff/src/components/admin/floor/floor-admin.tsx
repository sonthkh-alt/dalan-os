'use client';

/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, PointerSensor, TouchSensor, useDraggable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { Pencil, Plus, Printer, RotateCw, Save, Undo2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { errorMessage } from '@/lib/api';
import { useBranchId } from '@/lib/auth-store';
import { adminKeys, floorAdminApi, tableQrUrl, useAdminAreas, type AdminArea, type AdminTable, type AreaKind } from '@/lib/queries-admin';
import { cn, money } from '@/lib/utils';
import { renderQr } from '@/components/pay/qr-canvas';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Badge, EmptyState, Input, Loading, Select } from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';
import { BpsInput, Card, IntInput, MoneyInput, Toggle, codeFrom, diffPatch } from '../form';

const GRID = 10;
const snap = (v: number) => Math.max(0, Math.round(v / GRID) * GRID);

export const AREA_KIND_LABELS: Record<AreaKind, string> = {
  HALL: 'Sảnh',
  VIP_ROOM: 'Phòng VIP',
  OUTDOOR: 'Sân vườn',
  BAR: 'Quầy bar',
  TAKEAWAY: 'Mang về',
  VIRTUAL: 'Bàn ảo',
};

const SHAPE_LABELS: Record<AdminTable['shape'], string> = { ROUND: 'Tròn', RECT: 'Chữ nhật', SQUARE: 'Vuông', BAR: 'Quầy' };

type Pos = { posX: number; posY: number };

export function FloorAdmin() {
  const branchId = useBranchId();
  const qc = useQueryClient();
  const areas = useAdminAreas(branchId);
  const [areaId, setAreaId] = useState<string | null>(null);
  const [moved, setMoved] = useState<Record<string, Pos>>({});
  const [saving, setSaving] = useState(false);
  const [tableDialog, setTableDialog] = useState<{ table: AdminTable | null } | null>(null);
  const [areaDialog, setAreaDialog] = useState<{ area: AdminArea | null } | null>(null);

  const list = areas.data ?? [];
  const area = list.find((a) => a.id === areaId) ?? list[0];
  const dirty = Object.keys(moved).length;
  const lastDragAt = useRef(0);

  useEffect(() => setMoved({}), [branchId]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }));

  const tables = useMemo(() => (area?.tables ?? []).map((t) => ({ ...t, ...(moved[t.id] ?? {}) })), [area, moved]);
  const canvas = useMemo(() => {
    const w = Math.max(900, ...tables.map((t) => t.posX + t.width + 120));
    const h = Math.max(560, ...tables.map((t) => t.posY + t.height + 120));
    return { w, h };
  }, [tables]);

  const onDragEnd = (e: DragEndEvent) => {
    lastDragAt.current = Date.now();
    const t = tables.find((x) => x.id === e.active.id);
    if (!t || (e.delta.x === 0 && e.delta.y === 0)) return;
    setMoved((m) => ({ ...m, [t.id]: { posX: snap(t.posX + e.delta.x), posY: snap(t.posY + e.delta.y) } }));
  };

  const saveLayout = async () => {
    setSaving(true);
    try {
      await floorAdminApi.saveLayout(
        branchId,
        Object.entries(moved).map(([id, p]) => ({ id, posX: p.posX, posY: p.posY })),
      );
      toast.success('Đã lưu sơ đồ bàn');
      setMoved({});
      void qc.invalidateQueries({ queryKey: adminKeys.areas(branchId) });
      void qc.invalidateQueries({ queryKey: ['floor', branchId] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (areas.isLoading) return <Loading label="Đang tải sơ đồ..." />;
  if (areas.isError) return <p className="text-red-700">{errorMessage(areas.error)}</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="sr-only">Sơ đồ bàn</h2>
        <div className="ml-auto flex flex-wrap gap-2">
          <Link href="/admin/floor/qr" target="_blank" className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-ink-300 bg-white px-3 text-sm font-semibold hover:bg-ink-100">
            <Printer className="h-4 w-4" /> In mã QR bàn
          </Link>
          <Button size="sm" variant="secondary" onClick={() => setAreaDialog({ area: null })}>
            <Plus className="h-4 w-4" /> Khu vực
          </Button>
          {area && (
            <Button size="sm" onClick={() => setTableDialog({ table: null })}>
              <Plus className="h-4 w-4" /> Thêm bàn
            </Button>
          )}
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState title="Cơ sở chưa có khu vực" hint="Thêm khu vực (tầng, sảnh, phòng VIP) rồi thêm bàn." />
      ) : (
        <>
          <div className="no-scrollbar flex items-center gap-2 overflow-x-auto">
            {list.map((a) => (
              <button key={a.id} type="button" onClick={() => setAreaId(a.id)} className={cn('flex min-h-[44px] shrink-0 items-center gap-2 rounded-full px-4 font-semibold', area?.id === a.id ? 'bg-brand-700 text-white' : 'border border-ink-100 bg-white text-ink-700')}>
                {a.name}
                <span className={cn('rounded-full px-2 text-xs', area?.id === a.id ? 'bg-white/20' : 'bg-ink-100')}>{a.tables.length}</span>
                {!a.isActive && <span className="text-xs opacity-70">(tắt)</span>}
              </button>
            ))}
            {area && (
              <Button size="sm" variant="ghost" onClick={() => setAreaDialog({ area })} aria-label="Sửa khu vực">
                <Pencil className="h-4 w-4" /> Sửa khu vực
              </Button>
            )}
          </div>

          <Card
            title={area ? `${area.name} · ${AREA_KIND_LABELS[area.kind]}` : ''}
            actions={
              <>
                {dirty > 0 && <span className="text-sm font-semibold text-amber-700">{dirty} bàn đã di chuyển, chưa lưu</span>}
                <Button size="sm" variant="ghost" disabled={!dirty} onClick={() => setMoved({})}>
                  <Undo2 className="h-4 w-4" /> Hoàn tác
                </Button>
                <Button size="sm" disabled={!dirty} loading={saving} onClick={() => void saveLayout()}>
                  <Save className="h-4 w-4" /> Lưu sơ đồ
                </Button>
              </>
            }
          >
            <p className="mb-2 text-xs text-ink-500">Kéo thả bàn để sắp xếp (bắt lưới {GRID}px). Chạm vào bàn để sửa thông tin và mã QR.</p>
            <div className="scrollbar-thin overflow-auto rounded-xl border border-ink-100 bg-paper">
              <DndContext sensors={sensors} onDragEnd={onDragEnd}>
                <div
                  className="relative"
                  style={{
                    width: canvas.w,
                    height: canvas.h,
                    backgroundImage: 'radial-gradient(circle, var(--color-ink-100) 1px, transparent 1px)',
                    backgroundSize: `${GRID * 2}px ${GRID * 2}px`,
                  }}
                >
                  {tables.map((t) => (
                    <DraggableTable key={t.id} table={t} moved={!!moved[t.id]} onOpen={() => {
                        if (Date.now() - lastDragAt.current < 300) return;
                        setTableDialog({ table: area!.tables.find((x) => x.id === t.id)! });
                      }} />
                  ))}
                </div>
              </DndContext>
            </div>
          </Card>

          {area && (
            <Card title={`Danh sách bàn (${area.tables.length})`}>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {area.tables.map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => setTableDialog({ table: t })} className="flex w-full items-center gap-2 rounded-xl border border-ink-100 px-3 py-2 text-left hover:border-brand-300">
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">
                          {t.name} <span className="text-xs font-normal text-ink-500">({t.code})</span>
                        </span>
                        <span className="block text-xs text-ink-500">
                          {t.minSeats}–{t.maxSeats} chỗ · {SHAPE_LABELS[t.shape]}
                          {t.isPrivateRoom ? ' · Phòng riêng' : ''}
                          {t.minSpend ? ` · Tối thiểu ${money(t.minSpend)}` : ''}
                        </span>
                      </span>
                      {!t.isActive && <Badge>Tắt</Badge>}
                      <Pencil className="h-4 w-4 text-ink-300" />
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      {tableDialog && area && <TableDialog table={tableDialog.table} areas={list} defaultAreaId={area.id} onClose={() => setTableDialog(null)} />}
      {areaDialog && <AreaDialog area={areaDialog.area} onClose={() => setAreaDialog(null)} onCreated={(id) => setAreaId(id)} />}
    </div>
  );
}

function DraggableTable({ table, moved, onOpen }: { table: AdminTable; moved: boolean; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: table.id });
  const translate = transform ? `translate3d(${transform.x}px, ${transform.y}px, 0) ` : '';
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...listeners}
      {...attributes}
      onClick={onOpen}
      className={cn(
        'absolute flex touch-none flex-col items-center justify-center border-2 text-center shadow-sm select-none',
        table.shape === 'ROUND' ? 'rounded-full' : table.shape === 'BAR' ? 'rounded-md' : 'rounded-xl',
        table.isPrivateRoom ? 'border-gold-500 bg-gold-100' : 'border-ink-300 bg-white',
        moved && 'border-amber-500 ring-2 ring-amber-200',
        !table.isActive && 'opacity-50',
        isDragging ? 'z-10 cursor-grabbing shadow-xl' : 'cursor-grab',
      )}
      style={{ left: table.posX, top: table.posY, width: table.width, height: table.height, transform: `${translate}rotate(${table.rotation}deg)` }}
    >
      <span className="text-sm leading-tight font-bold">{table.name.replace(/^Bàn /, '')}</span>
      <span className="text-[11px] text-ink-500">{table.maxSeats} chỗ</span>
    </button>
  );
}

interface TableForm {
  areaId: string;
  code: string;
  name: string;
  minSeats: number;
  maxSeats: number;
  shape: AdminTable['shape'];
  width: number;
  height: number;
  rotation: number;
  isPrivateRoom: boolean;
  minSpend: number | null;
  sortOrder: number;
  isActive: boolean;
  [k: string]: unknown;
}

function TableDialog({ table, areas, defaultAreaId, onClose }: { table: AdminTable | null; areas: AdminArea[]; defaultAreaId: string; onClose: () => void }) {
  const branchId = useBranchId();
  const qc = useQueryClient();
  const original: TableForm | null = table
    ? { areaId: table.areaId, code: table.code, name: table.name, minSeats: table.minSeats, maxSeats: table.maxSeats, shape: table.shape, width: table.width, height: table.height, rotation: table.rotation, isPrivateRoom: table.isPrivateRoom, minSpend: table.minSpend === null ? null : Number(table.minSpend), sortOrder: table.sortOrder, isActive: table.isActive }
    : null;
  const nextSort = Math.max(0, ...(areas.find((a) => a.id === defaultAreaId)?.tables.map((t) => t.sortOrder) ?? [0])) + 1;
  const [form, setForm] = useState<TableForm>(original ?? { areaId: defaultAreaId, code: '', name: 'Bàn ', minSeats: 2, maxSeats: 4, shape: 'ROUND', width: 100, height: 100, rotation: 0, isPrivateRoom: false, minSpend: null, sortOrder: nextSort, isActive: true });
  const [qrToken, setQrToken] = useState(table?.qrToken ?? '');
  const [qrImg, setQrImg] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const set = <K extends keyof TableForm>(k: K, v: TableForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    let alive = true;
    if (qrToken) void renderQr(tableQrUrl(qrToken)).then((img) => alive && setQrImg(img));
    return () => {
      alive = false;
    };
  }, [qrToken]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: adminKeys.areas(branchId) });
    void qc.invalidateQueries({ queryKey: ['floor', branchId] });
  };

  const save = async () => {
    if (!form.name.trim() || !form.code.trim()) return toast.error('Nhập tên và mã bàn');
    if (form.maxSeats < form.minSeats) return toast.error('Sức chứa tối đa phải lớn hơn hoặc bằng tối thiểu');
    setBusy('save');
    try {
      if (table) {
        const p = diffPatch(original, form);
        if (Object.keys(p).length) await floorAdminApi.updateTable(branchId, table.id, p);
      } else {
        await floorAdminApi.createTable(branchId, { ...form, posX: 40, posY: 40 });
      }
      toast.success('Đã lưu bàn');
      refresh();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const rotate = async () => {
    if (!table) return;
    setBusy('qr');
    try {
      const t = await floorAdminApi.rotateQr(branchId, table.id);
      setQrToken(t.qrToken);
      toast.success('Đã đổi mã QR. Mã cũ không còn dùng được.');
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
      setConfirmRotate(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={table ? `Sửa ${table.name}` : 'Thêm bàn'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button className="ml-auto" loading={busy === 'save'} onClick={() => void save()}>
            Lưu
          </Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-[1fr_220px]">
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Tên bàn *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value, code: table ? f.code : codeFrom(e.target.value.replace(/^Bàn\s*/i, '')) }))} />
            <Input label="Mã bàn *" value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} />
            <Select label="Khu vực" value={form.areaId} onChange={(e) => set('areaId', e.target.value)}>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
            <Select label="Hình dạng" value={form.shape} onChange={(e) => set('shape', e.target.value as AdminTable['shape'])}>
              {(Object.keys(SHAPE_LABELS) as AdminTable['shape'][]).map((s) => (
                <option key={s} value={s}>
                  {SHAPE_LABELS[s]}
                </option>
              ))}
            </Select>
            <IntInput label="Số chỗ tối thiểu" value={form.minSeats} min={1} onChange={(v) => set('minSeats', Math.max(1, v ?? 1))} />
            <IntInput label="Số chỗ tối đa" value={form.maxSeats} min={1} onChange={(v) => set('maxSeats', Math.max(1, v ?? 1))} />
            <IntInput label="Rộng (px)" value={form.width} min={20} onChange={(v) => set('width', Math.max(20, v ?? 100))} />
            <IntInput label="Cao (px)" value={form.height} min={20} onChange={(v) => set('height', Math.max(20, v ?? 100))} />
            <IntInput label="Xoay (độ)" value={form.rotation} onChange={(v) => set('rotation', v ?? 0)} />
            <IntInput label="Thứ tự" value={form.sortOrder} onChange={(v) => set('sortOrder', v ?? 0)} />
            <MoneyInput label="Chi tiêu tối thiểu" value={form.minSpend} onChange={(v) => set('minSpend', v)} placeholder="Không yêu cầu" />
          </div>
          <Toggle checked={form.isPrivateRoom} onChange={(v) => set('isPrivateRoom', v)} label="Phòng riêng" />
          <Toggle checked={form.isActive} onChange={(v) => set('isActive', v)} label="Đang sử dụng" />
        </div>
        {table && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-ink-100 p-3 text-center">
            <span className="text-sm font-semibold">Mã QR gọi món</span>
            {qrImg ? <img src={qrImg} alt={`QR ${table.name}`} className="h-44 w-44" /> : <Loading label="" />}
            <span className="text-xs break-all text-ink-500">{tableQrUrl(qrToken).replace(/^https:\/\//, '')}</span>
            <Button size="sm" variant="outline" loading={busy === 'qr'} onClick={() => setConfirmRotate(true)}>
              <RotateCw className="h-4 w-4" /> Đổi mã QR
            </Button>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirmRotate}
        onClose={() => setConfirmRotate(false)}
        onConfirm={() => void rotate()}
        loading={busy === 'qr'}
        danger
        title="Đổi mã QR của bàn?"
        message="Mã QR đang dán trên bàn sẽ ngừng hoạt động. Bạn cần in và dán mã mới."
        confirmLabel="Đổi mã"
      />
    </Dialog>
  );
}

interface AreaForm {
  code: string;
  name: string;
  kind: AreaKind;
  floor: number | null;
  sortOrder: number;
  serviceChargeBps: number | null;
  minSpend: number | null;
  isActive: boolean;
  [k: string]: unknown;
}

function AreaDialog({ area, onClose, onCreated }: { area: AdminArea | null; onClose: () => void; onCreated: (id: string) => void }) {
  const branchId = useBranchId();
  const qc = useQueryClient();
  const original: AreaForm | null = area
    ? { code: area.code, name: area.name, kind: area.kind, floor: area.floor, sortOrder: area.sortOrder, serviceChargeBps: area.serviceChargeBps, minSpend: area.minSpend === null ? null : Number(area.minSpend), isActive: area.isActive }
    : null;
  const [form, setForm] = useState<AreaForm>(original ?? { code: '', name: '', kind: 'HALL', floor: 1, sortOrder: 0, serviceChargeBps: null, minSpend: null, isActive: true });
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof AreaForm>(k: K, v: AreaForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name.trim() || !form.code.trim()) return toast.error('Nhập tên và mã khu vực');
    setSaving(true);
    try {
      if (area) {
        const p = diffPatch(original, form);
        if (Object.keys(p).length) await floorAdminApi.updateArea(branchId, area.id, p);
      } else {
        const created = await floorAdminApi.createArea(branchId, form);
        onCreated(created.id);
      }
      toast.success('Đã lưu khu vực');
      void qc.invalidateQueries({ queryKey: adminKeys.areas(branchId) });
      void qc.invalidateQueries({ queryKey: ['floor', branchId] });
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={area ? `Sửa khu vực: ${area.name}` : 'Thêm khu vực'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button className="ml-auto" loading={saving} onClick={() => void save()}>
            Lưu
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Tên khu vực *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value, code: area ? f.code : codeFrom(e.target.value).slice(0, 20) }))} />
        <Input label="Mã *" value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} />
        <Select label="Loại" value={form.kind} onChange={(e) => set('kind', e.target.value as AreaKind)}>
          {(Object.keys(AREA_KIND_LABELS) as AreaKind[]).map((k) => (
            <option key={k} value={k}>
              {AREA_KIND_LABELS[k]}
            </option>
          ))}
        </Select>
        <IntInput label="Tầng" value={form.floor} onChange={(v) => set('floor', v)} />
        <BpsInput label="Phí phục vụ riêng" value={form.serviceChargeBps} onChange={(v) => set('serviceChargeBps', v)} placeholder="Theo cơ sở" />
        <MoneyInput label="Chi tiêu tối thiểu" value={form.minSpend} onChange={(v) => set('minSpend', v)} placeholder="Không yêu cầu" />
        <IntInput label="Thứ tự" value={form.sortOrder} onChange={(v) => set('sortOrder', v ?? 0)} />
        <Toggle checked={form.isActive} onChange={(v) => set('isActive', v)} label="Đang sử dụng" />
      </div>
    </Dialog>
  );
}
