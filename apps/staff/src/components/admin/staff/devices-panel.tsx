'use client';

import { useState } from 'react';
import { Ban, Check, Copy, Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { errorMessage } from '@/lib/api';
import { useAuth, useBranchId } from '@/lib/auth-store';
import { adminKeys, staffAdminApi, useAdminDevices, useAdminStations, type AdminDevice, type DeviceKind } from '@/lib/queries-admin';
import { dateTimeVi } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Badge, EmptyState, Input, Loading, Select } from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';
import { Card, Table } from '../form';

export const DEVICE_KIND_LABELS: Record<DeviceKind, string> = {
  POS: 'Máy POS / thu ngân',
  TABLET: 'Máy tính bảng phục vụ',
  KDS: 'Màn hình bếp (KDS)',
  PRINT_BRIDGE: 'Cầu in',
  CUSTOMER_DISPLAY: 'Màn hình khách',
};

export function DevicesPanel() {
  const branchId = useBranchId();
  const qc = useQueryClient();
  const branchName = useAuth((s) => s.me?.branches.find((b) => b.id === branchId)?.name ?? '');
  const devices = useAdminDevices(branchId);
  const stations = useAdminStations(branchId);
  const [registering, setRegistering] = useState(false);
  const [token, setToken] = useState<{ name: string; token: string } | null>(null);
  const [revoking, setRevoking] = useState<AdminDevice | null>(null);
  const [busy, setBusy] = useState(false);

  const revoke = async () => {
    if (!revoking) return;
    setBusy(true);
    try {
      await staffAdminApi.revokeDevice(revoking.id);
      toast.success(`Đã thu hồi thiết bị ${revoking.name}`);
      void qc.invalidateQueries({ queryKey: adminKeys.devices(branchId) });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
      setRevoking(null);
    }
  };

  if (devices.isLoading) return <Loading />;
  if (devices.isError) return <p className="text-red-700">{errorMessage(devices.error)}</p>;
  const list = devices.data ?? [];

  return (
    <Card
      title={`Thiết bị tại ${branchName} (${list.filter((d) => d.isActive).length} đang hoạt động)`}
      actions={
        <Button size="sm" onClick={() => setRegistering(true)}>
          <Plus className="h-4 w-4" /> Đăng ký thiết bị
        </Button>
      }
    >
      <p className="mb-2 text-xs text-ink-500">Thiết bị đã đăng ký dùng token để nhân viên đăng nhập bằng PIN. Thu hồi khi mất máy hoặc ngừng dùng. Đổi cơ sở ở thanh trên cùng để xem thiết bị cơ sở khác.</p>
      {list.length === 0 ? (
        <EmptyState title="Chưa có thiết bị nào" />
      ) : (
        <Table head={['Thiết bị', 'Loại', 'Trạm mặc định', 'Hoạt động gần nhất', 'Trạng thái', '']}>
          {list.map((d) => (
            <tr key={d.id} className="border-b border-ink-100 last:border-0">
              <td className="px-2 py-2 font-semibold">{d.name}</td>
              <td className="px-2 py-2">{DEVICE_KIND_LABELS[d.kind] ?? d.kind}</td>
              <td className="px-2 py-2">{stations.data?.find((s) => s.id === d.defaultStationId)?.name ?? '—'}</td>
              <td className="px-2 py-2 text-xs text-ink-500">{d.lastSeenAt ? dateTimeVi(d.lastSeenAt) : 'Chưa kết nối'}</td>
              <td className="px-2 py-2">{d.isActive ? <Badge tone="success">Đang hoạt động</Badge> : <Badge>Đã thu hồi</Badge>}</td>
              <td className="px-2 py-2 text-right">
                {d.isActive && (
                  <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setRevoking(d)}>
                    <Ban className="h-4 w-4" /> Thu hồi
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
      {registering && (
        <RegisterDialog
          onClose={() => setRegistering(false)}
          onRegistered={(name, t) => {
            setRegistering(false);
            setToken({ name, token: t });
            void qc.invalidateQueries({ queryKey: adminKeys.devices(branchId) });
          }}
        />
      )}
      {token && <TokenDialog name={token.name} token={token.token} onClose={() => setToken(null)} />}
      <ConfirmDialog
        open={!!revoking}
        onClose={() => setRevoking(null)}
        onConfirm={() => void revoke()}
        loading={busy}
        danger
        title="Thu hồi thiết bị?"
        message={`Thiết bị "${revoking?.name ?? ''}" sẽ không đăng nhập PIN được nữa. Muốn dùng lại phải đăng ký mới.`}
        confirmLabel="Thu hồi"
      />
    </Card>
  );
}

function RegisterDialog({ onClose, onRegistered }: { onClose: () => void; onRegistered: (name: string, token: string) => void }) {
  const branchId = useBranchId();
  const stations = useAdminStations(branchId);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<DeviceKind>('TABLET');
  const [stationId, setStationId] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!name.trim()) return toast.error('Nhập tên thiết bị');
    setSaving(true);
    try {
      const res = await staffAdminApi.registerDevice({ branchId, name: name.trim(), kind, ...(stationId ? { defaultStationId: stationId } : {}) });
      onRegistered(res.device.name, res.deviceToken);
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
      size="sm"
      title="Đăng ký thiết bị"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button className="ml-auto" loading={saving} onClick={() => void save()}>
            Đăng ký
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label="Tên thiết bị *" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tablet sảnh A" />
        <Select label="Loại thiết bị" value={kind} onChange={(e) => setKind(e.target.value as DeviceKind)}>
          {(Object.keys(DEVICE_KIND_LABELS) as DeviceKind[]).map((k) => (
            <option key={k} value={k}>
              {DEVICE_KIND_LABELS[k]}
            </option>
          ))}
        </Select>
        <Select label="Trạm mặc định (tùy chọn)" value={stationId} onChange={(e) => setStationId(e.target.value)}>
          <option value="">— Không —</option>
          {(stations.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>
    </Dialog>
  );
}

function TokenDialog({ name, token, onClose }: { name: string; token: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      toast.success('Đã sao chép token');
    } catch {
      toast.error('Không sao chép được, hãy chọn và sao chép thủ công');
    }
  };
  return (
    <Dialog open onClose={onClose} size="md" mode="center" title={`Token thiết bị: ${name}`} dismissible={false}>
      <div className="space-y-3">
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">Token chỉ hiển thị một lần. Hãy sao chép và nhập vào thiết bị ngay bây giờ.</p>
        <code className="block rounded-xl border border-ink-300 bg-ink-100/50 p-3 font-mono text-sm break-all select-all">{token}</code>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void copy()}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? 'Đã sao chép' : 'Sao chép'}
          </Button>
          <Button className="ml-auto" onClick={onClose}>
            Tôi đã lưu token
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
