'use client';

import { useState } from 'react';
import { Pencil, Plus, Printer as PrinterIcon } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { errorMessage } from '@/lib/api';
import { useBranchId, useCan } from '@/lib/auth-store';
import { adminKeys, settingsAdminApi, useAdminPrinters, useAdminStations, type AdminPrinter, type AdminStation } from '@/lib/queries-admin';
import { dateTimeVi } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Badge, EmptyState, Input, Loading, Select } from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';
import { Card, IntInput, Table, Toggle, diffPatch } from '../form';

const MODE_LABELS: Record<AdminStation['mode'], string> = { KDS: 'Chỉ màn hình bếp', PRINTER: 'Chỉ in phiếu', BOTH: 'Màn hình và in phiếu' };
const KIND_LABELS: Record<AdminPrinter['kind'], string> = { RECEIPT: 'In bill', KITCHEN: 'In bếp', LABEL: 'In nhãn' };
const CONN_LABELS: Record<AdminPrinter['connection'], string> = { NETWORK: 'Mạng LAN', USB: 'USB', BLUETOOTH: 'Bluetooth' };

/** Máy in coi là trực tuyến nếu cầu in báo trong 5 phút gần nhất. */
function printerOnline(p: AdminPrinter): boolean {
  return !!p.lastSeenAt && Date.now() - new Date(p.lastSeenAt).getTime() < 5 * 60_000;
}

export function StationsPrintersPanel() {
  const branchId = useBranchId();
  const canBranch = useCan('branch.update');
  const canPrint = useCan('print.manage') || canBranch;
  const stations = useAdminStations(branchId);
  const printers = useAdminPrinters(branchId);
  const [stationDialog, setStationDialog] = useState<{ station: AdminStation | null } | null>(null);
  const [printerDialog, setPrinterDialog] = useState<{ printer: AdminPrinter | null } | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  const test = async (p: AdminPrinter) => {
    setTesting(p.id);
    try {
      await settingsAdminApi.testPrinter(branchId, p.id);
      toast.success(`Đã gửi lệnh in thử tới ${p.name}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="space-y-3">
      <Card
        title="Trạm bếp / bar"
        actions={
          canBranch && (
            <Button size="sm" onClick={() => setStationDialog({ station: null })}>
              <Plus className="h-4 w-4" /> Thêm trạm
            </Button>
          )
        }
      >
        {stations.isLoading ? (
          <Loading />
        ) : (stations.data ?? []).length === 0 ? (
          <EmptyState title="Chưa có trạm" />
        ) : (
          <Table head={['Trạm', 'Chế độ', 'Máy in', 'Trạng thái', '']}>
            {(stations.data ?? []).map((s) => (
              <tr key={s.id} className="border-b border-ink-100 last:border-0">
                <td className="px-2 py-2">
                  <span className="flex items-center gap-2 font-semibold">
                    {s.color && <span className="h-3 w-3 rounded-full" style={{ background: s.color }} />}
                    {s.name}
                  </span>
                  <span className="block font-mono text-xs text-ink-500">{s.code}</span>
                </td>
                <td className="px-2 py-2">{MODE_LABELS[s.mode]}</td>
                <td className="px-2 py-2">{s.printer?.name ?? '—'}</td>
                <td className="px-2 py-2">{s.isActive ? <Badge tone="success">Đang dùng</Badge> : <Badge>Tắt</Badge>}</td>
                <td className="px-2 py-2 text-right">
                  {canBranch && (
                    <Button size="sm" variant="ghost" onClick={() => setStationDialog({ station: s })} aria-label={`Sửa ${s.name}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card
        title="Máy in"
        actions={
          canPrint && (
            <Button size="sm" onClick={() => setPrinterDialog({ printer: null })}>
              <Plus className="h-4 w-4" /> Thêm máy in
            </Button>
          )
        }
      >
        <p className="mb-2 text-xs text-ink-500">Máy in nhận lệnh qua cầu in (print-bridge) chạy tại cơ sở. Trạng thái trực tuyến dựa trên lần cuối cầu in báo về.</p>
        {printers.isLoading ? (
          <Loading />
        ) : printers.isError ? (
          <p className="text-red-700">{errorMessage(printers.error)}</p>
        ) : (printers.data ?? []).length === 0 ? (
          <EmptyState title="Chưa có máy in" />
        ) : (
          <Table head={['Máy in', 'Loại', 'Kết nối', 'Khổ giấy', 'Trạng thái', '']}>
            {(printers.data ?? []).map((p) => (
              <tr key={p.id} className="border-b border-ink-100 last:border-0">
                <td className="px-2 py-2">
                  <span className="block font-semibold">{p.name}</span>
                  <span className="block font-mono text-xs text-ink-500">{p.code}</span>
                </td>
                <td className="px-2 py-2">{KIND_LABELS[p.kind]}</td>
                <td className="px-2 py-2">
                  {CONN_LABELS[p.connection]}
                  {p.address ? <span className="block font-mono text-xs text-ink-500">{p.address}</span> : null}
                </td>
                <td className="px-2 py-2">{p.paperWidthMm} mm</td>
                <td className="px-2 py-2">
                  <span className="flex flex-wrap gap-1">
                    {!p.isActive ? <Badge>Tắt</Badge> : printerOnline(p) ? <Badge tone="success">Trực tuyến</Badge> : <Badge tone="warning">Ngoại tuyến</Badge>}
                  </span>
                  <span className="block text-[11px] text-ink-500">{p.lastSeenAt ? `Lần cuối: ${dateTimeVi(p.lastSeenAt)}` : 'Chưa kết nối'}</span>
                </td>
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  {canPrint && (
                    <>
                      <Button size="sm" variant="outline" loading={testing === p.id} onClick={() => void test(p)}>
                        <PrinterIcon className="h-4 w-4" /> In thử
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setPrinterDialog({ printer: p })} aria-label={`Sửa ${p.name}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {stationDialog && <StationDialog station={stationDialog.station} printers={printers.data ?? []} onClose={() => setStationDialog(null)} />}
      {printerDialog && <PrinterDialog printer={printerDialog.printer} onClose={() => setPrinterDialog(null)} />}
    </div>
  );
}

function DialogFooter({ onClose, onSave, saving }: { onClose: () => void; onSave: () => void; saving: boolean }) {
  return (
    <>
      <Button variant="outline" onClick={onClose}>
        Hủy
      </Button>
      <Button className="ml-auto" loading={saving} onClick={onSave}>
        Lưu
      </Button>
    </>
  );
}

interface StationForm {
  code: string;
  name: string;
  mode: AdminStation['mode'];
  printerId: string | null;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
  [k: string]: unknown;
}

function StationDialog({ station, printers, onClose }: { station: AdminStation | null; printers: AdminPrinter[]; onClose: () => void }) {
  const branchId = useBranchId();
  const qc = useQueryClient();
  const original: StationForm | null = station ? { code: station.code, name: station.name, mode: station.mode, printerId: station.printerId, color: station.color, sortOrder: station.sortOrder, isActive: station.isActive } : null;
  const [form, setForm] = useState<StationForm>(original ?? { code: '', name: '', mode: 'BOTH', printerId: null, color: null, sortOrder: 0, isActive: true });
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof StationForm>(k: K, v: StationForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) return toast.error('Nhập mã và tên trạm');
    setSaving(true);
    try {
      if (station) {
        const p = diffPatch(original, form);
        if (Object.keys(p).length) await settingsAdminApi.updateStation(branchId, station.id, p);
      } else await settingsAdminApi.createStation(branchId, form);
      toast.success('Đã lưu trạm');
      void qc.invalidateQueries({ queryKey: adminKeys.stations(branchId) });
      void qc.invalidateQueries({ queryKey: ['stations', branchId] });
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open onClose={onClose} title={station ? `Sửa trạm: ${station.name}` : 'Thêm trạm'} footer={<DialogFooter onClose={onClose} onSave={() => void save()} saving={saving} />}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Tên trạm *" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Bếp nóng" />
        <Input label="Mã *" value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="HOT" disabled={!!station} hint={station ? 'Mã trạm gắn với món, không đổi.' : undefined} />
        <Select label="Chế độ" value={form.mode} onChange={(e) => set('mode', e.target.value as AdminStation['mode'])}>
          {(Object.keys(MODE_LABELS) as AdminStation['mode'][]).map((m) => (
            <option key={m} value={m}>
              {MODE_LABELS[m]}
            </option>
          ))}
        </Select>
        <Select label="Máy in phiếu" value={form.printerId ?? ''} onChange={(e) => set('printerId', e.target.value || null)}>
          <option value="">— Không —</option>
          {printers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-ink-700">Màu nhận diện</span>
          <span className="flex items-center gap-2">
            <input type="color" className="h-12 w-16 rounded-lg border border-ink-300" value={form.color ?? '#7f2233'} onChange={(e) => set('color', e.target.value)} />
            {form.color && (
              <Button size="sm" variant="ghost" onClick={() => set('color', null)}>
                Bỏ màu
              </Button>
            )}
          </span>
        </label>
        <IntInput label="Thứ tự" value={form.sortOrder} onChange={(v) => set('sortOrder', v ?? 0)} />
        <Toggle checked={form.isActive} onChange={(v) => set('isActive', v)} label="Đang dùng" />
      </div>
    </Dialog>
  );
}

interface PrinterForm {
  code: string;
  name: string;
  kind: AdminPrinter['kind'];
  connection: AdminPrinter['connection'];
  address: string | null;
  paperWidthMm: 58 | 80;
  isActive: boolean;
  [k: string]: unknown;
}

function PrinterDialog({ printer, onClose }: { printer: AdminPrinter | null; onClose: () => void }) {
  const branchId = useBranchId();
  const qc = useQueryClient();
  const original: PrinterForm | null = printer ? { code: printer.code, name: printer.name, kind: printer.kind, connection: printer.connection, address: printer.address, paperWidthMm: printer.paperWidthMm, isActive: printer.isActive } : null;
  const [form, setForm] = useState<PrinterForm>(original ?? { code: '', name: '', kind: 'KITCHEN', connection: 'NETWORK', address: null, paperWidthMm: 80, isActive: true });
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof PrinterForm>(k: K, v: PrinterForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) return toast.error('Nhập mã và tên máy in');
    setSaving(true);
    try {
      if (printer) {
        const p = diffPatch(original, form);
        if (Object.keys(p).length) await settingsAdminApi.updatePrinter(branchId, printer.id, p);
      } else await settingsAdminApi.createPrinter(branchId, form);
      toast.success('Đã lưu máy in');
      void qc.invalidateQueries({ queryKey: adminKeys.printers(branchId) });
      void qc.invalidateQueries({ queryKey: adminKeys.stations(branchId) });
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open onClose={onClose} title={printer ? `Sửa máy in: ${printer.name}` : 'Thêm máy in'} footer={<DialogFooter onClose={onClose} onSave={() => void save()} saving={saving} />}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Tên máy in *" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Máy in bếp nóng" />
        <Input label="Mã *" value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="KITCHEN-1" />
        <Select label="Loại" value={form.kind} onChange={(e) => set('kind', e.target.value as AdminPrinter['kind'])}>
          {(Object.keys(KIND_LABELS) as AdminPrinter['kind'][]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </Select>
        <Select label="Kết nối" value={form.connection} onChange={(e) => set('connection', e.target.value as AdminPrinter['connection'])}>
          {(Object.keys(CONN_LABELS) as AdminPrinter['connection'][]).map((k) => (
            <option key={k} value={k}>
              {CONN_LABELS[k]}
            </option>
          ))}
        </Select>
        <Input label="Địa chỉ (IP hoặc cổng)" value={form.address ?? ''} onChange={(e) => set('address', e.target.value || null)} placeholder="192.168.1.201" />
        <Select label="Khổ giấy" value={String(form.paperWidthMm)} onChange={(e) => set('paperWidthMm', Number(e.target.value) as 58 | 80)}>
          <option value="80">80 mm</option>
          <option value="58">58 mm</option>
        </Select>
        <Toggle checked={form.isActive} onChange={(v) => set('isActive', v)} label="Đang dùng" />
      </div>
    </Dialog>
  );
}
