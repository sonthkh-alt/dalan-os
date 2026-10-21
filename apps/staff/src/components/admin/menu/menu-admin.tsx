'use client';

/* eslint-disable @next/next/no-img-element */
import { useMemo, useState } from 'react';
import { ImagePlus, Pencil, Plus } from 'lucide-react';
import { matchesSearch } from '@dalan/domain';
import { errorMessage } from '@/lib/api';
import { useBranchId, useCan } from '@/lib/auth-store';
import { useAdminItems, useAdminMenus, type AdminMenuItem, type ItemStatus } from '@/lib/queries-admin';
import { money } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, Loading, Segmented, Select } from '@/components/ui/primitives';
import { Card, SearchBox } from '../form';
import { ItemEditor, PRICING_LABELS, STATUS_LABELS } from './item-editor';
import { MenusPanel } from './menus-panel';
import { ModifiersPanel } from './modifiers-panel';

type Tab = 'items' | 'menus' | 'modifiers';

export function MenuAdmin() {
  const [tab, setTab] = useState<Tab>('items');
  const canManage = useCan('menu.manage');
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="sr-only">Quản lý thực đơn</h2>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'items', label: 'Món' },
            { value: 'menus', label: 'Thực đơn & danh mục' },
            { value: 'modifiers', label: 'Nhóm tùy chọn' },
          ]}
        />
      </div>
      {!canManage && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">Bạn chỉ có quyền xem thực đơn.</p>}
      {tab === 'items' && <ItemsPanel canManage={canManage} />}
      {tab === 'menus' && <MenusPanel canManage={canManage} />}
      {tab === 'modifiers' && <ModifiersPanel canManage={canManage} />}
    </div>
  );
}

export function itemPriceText(item: AdminMenuItem): string {
  switch (item.pricingMode) {
    case 'VARIANT': {
      const prices = item.variants.filter((v) => v.isActive).map((v) => Number(v.price));
      if (prices.length === 0) return '—';
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      return min === max ? money(min) : `${money(min)} – ${money(max)}`;
    }
    case 'WEIGHT':
      return item.basePrice !== null ? `${money(item.basePrice)}/kg` : '—';
    case 'MARKET':
      return 'Theo thời điểm';
    case 'OPEN':
      return 'Tự do';
    default:
      return item.basePrice !== null ? money(item.basePrice) : '—';
  }
}

function ItemsPanel({ canManage }: { canManage: boolean }) {
  const branchId = useBranchId();
  const menus = useAdminMenus();
  const items = useAdminItems();
  const [search, setSearch] = useState('');
  const [menuId, setMenuId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState<ItemStatus | ''>('');
  const [editing, setEditing] = useState<AdminMenuItem | null>(null);
  const [creating, setCreating] = useState(false);

  const categories = useMemo(() => (menus.data ?? []).filter((m) => !menuId || m.id === menuId).flatMap((m) => m.categories), [menus.data, menuId]);
  const filtered = useMemo(
    () =>
      (items.data ?? []).filter(
        (i) =>
          (!menuId || i.category.menuId === menuId) &&
          (!categoryId || i.categoryId === categoryId) &&
          (!status || i.status === status) &&
          (matchesSearch(i.name, search) || matchesSearch(i.nameEn ?? '', search) || matchesSearch(i.code, search) || i.tags.some((t) => matchesSearch(t, search))),
      ),
    [items.data, menuId, categoryId, status, search],
  );

  if (menus.isLoading || items.isLoading) return <Loading label="Đang tải thực đơn..." />;
  if (items.isError) return <p className="text-red-700">{errorMessage(items.error)}</p>;

  return (
    <Card
      title={`Món (${filtered.length}/${items.data?.length ?? 0})`}
      actions={
        canManage && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Thêm món
          </Button>
        )
      }
    >
      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <SearchBox value={search} onChange={setSearch} placeholder="Tìm món (vd: ga ri, cua)" />
        <Select
          value={menuId}
          onChange={(e) => {
            setMenuId(e.target.value);
            setCategoryId('');
          }}
          className="min-h-[44px]"
          aria-label="Lọc theo thực đơn"
        >
          <option value="">Tất cả thực đơn</option>
          {(menus.data ?? []).map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="min-h-[44px]" aria-label="Lọc theo danh mục">
          <option value="">Tất cả danh mục</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value as ItemStatus | '')} className="min-h-[44px]" aria-label="Lọc theo trạng thái">
          <option value="">Mọi trạng thái</option>
          {(Object.keys(STATUS_LABELS) as ItemStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s].label}
            </option>
          ))}
        </Select>
      </div>
      {filtered.length === 0 ? (
        <EmptyState title="Không tìm thấy món" hint="Thử bỏ bớt bộ lọc hoặc gõ từ khóa khác." />
      ) : (
        <ul className="divide-y divide-ink-100">
          {filtered.map((i) => {
            const ov = i.overrides.find((o) => o.branchId === branchId);
            const soldOut = ov?.soldOutUntil && new Date(ov.soldOutUntil).getTime() > Date.now();
            return (
              <li key={i.id}>
                <button type="button" onClick={() => setEditing(i)} className="flex w-full items-center gap-3 py-2 text-left hover:bg-ink-100/40">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ink-100">
                    {i.imageUrl ? <img src={i.imageUrl} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-5 w-5 text-ink-300" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5 font-semibold text-ink-900">
                      {i.name}
                      {i.isSignature && <Badge tone="brand">Đặc sản</Badge>}
                      {i.isVegetarian && <Badge tone="success">Chay</Badge>}
                      {i.isSpicy && <Badge tone="danger">Cay</Badge>}
                      {soldOut && <Badge tone="danger">Hết món</Badge>}
                      {ov && !ov.isAvailable && <Badge tone="neutral">Tắt tại cơ sở</Badge>}
                    </span>
                    <span className="block truncate text-xs text-ink-500">
                      {i.code} · {i.category.name} · {i.unit} · {PRICING_LABELS[i.pricingMode]}
                      {i.nameEn ? ` · ${i.nameEn}` : ''}
                    </span>
                  </span>
                  <span className="hidden text-right sm:block">
                    <span className="block font-semibold tabular-nums">{itemPriceText(i)}</span>
                    {ov?.price !== null && ov?.price !== undefined && <span className="block text-xs text-brand-700">Cơ sở: {money(ov.price)}</span>}
                  </span>
                  <Badge tone={STATUS_LABELS[i.status].tone}>{STATUS_LABELS[i.status].label}</Badge>
                  <Pencil className="h-4 w-4 shrink-0 text-ink-300" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {(editing || creating) && (
        <ItemEditor
          key={editing?.id ?? 'new'}
          open
          item={editing}
          menus={menus.data ?? []}
          defaultCategoryId={categoryId}
          canManage={canManage}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      )}
    </Card>
  );
}
