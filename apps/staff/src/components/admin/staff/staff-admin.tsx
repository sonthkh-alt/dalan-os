'use client';

import { useMemo, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { matchesSearch } from '@dalan/domain';
import { errorMessage } from '@/lib/api';
import { useAuth, useCan } from '@/lib/auth-store';
import { adminKeys, staffAdminApi, useAdminStaff, useRoles, type AdminStaff } from '@/lib/queries-admin';
import { dateTimeVi } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Badge, EmptyState, Input, Loading, Segmented, Select } from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';
import { Card, SearchBox, Table, Toggle } from '../form';
import { DevicesPanel } from './devices-panel';
import { RolesPanel } from './roles-panel';

type Tab = 'staff' | 'roles' | 'devices';

export function StaffAdmin() {
  const canRead = useCan('staff.read');
  const canManage = useCan('staff.manage');
  const canDevice = useCan('staff.device');
  const tabs = [
    ...(canRead || canManage ? [{ value: 'staff' as Tab, label: 'Nhân viên' }, { value: 'roles' as Tab, label: 'Vai trò & quyền' }] : []),
    ...(canDevice || canManage ? [{ value: 'devices' as Tab, label: 'Thiết bị' }] : []),
  ];
  const [tab, setTab] = useState<Tab>(tabs[0]?.value ?? 'staff');
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold text-ink-900">Nhân sự</h1>
        {tabs.length > 1 && <Segmented className="ml-auto" value={tab} onChange={setTab} options={tabs} />}
      </div>
      {tab === 'staff' && <StaffPanel canManage={canManage} />}
      {tab === 'roles' && <RolesPanel canManage={canManage} />}
      {tab === 'devices' && <DevicesPanel />}
    </div>
  );
}

export function isLocked(s: AdminStaff): boolean {
  return !!s.lockedUntil && new Date(s.lockedUntil).getTime() > Date.now();
}

function StaffPanel({ canManage }: { canManage: boolean }) {
  const staff = useAdminStaff();
  const roles = useRoles();
  const branches = useAuth((s) => s.me?.branches ?? []);
  const [search, setSearch] = useState('');
  const [roleId, setRoleId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [editing, setEditing] = useState<{ staff: AdminStaff | null } | null>(null);

  const list = useMemo(
    () =>
      (staff.data ?? []).filter(
        (s) => (!roleId || s.role.id === roleId) && (!branchId || s.branches.some((b) => b.branchId === branchId)) && matchesSearch(`${s.fullName} ${s.code} ${s.phone ?? ''} ${s.email ?? ''}`, search),
      ),
    [staff.data, roleId, branchId, search],
  );

  if (staff.isLoading) return <Loading />;
  if (staff.isError) return <p className="text-red-700">{errorMessage(staff.error)}</p>;

  return (
    <Card
      title={`Nhân viên (${list.length})`}
      actions={
        canManage && (
          <Button size="sm" onClick={() => setEditing({ staff: null })}>
            <Plus className="h-4 w-4" /> Thêm nhân viên
          </Button>
        )
      }
    >
      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        <SearchBox value={search} onChange={setSearch} placeholder="Tìm tên, mã, số điện thoại" />
        <Select value={roleId} onChange={(e) => setRoleId(e.target.value)} className="min-h-[44px]" aria-label="Lọc vai trò">
          <option value="">Mọi vai trò</option>
          {(roles.data ?? []).map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
        <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="min-h-[44px]" aria-label="Lọc cơ sở">
          <option value="">Mọi cơ sở</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
      </div>
      {list.length === 0 ? (
        <EmptyState title="Không có nhân viên phù hợp" />
      ) : (
        <Table head={['Nhân viên', 'Vai trò', 'Cơ sở', 'Trạng thái', '']}>
          {list.map((s) => (
            <tr key={s.id} className="border-b border-ink-100 last:border-0">
              <td className="px-2 py-2">
                <span className="block font-semibold">{s.fullName}</span>
                <span className="block text-xs text-ink-500">
                  {s.code}
                  {s.phone ? ` · ${s.phone}` : ''}
                </span>
              </td>
              <td className="px-2 py-2">{s.role.name}</td>
              <td className="px-2 py-2 text-xs">{s.branches.map((b) => branches.find((x) => x.id === b.branchId)?.code ?? '?').join(', ')}</td>
              <td className="px-2 py-2">
                <span className="flex flex-wrap gap-1">
                  {s.isActive ? <Badge tone="success">Đang làm</Badge> : <Badge>Đã khóa tài khoản</Badge>}
                  {isLocked(s) && <Badge tone="danger">Khóa PIN đến {dateTimeVi(s.lockedUntil!)}</Badge>}
                </span>
              </td>
              <td className="px-2 py-2 text-right">
                {canManage && (
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ staff: s })} aria-label={`Sửa ${s.fullName}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
      {editing && <StaffDialog staff={editing.staff} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function StaffDialog({ staff, onClose }: { staff: AdminStaff | null; onClose: () => void }) {
  const qc = useQueryClient();
  const roles = useRoles();
  const branches = useAuth((s) => s.me?.branches ?? []);
  const [code, setCode] = useState(staff?.code ?? '');
  const [fullName, setFullName] = useState(staff?.fullName ?? '');
  const [phone, setPhone] = useState(staff?.phone ?? '');
  const [email, setEmail] = useState(staff?.email ?? '');
  const [roleId, setRoleId] = useState(staff?.role.id ?? '');
  const defaultFirst = (staff?.branches ?? []).slice().sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  const [branchIds, setBranchIds] = useState<string[]>(staff ? defaultFirst.map((b) => b.branchId) : branches[0] ? [branches[0].id] : []);
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [isActive, setActive] = useState(staff?.isActive ?? true);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!code.trim() || !fullName.trim()) return toast.error('Nhập mã và họ tên');
    if (!roleId) return toast.error('Chọn vai trò');
    if (branchIds.length === 0) return toast.error('Chọn ít nhất một cơ sở');
    if (pin && !/^\d{4,6}$/.test(pin)) return toast.error('PIN gồm 4 đến 6 chữ số');
    if (password && password.length < 8) return toast.error('Mật khẩu tối thiểu 8 ký tự');
    if (email && !/^\S+@\S+\.\S+$/.test(email)) return toast.error('Email không hợp lệ');
    setSaving(true);
    try {
      if (staff) {
        const body: Record<string, unknown> = {};
        if (code.trim().toUpperCase() !== staff.code) body.code = code.trim();
        if (fullName.trim() !== staff.fullName) body.fullName = fullName.trim();
        if ((phone || null) !== staff.phone) body.phone = phone || null;
        if ((email || null) !== staff.email) body.email = email || null;
        if (roleId !== staff.role.id) body.roleId = roleId;
        if (JSON.stringify(branchIds) !== JSON.stringify(defaultFirst.map((b) => b.branchId))) body.branchIds = branchIds;
        if (pin) body.pin = pin;
        if (password) body.password = password;
        if (isActive !== staff.isActive) body.isActive = isActive;
        if (Object.keys(body).length === 0) {
          toast.info('Không có thay đổi');
          setSaving(false);
          return;
        }
        await staffAdminApi.updateStaff(staff.id, body);
      } else {
        await staffAdminApi.createStaff({ code: code.trim(), fullName: fullName.trim(), phone: phone || null, email: email || null, roleId, branchIds, ...(pin ? { pin } : {}), ...(password ? { password } : {}) });
      }
      toast.success('Đã lưu nhân viên');
      void qc.invalidateQueries({ queryKey: adminKeys.staff });
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleBranch = (id: string, on: boolean) => setBranchIds((cur) => (on ? [...cur, id] : cur.filter((x) => x !== id)));

  return (
    <Dialog
      open
      onClose={onClose}
      title={staff ? `Sửa nhân viên: ${staff.fullName}` : 'Thêm nhân viên'}
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
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Họ tên *" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <Input label="Mã nhân viên *" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} hint="Dùng để đăng nhập bằng mật khẩu" />
          <Input label="Số điện thoại" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
          <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
          <Select label="Vai trò *" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            <option value="">— Chọn vai trò —</option>
            {(roles.data ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <span className="mb-1 block text-sm font-semibold text-ink-700">Cơ sở làm việc * (cơ sở chọn đầu tiên là mặc định)</span>
          <div className="flex flex-wrap gap-3">
            {branches.map((b) => (
              <label key={b.id} className="flex min-h-[44px] items-center gap-2">
                <input type="checkbox" className="h-5 w-5" checked={branchIds.includes(b.id)} onChange={(e) => toggleBranch(b.id, e.target.checked)} />
                {b.name}
                {branchIds[0] === b.id && <Badge tone="brand">Mặc định</Badge>}
              </label>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label={staff ? 'Đặt PIN mới' : 'Mã PIN (4–6 số)'}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            type="password"
            autoComplete="new-password"
            placeholder={staff ? 'Để trống nếu giữ nguyên' : ''}
            hint={staff && isLocked(staff) ? 'Tài khoản đang bị khóa PIN: đặt PIN mới sẽ mở khóa.' : 'Dùng để đăng nhập nhanh trên thiết bị chung.'}
          />
          <Input
            label={staff ? 'Đặt mật khẩu mới' : 'Mật khẩu (cho quản lý)'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="new-password"
            placeholder={staff ? 'Để trống nếu giữ nguyên' : 'Tối thiểu 8 ký tự'}
          />
        </div>
        {staff && <Toggle checked={isActive} onChange={setActive} label="Cho phép đăng nhập" hint="Tắt để khóa tài khoản (nhân viên nghỉ việc)." />}
      </div>
    </Dialog>
  );
}
