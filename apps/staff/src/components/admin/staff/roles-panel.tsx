'use client';

import { Fragment, useMemo, useState } from 'react';
import { Plus, Save, Undo2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { ALL_PERMISSIONS, PERMISSION_GROUPS } from '@dalan/contracts';
import { errorMessage } from '@/lib/api';
import { adminKeys, staffAdminApi, useRoles, type AdminRole } from '@/lib/queries-admin';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Loading } from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';
import { Card, codeFrom } from '../form';

type PermSet = string[];

const has = (perms: PermSet, p: string) => perms.includes('*') || perms.includes(p) || perms.includes(`${p.split('.')[0]}.*`);

/** Bật/tắt một quyền; tự tách `nhóm.*` thành từng quyền khi bỏ một quyền trong nhóm. */
function togglePerm(perms: PermSet, p: string, on: boolean): PermSet {
  const resource = p.split('.')[0]!;
  const group = PERMISSION_GROUPS.find((g) => g.resource === resource);
  let next = [...perms];
  if (on) {
    if (!next.includes(p)) next.push(p);
    // Đủ cả nhóm thì gộp lại thành `nhóm.*`
    if (group && group.actions.every(([a]) => next.includes(`${resource}.${a}`) || `${resource}.${a}` === p)) {
      next = next.filter((x) => !x.startsWith(`${resource}.`));
      next.push(`${resource}.*`);
    }
  } else {
    if (next.includes(`${resource}.*`) && group) {
      next = next.filter((x) => x !== `${resource}.*`);
      for (const [a] of group.actions) if (`${resource}.${a}` !== p) next.push(`${resource}.${a}`);
    }
    next = next.filter((x) => x !== p);
  }
  return next.sort();
}

function toggleGroup(perms: PermSet, resource: string, on: boolean): PermSet {
  const next = perms.filter((x) => !x.startsWith(`${resource}.`));
  if (on) next.push(`${resource}.*`);
  return next.sort();
}

export function RolesPanel({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const roles = useRoles();
  const [draft, setDraft] = useState<Record<string, PermSet>>({});
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const list = useMemo(() => [...(roles.data ?? [])].sort((a, b) => Number(b.permissions.includes('*')) - Number(a.permissions.includes('*')) || a.name.localeCompare(b.name, 'vi')), [roles.data]);
  const permsOf = (r: AdminRole) => draft[r.id] ?? r.permissions;
  const changed = list.filter((r) => draft[r.id] && JSON.stringify([...draft[r.id]!].sort()) !== JSON.stringify([...r.permissions].sort()));

  const update = (r: AdminRole, fn: (p: PermSet) => PermSet) => setDraft((d) => ({ ...d, [r.id]: fn(d[r.id] ?? r.permissions) }));

  const save = async () => {
    setSaving(true);
    try {
      for (const r of changed) await staffAdminApi.updateRole(r.id, { permissions: draft[r.id]! });
      toast.success(`Đã lưu quyền cho ${changed.length} vai trò`);
      setDraft({});
      void qc.invalidateQueries({ queryKey: adminKeys.roles });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (roles.isLoading) return <Loading />;
  if (roles.isError) return <p className="text-red-700">{errorMessage(roles.error)}</p>;

  return (
    <Card
      title="Ma trận phân quyền"
      actions={
        canManage && (
          <>
            {changed.length > 0 && <span className="text-sm font-semibold text-amber-700">{changed.length} vai trò có thay đổi</span>}
            <Button size="sm" variant="ghost" disabled={!changed.length} onClick={() => setDraft({})}>
              <Undo2 className="h-4 w-4" /> Hoàn tác
            </Button>
            <Button size="sm" disabled={!changed.length} loading={saving} onClick={() => void save()}>
              <Save className="h-4 w-4" /> Lưu quyền
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Vai trò mới
            </Button>
          </>
        )
      }
    >
      <p className="mb-2 text-xs text-ink-500">Tích vào ô để cấp quyền. Hàng in đậm là toàn bộ nhóm. Vai trò có &quot;Toàn quyền&quot; không chỉnh từng ô.</p>
      <div className="scrollbar-thin max-h-[70vh] overflow-auto rounded-xl border border-ink-100">
        <table className="border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-white">
            <tr>
              <th className="sticky left-0 z-20 min-w-[240px] border-b border-ink-100 bg-white px-2 py-2 text-left">Quyền</th>
              {list.map((r) => (
                <th key={r.id} className={cn('min-w-[88px] border-b border-l border-ink-100 px-1 py-2 text-center text-xs font-semibold', draft[r.id] && 'bg-amber-50')}>
                  <span className="block">{r.name}</span>
                  <span className="block font-normal text-ink-500">{r.code}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="bg-brand-50">
              <td className="sticky left-0 bg-brand-50 px-2 py-1.5 font-bold">Toàn quyền (*)</td>
              {list.map((r) => (
                <td key={r.id} className="border-l border-ink-100 text-center">
                  <input type="checkbox" className="h-5 w-5" disabled={!canManage} checked={permsOf(r).includes('*')} onChange={(e) => update(r, () => (e.target.checked ? ['*'] : []))} aria-label={`Toàn quyền cho ${r.name}`} />
                </td>
              ))}
            </tr>
            {PERMISSION_GROUPS.map((g) => (
              <Fragment key={g.resource}>
                <tr className="bg-ink-100/60">
                  <td className="sticky left-0 bg-[#f3eff0] px-2 py-1.5 font-bold">
                    {g.name} <span className="text-xs font-normal text-ink-500">({g.resource}.*)</span>
                  </td>
                  {list.map((r) => {
                    const p = permsOf(r);
                    const all = p.includes('*');
                    return (
                      <td key={r.id} className="border-l border-ink-100 text-center">
                        <input type="checkbox" className="h-5 w-5" disabled={!canManage || all} checked={all || p.includes(`${g.resource}.*`)} onChange={(e) => update(r, (cur) => toggleGroup(cur, g.resource, e.target.checked))} aria-label={`${g.name} – ${r.name}`} />
                      </td>
                    );
                  })}
                </tr>
                {g.actions.map(([a, label]) => {
                  const key = `${g.resource}.${a}`;
                  return (
                    <tr key={key} className="border-b border-ink-100/60 hover:bg-gold-100/40">
                      <td className="sticky left-0 bg-white px-2 py-1 pl-5">
                        <span className="block">{label}</span>
                        <span className="block font-mono text-[11px] text-ink-500">{key}</span>
                      </td>
                      {list.map((r) => {
                        const p = permsOf(r);
                        const locked = p.includes('*') || p.includes(`${g.resource}.*`);
                        return (
                          <td key={r.id} className="border-l border-ink-100 text-center">
                            <input
                              type="checkbox"
                              className={cn('h-5 w-5', locked && 'opacity-60')}
                              disabled={!canManage || p.includes('*')}
                              checked={has(p, key)}
                              onChange={(e) => update(r, (cur) => togglePerm(cur, key, e.target.checked))}
                              aria-label={`${label} – ${r.name}`}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-500">Tổng cộng {ALL_PERMISSIONS.length} quyền chi tiết trong {PERMISSION_GROUPS.length} nhóm.</p>
      {creating && <RoleDialog onClose={() => setCreating(false)} />}
    </Card>
  );
}

function RoleDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!name.trim() || !code.trim()) return toast.error('Nhập tên và mã vai trò');
    setSaving(true);
    try {
      await staffAdminApi.createRole({ code: code.trim(), name: name.trim(), permissions: [] });
      toast.success('Đã tạo vai trò. Tích quyền trong ma trận rồi bấm Lưu quyền.');
      void qc.invalidateQueries({ queryKey: adminKeys.roles });
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
      size="sm"
      title="Vai trò mới"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button className="ml-auto" loading={saving} onClick={() => void save()}>
            Tạo
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input
          label="Tên vai trò *"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setCode(codeFrom(e.target.value).replace(/-/g, '_').slice(0, 30));
          }}
          placeholder="Trưởng ca"
        />
        <Input label="Mã *" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
      </div>
    </Dialog>
  );
}
