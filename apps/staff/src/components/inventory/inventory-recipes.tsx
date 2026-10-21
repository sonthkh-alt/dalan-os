'use client';

import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { useAction, useMenu } from '@/lib/queries';
import { inventoryApi, opsKeys, useCogs, useRecipes, useStockItems, type Recipe } from '@/lib/queries-ops';
import { addDays, bpsLabel, dayMonth, fold, vnToday } from '@/lib/ops-utils';
import { cn, money, moneyPlain, moneyShort, qty } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, Input, Loading, Select } from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';
import { Card, ErrorBox, NumberInput, Stat, Table } from '@/components/ops/ui';

const onErr = (e: unknown) => toast.error(errorMessage(e));

interface MenuItemLite {
  id: string;
  name: string;
  unit: string;
  price: number | null;
  category: string;
  variants: { id: string; name: string; price: number }[];
}

function useMenuItemsLite(): MenuItemLite[] {
  const menu = useMenu();
  return useMemo(() => {
    const m = new Map<string, MenuItemLite>();
    for (const mn of menu.data?.menus ?? []) for (const c of mn.categories) for (const it of c.items) if (!m.has(it.id)) m.set(it.id, { id: it.id, name: it.name, unit: it.unit, price: it.price, category: c.name, variants: it.variants.map((v) => ({ id: v.id, name: v.name, price: v.price })) });
    return [...m.values()].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  }, [menu.data]);
}

// ───────────────────────── Định lượng ─────────────────────────

export function RecipesTab() {
  const items = useMenuItemsLite();
  const canInv = useCan('inventory.manage');
  const canMenu = useCan('menu.manage');
  const canEdit = canInv || canMenu;
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [edit, setEdit] = useState<Recipe | 'new' | null>(null);
  const recipes = useRecipes(selected);
  const item = items.find((i) => i.id === selected);
  const list = items.filter((i) => !search || fold(i.name).includes(fold(search)) || fold(i.category).includes(fold(search)));
  return (
    <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
      <Card title="Món" bodyClassName="p-2">
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-ink-300" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm món" className="pl-10" />
        </div>
        <div className="max-h-[65vh] overflow-y-auto">
          {list.map((i) => (
            <button key={i.id} type="button" onClick={() => setSelected(i.id)} className={cn('flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm', selected === i.id ? 'bg-brand-50 font-semibold text-brand-900' : 'hover:bg-paper')}>
              <span className="min-w-0 truncate">{i.name}</span>
              <span className="shrink-0 text-xs text-ink-500">{i.category}</span>
            </button>
          ))}
          {list.length === 0 && <p className="p-3 text-sm text-ink-500">Không có món.</p>}
        </div>
      </Card>
      <div className="space-y-3">
        {!item ? (
          <EmptyState title="Chọn một món" hint="Xem định lượng nguyên liệu, giá vốn ước tính và tỷ lệ food cost." />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold">{item.name}</h2>
              <span className="text-sm text-ink-500">
                Giá bán {item.price !== null ? money(item.price) : 'theo biến thể/cân'} / {item.unit}
              </span>
              {canEdit && (
                <Button size="sm" className="ml-auto" onClick={() => setEdit('new')}>
                  <Plus className="h-4 w-4" /> Thêm định lượng
                </Button>
              )}
            </div>
            <ErrorBox error={recipes.error} />
            {recipes.isLoading ? (
              <Loading />
            ) : (recipes.data ?? []).length === 0 ? (
              <EmptyState title="Món chưa có định lượng" hint="Không có định lượng thì bán món sẽ không trừ kho và không tính giá vốn." />
            ) : (
              (recipes.data ?? []).map((r) => {
                const variant = item.variants.find((v) => v.id === r.variantId);
                const price = variant?.price ?? item.price;
                const foodCostBps = price ? Math.round((r.estimatedCost / price) * 10_000) : null;
                return (
                  <Card
                    key={r.id}
                    title={`${variant ? `Biến thể: ${variant.name}` : r.modifierOptionId ? 'Theo tùy chọn' : 'Định lượng chuẩn'} · cho ${qty(r.yieldQty)} ${item.unit}`}
                    actions={
                      canEdit && (
                        <button type="button" onClick={() => setEdit(r)} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-ink-100" aria-label="Sửa định lượng">
                          <Pencil className="h-4 w-4" />
                        </button>
                      )
                    }
                  >
                    <Table head={['Nguyên liệu', 'Lượng dùng', 'Hao hụt', 'Giá vốn/ĐV', 'Thành tiền']}>
                      {r.lines.map((l) => (
                        <tr key={l.id}>
                          <td className="px-3 py-2">{l.stockItem.name}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {qty(l.quantity)} {l.stockItem.baseUnit}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{bpsLabel(l.wastageBps)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{moneyPlain(l.stockItem.costPerBaseUnit)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{moneyPlain(Math.round(l.quantity * (1 + l.wastageBps / 10_000) * l.stockItem.costPerBaseUnit))}</td>
                        </tr>
                      ))}
                    </Table>
                    <div className="mt-2 flex flex-wrap justify-end gap-4 text-sm">
                      <span>
                        Giá vốn ước tính / {item.unit}: <b className="tabular-nums">{money(r.estimatedCost)}</b>
                      </span>
                      {foodCostBps !== null && (
                        <span className={cn(foodCostBps > 4000 ? 'text-red-700' : foodCostBps > 3000 ? 'text-amber-700' : 'text-emerald-700')}>
                          Food cost <b>{bpsLabel(foodCostBps)}</b> · lãi gộp {money((price ?? 0) - r.estimatedCost)}
                        </span>
                      )}
                    </div>
                    {r.notes && <p className="mt-1 text-sm text-ink-500">{r.notes}</p>}
                  </Card>
                );
              })
            )}
          </>
        )}
      </div>
      {edit && item && <RecipeDialog item={item} recipe={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function RecipeDialog({ item, recipe, onClose }: { item: MenuItemLite; recipe: Recipe | null; onClose: () => void }) {
  const stock = useStockItems();
  const [variantId, setVariantId] = useState(recipe?.variantId ?? '');
  const [yieldQty, setYieldQty] = useState<number | null>(recipe?.yieldQty ?? 1);
  const [notes, setNotes] = useState(recipe?.notes ?? '');
  const [lines, setLines] = useState<{ stockItemId: string; quantity: number | null; wastagePct: number | null }[]>(recipe?.lines.map((l) => ({ stockItemId: l.stockItemId, quantity: l.quantity, wastagePct: l.wastageBps / 100 })) ?? [{ stockItemId: '', quantity: null, wastagePct: 0 }]);
  const upd = (i: number, p: Partial<(typeof lines)[number]>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const cost = lines.reduce((s, l) => s + (l.quantity ?? 0) * (1 + (l.wastagePct ?? 0) / 100) * (stock.data?.find((x) => x.id === l.stockItemId)?.costPerBaseUnit ?? 0), 0) / (yieldQty || 1);
  const save = useAction(
    () =>
      inventoryApi.upsertRecipe(item.id, {
        variantId: variantId || null,
        modifierOptionId: recipe?.modifierOptionId ?? null,
        yieldQty: yieldQty ?? 1,
        notes: notes.trim() || null,
        lines: lines.map((l) => ({ stockItemId: l.stockItemId, quantity: l.quantity, wastageBps: Math.round((l.wastagePct ?? 0) * 100) })),
      }),
    () => [opsKeys.inventory],
    () => {
      toast.success('Đã lưu định lượng');
      onClose();
    },
  );
  const valid = lines.length > 0 && lines.every((l) => l.stockItemId && (l.quantity ?? 0) > 0) && (yieldQty ?? 0) > 0 && new Set(lines.map((l) => l.stockItemId)).size === lines.length;
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Định lượng: ${item.name}`}
      size="lg"
      footer={
        <Button block onClick={() => save.mutate(undefined, { onError: onErr })} loading={save.isPending} disabled={!valid}>
          Lưu · giá vốn ước tính {money(Math.round(cost))}
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {item.variants.length > 0 ? (
            <Select label="Áp dụng cho" value={variantId} onChange={(e) => setVariantId(e.target.value)} disabled={!!recipe}>
              <option value="">Định lượng chuẩn (mọi biến thể)</option>
              {item.variants.map((v) => (
                <option key={v.id} value={v.id}>
                  Biến thể {v.name}
                </option>
              ))}
            </Select>
          ) : (
            <div />
          )}
          <NumberInput label={`Định lượng cho số ${item.unit}`} value={yieldQty} onChange={setYieldQty} min={0} hint="Ví dụ 1 mẻ nước dùng ra 20 bát" />
        </div>
        {lines.map((l, i) => {
          const s = stock.data?.find((x) => x.id === l.stockItemId);
          return (
            <div key={i} className="grid grid-cols-2 gap-2 rounded-xl border border-ink-100 p-2 sm:grid-cols-[1fr_130px_110px_auto]">
              <select value={l.stockItemId} onChange={(e) => upd(i, { stockItemId: e.target.value })} className="col-span-2 min-h-[48px] rounded-xl border border-ink-300 bg-white px-2 sm:col-span-1" aria-label="Nguyên liệu">
                <option value="">Chọn nguyên liệu...</option>
                {(stock.data ?? []).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name} ({x.baseUnit})
                  </option>
                ))}
              </select>
              <NumberInput value={l.quantity} onChange={(v) => upd(i, { quantity: v })} min={0} suffix={s?.baseUnit} />
              <NumberInput value={l.wastagePct} onChange={(v) => upd(i, { wastagePct: v })} min={0} suffix="%" />
              <button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="flex h-12 w-10 items-center justify-center text-red-700" aria-label="Xóa">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, { stockItemId: '', quantity: null, wastagePct: 0 }])}>
            <Plus className="h-4 w-4" /> Thêm nguyên liệu
          </Button>
          <span className="text-xs text-ink-500">Lượng dùng theo đơn vị cơ sở; % hao hụt sơ chế</span>
        </div>
        <Input label="Ghi chú" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Dialog>
  );
}

// ───────────────────────── Giá vốn ─────────────────────────

export function CogsTab() {
  const [from, setFrom] = useState(addDays(vnToday(), -6));
  const [to, setTo] = useState(vnToday());
  const cogs = useCogs(from, to);
  const d = cogs.data;
  const revenue = d?.byItem.reduce((s, i) => s + i.revenue, 0) ?? 0;
  const ratioBps = d && revenue > 0 ? Math.round((d.totalCogs / revenue) * 10_000) : null;
  const chartData = useMemo(() => {
    if (!d) return [];
    const map = new Map(d.byDay.map((x) => [x.date, x.cogs]));
    const out: { date: string; label: string; cogs: number }[] = [];
    for (let day = from; day <= to && out.length < 93; day = addDays(day, 1)) out.push({ date: day, label: dayMonth(day), cogs: map.get(day) ?? 0 });
    return out;
  }, [d, from, to]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Input label="Từ ngày" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        <Input label="Đến ngày" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        {[
          ['7 ngày', 6],
          ['30 ngày', 29],
        ].map(([label, n]) => (
          <Button
            key={label}
            variant="outline"
            onClick={() => {
              setTo(vnToday());
              setFrom(addDays(vnToday(), -(n as number)));
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      <ErrorBox error={cogs.error} />
      {cogs.isLoading || !d ? (
        <Loading />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stat label="Giá vốn hàng bán" value={money(d.totalCogs)} tone="brand" />
            <Stat label="Doanh thu món có định lượng" value={money(revenue)} />
            <Stat label="Tỷ lệ COGS" value={ratioBps === null ? '—' : bpsLabel(ratioBps)} tone={ratioBps !== null && ratioBps > 3800 ? 'danger' : 'neutral'} />
            <Stat label="Số món phát sinh" value={d.byItem.length} />
          </div>
          <Card title="Giá vốn theo ngày">
            {chartData.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-500">Không có dữ liệu.</p>
            ) : (
              <div className="h-64" role="img" aria-label="Biểu đồ cột giá vốn theo ngày">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#ece6e7" />
                    <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: '#b7adaf' }} tick={{ fill: '#6f6467', fontSize: 12 }} interval="preserveStartEnd" />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: '#6f6467', fontSize: 12 }} tickFormatter={(v: number) => moneyShort(v)} width={64} />
                    <Tooltip cursor={{ fill: 'rgba(127,34,51,0.06)' }} formatter={(v) => [money(Number(v)), 'Giá vốn']} labelFormatter={(l) => `Ngày ${String(l)}`} contentStyle={{ borderRadius: 12, borderColor: '#ece6e7', color: '#1f1b1c' }} />
                    <Bar dataKey="cogs" fill="#7f2233" radius={[4, 4, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
          <Card title="Giá vốn và biên lợi nhuận theo món">
            {d.byItem.length === 0 ? (
              <p className="py-3 text-center text-sm text-ink-500">Chưa có món nào trừ kho theo định lượng trong khoảng này.</p>
            ) : (
              <Table head={['Món', 'Số lượng bán', 'Doanh thu', 'Giá vốn', 'Lãi gộp', 'Biên LN']}>
                {d.byItem.map((i) => (
                  <tr key={i.name}>
                    <td className="px-3 py-2 font-semibold">{i.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{qty(i.quantity)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{moneyPlain(i.revenue)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{moneyPlain(i.cogs)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{moneyPlain(i.revenue - i.cogs)}</td>
                    <td className={cn('px-3 py-2 text-right font-semibold tabular-nums', i.marginBps !== null && i.marginBps < 6000 ? 'text-red-700' : 'text-emerald-700')}>{i.marginBps === null ? '—' : bpsLabel(i.marginBps)}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
