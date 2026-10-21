'use client';

import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { errorMessage } from '@/lib/api';
import { useAuth, useBranchId } from '@/lib/auth-store';
import { menuAdminApi, useAdminMenus, useAdminStations, type AdminCategory, type AdminMenu, type MenuKind, type Schedule } from '@/lib/queries-admin';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Badge, EmptyState, Input, Loading, Select } from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';
import { Card, IntInput, ScheduleEditor, Toggle, codeFrom, diffPatch, scheduleText } from '../form';
import { ImageUpload } from '../image-upload';

export const MENU_KIND_LABELS: Record<MenuKind, string> = {
  ALACARTE: 'Chọn món',
  BREAKFAST: 'Ăn sáng',
  LUNCH: 'Cơm trưa / văn phòng',
  SET: 'Định suất',
  BANQUET: 'Tiệc',
  DRINKS: 'Đồ uống',
  VEGETARIAN: 'Chay',
  OTHER: 'Khác',
};

export function MenusPanel({ canManage }: { canManage: boolean }) {
  const menus = useAdminMenus();
  const branches = useAuth((s) => s.me?.branches ?? []);
  const [menuDialog, setMenuDialog] = useState<{ menu: AdminMenu | null } | null>(null);
  const [catDialog, setCatDialog] = useState<{ category: AdminCategory | null; menuId: string } | null>(null);

  if (menus.isLoading) return <Loading />;
  if (menus.isError) return <p className="text-red-700">{errorMessage(menus.error)}</p>;
  const list = menus.data ?? [];

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setMenuDialog({ menu: null })}>
            <Plus className="h-4 w-4" /> Thêm thực đơn
          </Button>
        </div>
      )}
      {list.length === 0 && <EmptyState title="Chưa có thực đơn" />}
      {list.map((m) => (
        <Card
          key={m.id}
          title={
            <span className="flex flex-wrap items-center gap-2">
              {m.name}
              <Badge tone="info">{MENU_KIND_LABELS[m.kind]}</Badge>
              {!m.isActive && <Badge tone="neutral">Đang tắt</Badge>}
            </span>
          }
          actions={
            canManage && (
              <>
                <Button size="sm" variant="outline" onClick={() => setMenuDialog({ menu: m })}>
                  <Pencil className="h-4 w-4" /> Sửa
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setCatDialog({ category: null, menuId: m.id })}>
                  <Plus className="h-4 w-4" /> Danh mục
                </Button>
              </>
            )
          }
        >
          <p className="mb-2 text-sm text-ink-500">
            {m.code} · {scheduleText(m.schedule)} · Áp dụng:{' '}
            {m.branches.length === 0 ? 'chưa gán cơ sở' : m.branches.map((b) => branches.find((x) => x.id === b.branchId)?.name ?? b.branchId.slice(0, 6)).join(', ')}
          </p>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {m.categories.map((c) => (
              <li key={c.id}>
                <button type="button" disabled={!canManage} onClick={() => setCatDialog({ category: c, menuId: m.id })} className="flex w-full items-center gap-2 rounded-xl border border-ink-100 px-3 py-2 text-left hover:border-brand-300 disabled:cursor-default">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{c.name}</span>
                    <span className="block truncate text-xs text-ink-500">
                      {c._count?.items ?? 0} món · {c.defaultStationCode ?? 'chưa gán trạm'}
                      {c.schedule && Object.keys(c.schedule).length > 0 ? ` · ${scheduleText(c.schedule)}` : ''}
                    </span>
                  </span>
                  {!c.isActive && <Badge tone="neutral">Tắt</Badge>}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ))}
      {menuDialog && <MenuDialog menu={menuDialog.menu} onClose={() => setMenuDialog(null)} />}
      {catDialog && <CategoryDialog category={catDialog.category} menuId={catDialog.menuId} menus={list} onClose={() => setCatDialog(null)} />}
    </div>
  );
}

interface MenuForm {
  code: string;
  name: string;
  nameEn: string | null;
  kind: MenuKind;
  schedule: Schedule;
  sortOrder: number;
  isActive: boolean;
  branchIds: string[];
  [k: string]: unknown;
}

function MenuDialog({ menu, onClose }: { menu: AdminMenu | null; onClose: () => void }) {
  const qc = useQueryClient();
  const branches = useAuth((s) => s.me?.branches ?? []);
  const original: MenuForm | null = menu
    ? { code: menu.code, name: menu.name, nameEn: menu.nameEn, kind: menu.kind, schedule: menu.schedule ?? {}, sortOrder: menu.sortOrder, isActive: menu.isActive, branchIds: menu.branches.map((b) => b.branchId).sort() }
    : null;
  const [form, setForm] = useState<MenuForm>(original ?? { code: '', name: '', nameEn: null, kind: 'ALACARTE', schedule: {}, sortOrder: 0, isActive: true, branchIds: branches.map((b) => b.id) });
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof MenuForm>(k: K, v: MenuForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name.trim() || !form.code.trim()) return toast.error('Nhập tên và mã thực đơn');
    setSaving(true);
    try {
      const body = { ...form, branchIds: [...form.branchIds].sort() };
      if (menu) {
        const p = diffPatch(original, body);
        if (Object.keys(p).length) await menuAdminApi.updateMenu(menu.id, p);
      } else await menuAdminApi.createMenu(body);
      toast.success('Đã lưu thực đơn');
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
      title={menu ? `Sửa thực đơn: ${menu.name}` : 'Thêm thực đơn'}
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
          <Input label="Tên thực đơn *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value, code: menu ? f.code : codeFrom(e.target.value) }))} />
          <Input label="Tên tiếng Anh" value={form.nameEn ?? ''} onChange={(e) => set('nameEn', e.target.value || null)} />
          <Input label="Mã *" value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} />
          <Select label="Loại" value={form.kind} onChange={(e) => set('kind', e.target.value as MenuKind)}>
            {(Object.keys(MENU_KIND_LABELS) as MenuKind[]).map((k) => (
              <option key={k} value={k}>
                {MENU_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
          <IntInput label="Thứ tự" value={form.sortOrder} onChange={(v) => set('sortOrder', v ?? 0)} />
          <Toggle checked={form.isActive} onChange={(v) => set('isActive', v)} label="Đang dùng" />
        </div>
        <ScheduleEditor value={form.schedule} onChange={(v) => set('schedule', v)} />
        <div>
          <span className="mb-1 block text-sm font-semibold text-ink-700">Áp dụng tại cơ sở</span>
          <div className="flex flex-wrap gap-3">
            {branches.map((b) => (
              <label key={b.id} className="flex min-h-[44px] items-center gap-2">
                <input type="checkbox" className="h-5 w-5" checked={form.branchIds.includes(b.id)} onChange={(e) => set('branchIds', e.target.checked ? [...form.branchIds, b.id] : form.branchIds.filter((x) => x !== b.id))} />
                {b.name}
              </label>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

interface CategoryForm {
  menuId: string;
  code: string;
  name: string;
  nameEn: string | null;
  imageUrl: string | null;
  defaultStationCode: string | null;
  schedule: Schedule;
  sortOrder: number;
  isActive: boolean;
  [k: string]: unknown;
}

function CategoryDialog({ category, menuId, menus, onClose }: { category: AdminCategory | null; menuId: string; menus: AdminMenu[]; onClose: () => void }) {
  const qc = useQueryClient();
  const stations = useAdminStations(useBranchId());
  const original: CategoryForm | null = category
    ? { menuId: category.menuId, code: category.code, name: category.name, nameEn: category.nameEn, imageUrl: category.imageUrl, defaultStationCode: category.defaultStationCode, schedule: category.schedule ?? {}, sortOrder: category.sortOrder, isActive: category.isActive }
    : null;
  const [form, setForm] = useState<CategoryForm>(original ?? { menuId, code: '', name: '', nameEn: null, imageUrl: null, defaultStationCode: null, schedule: {}, sortOrder: 0, isActive: true });
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof CategoryForm>(k: K, v: CategoryForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name.trim() || !form.code.trim()) return toast.error('Nhập tên và mã danh mục');
    setSaving(true);
    try {
      if (category) {
        const p = diffPatch(original, form);
        if (Object.keys(p).length) await menuAdminApi.updateCategory(category.id, p);
      } else await menuAdminApi.createCategory(form);
      toast.success('Đã lưu danh mục');
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
      title={category ? `Sửa danh mục: ${category.name}` : 'Thêm danh mục'}
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
          <Input label="Tên danh mục *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value, code: category ? f.code : codeFrom(e.target.value) }))} />
          <Input label="Tên tiếng Anh" value={form.nameEn ?? ''} onChange={(e) => set('nameEn', e.target.value || null)} />
          <Input label="Mã *" value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} />
          <Select label="Thuộc thực đơn" value={form.menuId} onChange={(e) => set('menuId', e.target.value)}>
            {menus.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
          <Select label="Trạm bếp mặc định" value={form.defaultStationCode ?? ''} onChange={(e) => set('defaultStationCode', e.target.value || null)}>
            <option value="">— Không —</option>
            {(stations.data ?? []).map((s) => (
              <option key={s.id} value={s.code}>
                {s.name} ({s.code})
              </option>
            ))}
          </Select>
          <IntInput label="Thứ tự" value={form.sortOrder} onChange={(v) => set('sortOrder', v ?? 0)} />
        </div>
        <Toggle checked={form.isActive} onChange={(v) => set('isActive', v)} label="Đang hiển thị" />
        <ImageUpload value={form.imageUrl} onChange={(url) => set('imageUrl', url)} label="Ảnh danh mục" />
        <ScheduleEditor value={form.schedule} onChange={(v) => set('schedule', v)} />
      </div>
    </Dialog>
  );
}
