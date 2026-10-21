'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { errorMessage } from '@/lib/api';
import { useAuth, useBranchId } from '@/lib/auth-store';
import {
  adminKeys,
  menuAdminApi,
  useAdminItem,
  useAdminStations,
  useModifierGroups,
  type AdminMenu,
  type AdminMenuItem,
  type AdminOverride,
  type AdminVariant,
  type ItemStatus,
  type MenuItemBody,
  type PricingMode,
} from '@/lib/queries-admin';
import { cn, dateTimeVi, money } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Badge, Input, Loading, Segmented, Select, Textarea } from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';
import { BpsInput, IntInput, MoneyInput, TagsInput, Toggle, codeFrom, diffPatch } from '../form';
import { ImageUpload } from '../image-upload';

export const PRICING_LABELS: Record<PricingMode, string> = {
  FIXED: 'Giá cố định',
  VARIANT: 'Theo cỡ (biến thể)',
  WEIGHT: 'Theo cân (giá/kg)',
  MARKET: 'Giá thời điểm',
  OPEN: 'Món tự do',
};

export const STATUS_LABELS: Record<ItemStatus, { label: string; tone: 'success' | 'warning' | 'neutral' }> = {
  ACTIVE: { label: 'Đang bán', tone: 'success' },
  HIDDEN: { label: 'Tạm ẩn', tone: 'warning' },
  DISCONTINUED: { label: 'Ngừng bán', tone: 'neutral' },
};

const UNITS = ['phần', 'đĩa', 'bát', 'tô', 'con', 'kg', 'nồi', 'lẩu', 'chai', 'lon', 'cốc', 'ly', 'suất', 'mâm', 'cái', 'gói'];

interface ItemForm {
  categoryId: string;
  code: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  descriptionEn: string | null;
  unit: string;
  pricingMode: PricingMode;
  basePrice: number | null;
  vatRateBps: number | null;
  defaultStationCode: string | null;
  imageUrl: string | null;
  isVegetarian: boolean;
  isSignature: boolean;
  isSpicy: boolean;
  countEmpties: boolean;
  prepMinutes: number | null;
  tags: string[];
  allergens: string[];
  sortOrder: number;
  status: ItemStatus;
  variants: Omit<AdminVariant, 'id'>[];
  modifierGroupIds: string[];
  [key: string]: unknown;
}

function fromItem(item: AdminMenuItem): ItemForm {
  return {
    categoryId: item.categoryId,
    code: item.code,
    name: item.name,
    nameEn: item.nameEn,
    description: item.description,
    descriptionEn: item.descriptionEn,
    unit: item.unit,
    pricingMode: item.pricingMode,
    basePrice: item.basePrice === null ? null : Number(item.basePrice),
    vatRateBps: item.vatRateBps,
    defaultStationCode: item.defaultStationCode,
    imageUrl: item.imageUrl,
    isVegetarian: item.isVegetarian,
    isSignature: item.isSignature,
    isSpicy: item.isSpicy,
    countEmpties: item.countEmpties,
    prepMinutes: item.prepMinutes,
    tags: item.tags ?? [],
    allergens: item.allergens ?? [],
    sortOrder: item.sortOrder,
    status: item.status,
    variants: item.variants.map((v) => ({ code: v.code, name: v.name, nameEn: v.nameEn ?? null, price: Number(v.price), sortOrder: v.sortOrder, isDefault: v.isDefault, isActive: v.isActive })),
    modifierGroupIds: [...item.modifierGroups].sort((a, b) => a.sortOrder - b.sortOrder).map((g) => g.groupId),
  };
}

function emptyForm(categoryId: string): ItemForm {
  return {
    categoryId,
    code: '',
    name: '',
    nameEn: null,
    description: null,
    descriptionEn: null,
    unit: 'phần',
    pricingMode: 'FIXED',
    basePrice: null,
    vatRateBps: null,
    defaultStationCode: null,
    imageUrl: null,
    isVegetarian: false,
    isSignature: false,
    isSpicy: false,
    countEmpties: false,
    prepMinutes: null,
    tags: [],
    allergens: [],
    sortOrder: 0,
    status: 'ACTIVE',
    variants: [],
    modifierGroupIds: [],
  };
}

type Tab = 'info' | 'price' | 'modifiers' | 'branches' | 'history';

/** Hộp sửa món: thông tin song ngữ, chế độ giá, biến thể, tùy chọn, điều chỉnh theo cơ sở, lịch sử giá. */
export function ItemEditor({ open, onClose, item, menus, defaultCategoryId, canManage }: { open: boolean; onClose: () => void; item: AdminMenuItem | null; menus: AdminMenu[]; defaultCategoryId: string; canManage: boolean }) {
  const qc = useQueryClient();
  const branchId = useBranchId();
  const stations = useAdminStations(branchId);
  const groups = useModifierGroups();
  const detail = useAdminItem(item?.id ?? null);
  const original = useMemo(() => (item ? fromItem(item) : null), [item]);
  const [form, setForm] = useState<ItemForm>(() => original ?? emptyForm(defaultCategoryId));
  const [tab, setTab] = useState<Tab>('info');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [codeTouched, setCodeTouched] = useState(!!item);

  const set = <K extends keyof ItemForm>(k: K, v: ItemForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const categories = menus.flatMap((m) => m.categories.map((c) => ({ ...c, menuName: m.name })));
  const priceChanged = !!original && original.basePrice !== form.basePrice;

  const validate = (): string | null => {
    if (!form.name.trim()) return 'Nhập tên món';
    if (!form.code.trim()) return 'Nhập mã món';
    if (!form.categoryId) return 'Chọn danh mục';
    if ((form.pricingMode === 'FIXED' || form.pricingMode === 'WEIGHT') && (form.basePrice === null || form.basePrice <= 0)) return form.pricingMode === 'WEIGHT' ? 'Nhập giá trên mỗi kg' : 'Nhập giá bán';
    if (form.pricingMode === 'VARIANT') {
      if (form.variants.length === 0) return 'Thêm ít nhất một cỡ/biến thể';
      if (form.variants.some((v) => !v.name.trim() || !v.code.trim())) return 'Mỗi biến thể cần tên và mã';
      if (new Set(form.variants.map((v) => v.code)).size !== form.variants.length) return 'Mã biến thể bị trùng';
    }
    return null;
  };

  const save = async () => {
    const err = validate();
    if (err) return toast.error(err);
    setSaving(true);
    try {
      const body: MenuItemBody = { ...form, code: form.code.trim().toUpperCase(), name: form.name.trim() };
      if (item) {
        const patchBody = diffPatch(original as unknown as Record<string, unknown>, body as Record<string, unknown>) as MenuItemBody;
        if (priceChanged && reason.trim()) patchBody.priceChangeReason = reason.trim();
        if (Object.keys(patchBody).length === 0) {
          toast.info('Không có thay đổi');
          setSaving(false);
          return;
        }
        await menuAdminApi.updateItem(item.id, patchBody);
        toast.success('Đã lưu món');
      } else {
        if (!body.variants?.length) delete body.variants;
        if (!body.modifierGroupIds?.length) delete body.modifierGroupIds;
        await menuAdminApi.createItem(body);
        toast.success('Đã thêm món');
      }
      void qc.invalidateQueries({ queryKey: ['admin'] });
      void qc.invalidateQueries({ queryKey: ['menu'] });
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const tabs: { value: Tab; label: string }[] = [
    { value: 'info', label: 'Thông tin' },
    { value: 'price', label: 'Giá' },
    { value: 'modifiers', label: 'Tùy chọn' },
    ...(item ? ([{ value: 'branches', label: 'Theo cơ sở' }, { value: 'history', label: 'Lịch sử giá' }] as { value: Tab; label: string }[]) : []),
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={item ? `Sửa món: ${item.name}` : 'Thêm món mới'}
      footer={
        canManage && tab !== 'branches' && tab !== 'history' ? (
          <>
            <Button variant="outline" onClick={onClose}>
              Hủy
            </Button>
            <Button className="ml-auto" loading={saving} onClick={() => void save()}>
              {item ? 'Lưu thay đổi' : 'Thêm món'}
            </Button>
          </>
        ) : undefined
      }
    >
      <Segmented value={tab} onChange={setTab} options={tabs} className="mb-3 flex-wrap" />
      <fieldset disabled={!canManage} className="space-y-3">
        {tab === 'info' && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Tên món (tiếng Việt) *"
                value={form.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setForm((f) => ({ ...f, name, code: codeTouched ? f.code : codeFrom(name) }));
                }}
              />
              <Input label="Tên tiếng Anh" value={form.nameEn ?? ''} onChange={(e) => set('nameEn', e.target.value || null)} />
              <Input
                label="Mã món *"
                value={form.code}
                onChange={(e) => {
                  setCodeTouched(true);
                  set('code', e.target.value.toUpperCase());
                }}
              />
              <Select label="Danh mục *" value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
                <option value="">— Chọn danh mục —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.menuName} › {c.name}
                  </option>
                ))}
              </Select>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-ink-700">Đơn vị tính</span>
                <input list="dalan-units" className="min-h-[48px] w-full rounded-xl border border-ink-300 bg-white px-3 text-base outline-none focus:border-brand-500" value={form.unit} onChange={(e) => set('unit', e.target.value)} />
                <datalist id="dalan-units">
                  {UNITS.map((u) => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
              </label>
              <Select label="Trạm bếp mặc định" value={form.defaultStationCode ?? ''} onChange={(e) => set('defaultStationCode', e.target.value || null)}>
                <option value="">Theo danh mục</option>
                {(stations.data ?? []).map((s) => (
                  <option key={s.id} value={s.code}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </Select>
              <Select label="Trạng thái" value={form.status} onChange={(e) => set('status', e.target.value as ItemStatus)}>
                {(Object.keys(STATUS_LABELS) as ItemStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s].label}
                  </option>
                ))}
              </Select>
              <IntInput label="Thời gian chế biến (phút)" value={form.prepMinutes} min={0} onChange={(v) => set('prepMinutes', v)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Textarea label="Mô tả (tiếng Việt)" value={form.description ?? ''} onChange={(e) => set('description', e.target.value || null)} />
              <Textarea label="Mô tả (tiếng Anh)" value={form.descriptionEn ?? ''} onChange={(e) => set('descriptionEn', e.target.value || null)} />
            </div>
            <ImageUpload value={form.imageUrl} onChange={(url) => set('imageUrl', url)} disabled={!canManage} label="Ảnh món" />
            <div className="grid gap-x-4 sm:grid-cols-2">
              <Toggle checked={form.isSignature} onChange={(v) => set('isSignature', v)} label="Món đặc sản" />
              <Toggle checked={form.isVegetarian} onChange={(v) => set('isVegetarian', v)} label="Món chay" />
              <Toggle checked={form.isSpicy} onChange={(v) => set('isSpicy', v)} label="Món cay" />
              <Toggle checked={form.countEmpties} onChange={(v) => set('countEmpties', v)} label="Đếm vỏ" hint="Bia, nước, khăn lạnh: chốt số lượng khi thanh toán" />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <TagsInput label="Nhãn" value={form.tags} onChange={(v) => set('tags', v)} placeholder="dac-san, ban-chay" />
              <TagsInput label="Chất gây dị ứng" value={form.allergens} onChange={(v) => set('allergens', v)} placeholder="tôm, đậu phộng" />
              <IntInput label="Thứ tự hiển thị" value={form.sortOrder} onChange={(v) => set('sortOrder', v ?? 0)} />
            </div>
          </>
        )}

        {tab === 'price' && (
          <>
            <Select label="Chế độ giá" value={form.pricingMode} onChange={(e) => set('pricingMode', e.target.value as PricingMode)}>
              {(Object.keys(PRICING_LABELS) as PricingMode[]).map((m) => (
                <option key={m} value={m}>
                  {PRICING_LABELS[m]}
                </option>
              ))}
            </Select>
            <p className="text-sm text-ink-500">
              {form.pricingMode === 'FIXED' && 'Giá bán cố định cho mỗi đơn vị.'}
              {form.pricingMode === 'VARIANT' && 'Khách chọn cỡ (nhỏ/lớn...), mỗi cỡ một giá riêng.'}
              {form.pricingMode === 'WEIGHT' && 'Bán theo cân: nhập giá trên 1 kg, nhân viên chốt trọng lượng khi bán.'}
              {form.pricingMode === 'MARKET' && 'Giá theo thời điểm: nhân viên có quyền nhập giá khi gọi món. Giá dưới đây chỉ để gợi ý.'}
              {form.pricingMode === 'OPEN' && 'Món tự do: nhân viên có quyền nhập tên và giá khi gọi.'}
            </p>
            {form.pricingMode !== 'VARIANT' && (
              <MoneyInput
                label={form.pricingMode === 'WEIGHT' ? 'Giá trên 1 kg *' : form.pricingMode === 'FIXED' ? 'Giá bán *' : 'Giá gợi ý'}
                value={form.basePrice}
                onChange={(v) => set('basePrice', v)}
              />
            )}
            {form.pricingMode === 'VARIANT' && <VariantsEditor value={form.variants} onChange={(v) => set('variants', v)} />}
            {priceChanged && <Input label="Lý do đổi giá" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ví dụ: điều chỉnh theo giá nguyên liệu" />}
            <BpsInput label="Thuế VAT riêng cho món" value={form.vatRateBps} onChange={(v) => set('vatRateBps', v)} placeholder="Theo cấu hình cơ sở" hint="Bỏ trống để dùng thuế suất của cơ sở (8% hoặc 10%)." />
          </>
        )}

        {tab === 'modifiers' && (
          <div className="space-y-2">
            <p className="text-sm text-ink-500">Chọn các nhóm tùy chọn áp dụng cho món (cách chế biến, độ cay, đồ ăn kèm...). Thứ tự hiển thị theo thứ tự chọn.</p>
            {groups.isLoading && <Loading />}
            {(groups.data ?? []).map((g) => {
              const idx = form.modifierGroupIds.indexOf(g.id);
              const on = idx >= 0;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => set('modifierGroupIds', on ? form.modifierGroupIds.filter((x) => x !== g.id) : [...form.modifierGroupIds, g.id])}
                  className={cn('flex w-full items-center gap-3 rounded-xl border p-3 text-left', on ? 'border-brand-500 bg-brand-50' : 'border-ink-100 bg-white')}
                >
                  <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold', on ? 'bg-brand-700 text-white' : 'bg-ink-100 text-ink-500')}>{on ? idx + 1 : ''}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">
                      {g.name} {g.isRequired && <Badge tone="warning">Bắt buộc</Badge>}
                    </span>
                    <span className="block truncate text-xs text-ink-500">
                      Chọn {g.minSelect}–{g.maxSelect} · {g.options.map((o) => o.name).join(', ')}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </fieldset>

      {tab === 'branches' && item && <BranchOverrides item={detail.data ?? item} canManage={canManage} />}
      {tab === 'history' && item && (detail.isLoading ? <Loading /> : <PriceHistory item={detail.data ?? item} />)}
    </Dialog>
  );
}

function VariantsEditor({ value, onChange }: { value: Omit<AdminVariant, 'id'>[]; onChange: (v: Omit<AdminVariant, 'id'>[]) => void }) {
  const update = (i: number, patch: Partial<AdminVariant>) => onChange(value.map((v, j) => (j === i ? { ...v, ...patch } : patch.isDefault ? { ...v, isDefault: false } : v)));
  return (
    <div className="space-y-2">
      <span className="block text-sm font-semibold text-ink-700">Các cỡ / biến thể</span>
      {value.map((v, i) => (
        <div key={i} className="grid grid-cols-2 gap-2 rounded-xl border border-ink-100 p-2 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
          <Input label="Tên cỡ" value={v.name} onChange={(e) => update(i, { name: e.target.value, code: v.code || codeFrom(e.target.value) })} placeholder="Nhỏ" />
          <Input label="Tên tiếng Anh" value={v.nameEn ?? ''} onChange={(e) => update(i, { nameEn: e.target.value || null })} placeholder="Small" />
          <Input label="Mã" value={v.code} onChange={(e) => update(i, { code: e.target.value.toUpperCase() })} />
          <MoneyInput label="Giá" value={v.price} onChange={(p) => update(i, { price: p ?? 0 })} />
          <div className="col-span-2 flex items-end gap-2 sm:col-span-1">
            <label className="flex min-h-[48px] items-center gap-1 text-sm">
              <input type="radio" checked={v.isDefault} onChange={() => update(i, { isDefault: true })} /> Mặc định
            </label>
            <label className="flex min-h-[48px] items-center gap-1 text-sm">
              <input type="checkbox" checked={v.isActive} onChange={(e) => update(i, { isActive: e.target.checked })} /> Bán
            </label>
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="flex h-11 w-11 items-center justify-center rounded-full text-red-600 hover:bg-red-50" aria-label="Xóa biến thể">
              <Trash className="h-5 w-5" />
            </button>
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => onChange([...value, { code: '', name: '', nameEn: null, price: 0, sortOrder: value.length, isDefault: value.length === 0, isActive: true }])}>
        <Plus className="h-4 w-4" /> Thêm cỡ
      </Button>
    </div>
  );
}

function soldOutLabel(ov: AdminOverride | undefined): string | null {
  if (!ov?.soldOutUntil) return null;
  const until = new Date(ov.soldOutUntil);
  if (until.getTime() < Date.now()) return null;
  if (until.getFullYear() >= 2099) return 'Hết vô thời hạn';
  return `Hết đến ${dateTimeVi(until)}`;
}

function BranchOverrides({ item, canManage }: { item: AdminMenuItem; canManage: boolean }) {
  const branches = useAuth((s) => s.me?.branches ?? []);
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-500">Giá riêng, trạm bếp riêng, bật/tắt bán và giới hạn số suất cho từng cơ sở. Bỏ trống giá để dùng giá chung.</p>
      {branches.map((b) => (
        <BranchOverrideRow key={b.id} branchId={b.id} branchName={b.name} item={item} canManage={canManage} />
      ))}
    </div>
  );
}

function BranchOverrideRow({ branchId, branchName, item, canManage }: { branchId: string; branchName: string; item: AdminMenuItem; canManage: boolean }) {
  const qc = useQueryClient();
  const ov = item.overrides.find((o) => o.branchId === branchId);
  const stations = useAdminStations(branchId);
  const [price, setPrice] = useState<number | null>(ov?.price === null || ov?.price === undefined ? null : Number(ov.price));
  const [isAvailable, setAvailable] = useState(ov?.isAvailable ?? true);
  const [stockLimit, setStockLimit] = useState<number | null>(ov?.stockLimit ?? null);
  const [stationCode, setStationCode] = useState<string | null>(ov?.stationCode ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const soldOut = soldOutLabel(ov);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin'] });
    void qc.invalidateQueries({ queryKey: ['menu', branchId] });
  };
  const save = async () => {
    setBusy('save');
    try {
      await menuAdminApi.setOverride(branchId, item.id, { price, isAvailable, stockLimit, stationCode });
      toast.success(`Đã lưu điều chỉnh cho ${branchName}`);
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const mark = async (mode: 'today' | 'indefinite' | 'clear') => {
    setBusy(mode);
    try {
      await menuAdminApi.soldOut(branchId, item.id, mode);
      toast.success(mode === 'clear' ? 'Đã mở bán lại' : 'Đã đánh dấu hết món');
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border border-ink-100 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-bold">{branchName}</span>
        {soldOut && <Badge tone="danger">{soldOut}</Badge>}
        {ov?.stockLeft !== null && ov?.stockLeft !== undefined && <Badge tone="info">Còn {ov.stockLeft} suất</Badge>}
        {!isAvailable && <Badge tone="neutral">Không bán tại cơ sở</Badge>}
      </div>
      <fieldset disabled={!canManage} className="grid gap-2 sm:grid-cols-3">
        <MoneyInput label="Giá riêng" value={price} onChange={setPrice} placeholder={item.basePrice !== null ? money(item.basePrice) : 'Giá chung'} />
        <IntInput label="Giới hạn số suất" value={stockLimit} min={0} onChange={setStockLimit} placeholder="Không giới hạn" />
        <Select label="Trạm bếp" value={stationCode ?? ''} onChange={(e) => setStationCode(e.target.value || null)}>
          <option value="">Theo món</option>
          {(stations.data ?? []).map((s) => (
            <option key={s.id} value={s.code}>
              {s.name}
            </option>
          ))}
        </Select>
        <div className="sm:col-span-3">
          <Toggle checked={isAvailable} onChange={setAvailable} label="Bán tại cơ sở này" />
        </div>
      </fieldset>
      {canManage && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" loading={busy === 'save'} onClick={() => void save()}>
            Lưu điều chỉnh
          </Button>
          <Button size="sm" variant="outline" loading={busy === 'today'} onClick={() => void mark('today')}>
            Hết hôm nay
          </Button>
          <Button size="sm" variant="outline" loading={busy === 'indefinite'} onClick={() => void mark('indefinite')}>
            Hết vô thời hạn
          </Button>
          {soldOut && (
            <Button size="sm" variant="success" loading={busy === 'clear'} onClick={() => void mark('clear')}>
              Mở bán lại
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function PriceHistory({ item }: { item: AdminMenuItem }) {
  const rows = item.priceHistory ?? [];
  if (rows.length === 0) return <p className="py-6 text-center text-ink-500">Chưa có lịch sử thay đổi giá.</p>;
  return (
    <ul className="divide-y divide-ink-100">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
          <span className="w-32 shrink-0 text-ink-500">{dateTimeVi(r.changedAt)}</span>
          <span className="tabular-nums">
            {r.oldPrice === null ? '—' : money(r.oldPrice)} → <b>{r.newPrice === null ? '—' : money(r.newPrice)}</b>
          </span>
          {r.reason && <span className="text-ink-500">· {r.reason}</span>}
        </li>
      ))}
    </ul>
  );
}
