'use client';

import { useMemo, useState } from 'react';
import { Pencil, Plus, Trash } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { matchesSearch } from '@dalan/domain';
import { errorMessage } from '@/lib/api';
import { menuAdminApi, useModifierGroups, type AdminModifierGroup, type AdminModifierOption, type ModifierGroupBody } from '@/lib/queries-admin';
import { money } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Badge, EmptyState, Input, Loading } from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';
import { Card, IntInput, MoneyInput, SearchBox, Toggle, codeFrom } from '../form';

export function ModifiersPanel({ canManage }: { canManage: boolean }) {
  const groups = useModifierGroups();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ group: AdminModifierGroup | null } | null>(null);
  const list = useMemo(() => (groups.data ?? []).filter((g) => matchesSearch(`${g.name} ${g.code} ${g.options.map((o) => o.name).join(' ')}`, search)), [groups.data, search]);

  if (groups.isLoading) return <Loading />;
  if (groups.isError) return <p className="text-red-700">{errorMessage(groups.error)}</p>;

  return (
    <Card
      title={`Nhóm tùy chọn (${list.length})`}
      actions={
        canManage && (
          <Button size="sm" onClick={() => setEditing({ group: null })}>
            <Plus className="h-4 w-4" /> Thêm nhóm
          </Button>
        )
      }
    >
      <div className="mb-3 max-w-md">
        <SearchBox value={search} onChange={setSearch} placeholder="Tìm nhóm hoặc tùy chọn" />
      </div>
      {list.length === 0 ? (
        <EmptyState title="Chưa có nhóm tùy chọn" />
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {list.map((g) => (
            <li key={g.id} className="rounded-xl border border-ink-100 p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                    {g.name}
                    {g.isRequired ? <Badge tone="warning">Bắt buộc</Badge> : <Badge>Không bắt buộc</Badge>}
                  </p>
                  <p className="text-xs text-ink-500">
                    {g.code} · chọn {g.minSelect}–{g.maxSelect} · dùng cho {g._count?.items ?? 0} món
                  </p>
                </div>
                {canManage && (
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ group: g })} aria-label="Sửa nhóm">
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {g.options.map((o) => (
                  <Badge key={o.code} tone={o.isActive ? 'neutral' : 'danger'}>
                    {o.name}
                    {Number(o.priceDelta) !== 0 ? ` ${Number(o.priceDelta) > 0 ? '+' : ''}${money(o.priceDelta)}` : ''}
                  </Badge>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && <GroupDialog group={editing.group} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function GroupDialog({ group, onClose }: { group: AdminModifierGroup | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<ModifierGroupBody>(
    group
      ? {
          code: group.code,
          name: group.name,
          nameEn: group.nameEn,
          minSelect: group.minSelect,
          maxSelect: group.maxSelect,
          isRequired: group.isRequired,
          sortOrder: group.sortOrder,
          options: group.options.map((o) => ({ code: o.code, name: o.name, nameEn: o.nameEn, priceDelta: Number(o.priceDelta), sortOrder: o.sortOrder, isDefault: o.isDefault, isActive: o.isActive })),
        }
      : { code: '', name: '', nameEn: null, minSelect: 0, maxSelect: 1, isRequired: false, sortOrder: 0, options: [] },
  );
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof ModifierGroupBody>(k: K, v: ModifierGroupBody[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setOpt = (i: number, p: Partial<AdminModifierOption>) => set('options', form.options.map((o, j) => (j === i ? { ...o, ...p } : o)));

  const save = async () => {
    if (!form.name.trim() || !form.code.trim()) return toast.error('Nhập tên và mã nhóm');
    if (form.maxSelect < form.minSelect) return toast.error('Số chọn tối đa phải lớn hơn hoặc bằng tối thiểu');
    if (form.options.some((o) => !o.name.trim() || !o.code.trim())) return toast.error('Mỗi tùy chọn cần tên và mã');
    if (new Set(form.options.map((o) => o.code)).size !== form.options.length) return toast.error('Mã tùy chọn bị trùng');
    setSaving(true);
    try {
      const body = { ...form, options: form.options.map((o, i) => ({ ...o, sortOrder: i })) };
      if (group) await menuAdminApi.updateGroup(group.id, body);
      else await menuAdminApi.createGroup(body);
      toast.success('Đã lưu nhóm tùy chọn');
      void qc.invalidateQueries({ queryKey: ['admin'] });
      void qc.invalidateQueries({ queryKey: ['menu'] });
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
      size="lg"
      title={group ? `Sửa nhóm: ${group.name}` : 'Thêm nhóm tùy chọn'}
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
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="Tên nhóm *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value, code: group ? f.code : codeFrom(e.target.value) }))} placeholder="Cách chế biến" />
          <Input label="Tên tiếng Anh" value={form.nameEn ?? ''} onChange={(e) => set('nameEn', e.target.value || null)} />
          <Input label="Mã *" value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} />
          <IntInput label="Chọn tối thiểu" value={form.minSelect} min={0} onChange={(v) => set('minSelect', v ?? 0)} />
          <IntInput label="Chọn tối đa" value={form.maxSelect} min={0} onChange={(v) => set('maxSelect', v ?? 1)} />
          <IntInput label="Thứ tự" value={form.sortOrder} onChange={(v) => set('sortOrder', v ?? 0)} />
        </div>
        <Toggle checked={form.isRequired} onChange={(v) => set('isRequired', v)} label="Bắt buộc chọn" />
        <div className="space-y-2">
          <span className="block text-sm font-semibold text-ink-700">Các tùy chọn</span>
          {form.options.map((o, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 rounded-xl border border-ink-100 p-2 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
              <Input label="Tên" value={o.name} onChange={(e) => setOpt(i, { name: e.target.value, code: o.code || codeFrom(e.target.value) })} placeholder="Rang me" />
              <Input label="Tên tiếng Anh" value={o.nameEn ?? ''} onChange={(e) => setOpt(i, { nameEn: e.target.value || null })} />
              <Input label="Mã" value={o.code} onChange={(e) => setOpt(i, { code: e.target.value.toUpperCase() })} />
              <MoneyInput label="Giá cộng thêm" value={o.priceDelta} allowNegative onChange={(v) => setOpt(i, { priceDelta: v ?? 0 })} />
              <div className="col-span-2 flex items-end gap-2 sm:col-span-1">
                <label className="flex min-h-[48px] items-center gap-1 text-sm">
                  <input type="checkbox" checked={o.isDefault} onChange={(e) => setOpt(i, { isDefault: e.target.checked })} /> Mặc định
                </label>
                <label className="flex min-h-[48px] items-center gap-1 text-sm">
                  <input type="checkbox" checked={o.isActive} onChange={(e) => setOpt(i, { isActive: e.target.checked })} /> Bán
                </label>
                <button type="button" onClick={() => set('options', form.options.filter((_, j) => j !== i))} className="flex h-11 w-11 items-center justify-center rounded-full text-red-600 hover:bg-red-50" aria-label="Xóa tùy chọn">
                  <Trash className="h-5 w-5" />
                </button>
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => set('options', [...form.options, { code: '', name: '', nameEn: null, priceDelta: 0, sortOrder: form.options.length, isDefault: false, isActive: true }])}>
            <Plus className="h-4 w-4" /> Thêm tùy chọn
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
