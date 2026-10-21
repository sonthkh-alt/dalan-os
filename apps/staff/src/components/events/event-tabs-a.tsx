'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { computeEventTotals } from '@dalan/domain';
import { EVENT_KIND_LABELS } from '@dalan/contracts';
import { ApiError, errorMessage } from '@/lib/api';
import { useAction, useMenu } from '@/lib/queries';
import { eventApi, opsKeys, useHalls, useServiceCatalog, type EventDetail, type EventKind } from '@/lib/queries-ops';
import { bpsLabel, emptyToNull, fold, phoneDisplay, vnDateTime } from '@/lib/ops-utils';
import { cn, money, moneyPlain, qty } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge, Input, Row, Select, Textarea } from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';
import { Card, Checkbox, ErrorBox, MoneyInput, NumberInput, Table } from '@/components/ops/ui';
import { BEVERAGE_LABELS, EDITABLE_MENU, EVENT_STATUS, LAYOUT_LABELS } from './labels';

export interface TabProps {
  ev: EventDetail;
  canManage: boolean;
  canSettle: boolean;
  canCollect: boolean;
}

export const evInvalidate = (id: string) => [opsKeys.event(id), opsKeys.eventsAll] as const;
const onErr = (e: unknown) => toast.error(errorMessage(e));

/** Danh sách món của cơ sở (bỏ trùng) để chọn vào thực đơn tiệc, đồ uống đếm vỏ. */
export function useMenuItems() {
  const menu = useMenu();
  return useMemo(() => {
    const seen = new Map<string, { id: string; name: string; unit: string; price: number | null; countEmpties: boolean; category: string }>();
    for (const m of menu.data?.menus ?? []) for (const c of m.categories) for (const it of c.items) if (!seen.has(it.id)) seen.set(it.id, { id: it.id, name: it.name, unit: it.unit, price: it.price ?? it.variants[0]?.price ?? null, countEmpties: it.countEmpties, category: c.name });
    return [...seen.values()];
  }, [menu.data]);
}

// ───────────────────────── Thông tin ─────────────────────────

export function InfoTab({ ev, canManage }: TabProps) {
  const halls = useHalls();
  const locked = !canManage || ['SETTLED', 'CLOSED', 'CANCELLED'].includes(ev.status);
  const initial = {
    kind: ev.kind,
    contactName: ev.contactName,
    contactPhone: ev.contactPhone.replace(/^\+84/, '0'),
    contactEmail: ev.contactEmail ?? '',
    companyName: ev.companyName ?? '',
    taxCode: ev.taxCode ?? '',
    eventDate: ev.eventDate,
    startTime: ev.startTime,
    endTime: ev.endTime,
    expectedTables: ev.expectedTables,
    guestsPerTable: ev.guestsPerTable,
    expectedGuests: ev.expectedGuests as number | null,
    beveragePolicy: ev.beveragePolicy,
    beverageNotes: ev.beverageNotes ?? '',
    notes: ev.notes ?? '',
    internalNotes: ev.internalNotes ?? '',
    halls: Object.fromEntries(ev.halls.map((h) => [h.hallId, h.layout])) as Record<string, string>,
  };
  const [f, setF] = useState(initial);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const [conflict, setConflict] = useState<string | null>(null);
  const save = useAction((body: Record<string, unknown>) => eventApi.update(ev.id, body), () => evInvalidate(ev.id), () => toast.success('Đã lưu thông tin tiệc'));
  const submit = () => {
    const body: Record<string, unknown> = {};
    const strFields = ['contactName', 'contactPhone', 'eventDate', 'startTime', 'endTime'] as const;
    for (const k of strFields) if (f[k] !== initial[k]) body[k] = f[k].trim();
    if (f.kind !== initial.kind) body.kind = f.kind;
    if (f.beveragePolicy !== initial.beveragePolicy) body.beveragePolicy = f.beveragePolicy;
    const optional = ['contactEmail', 'companyName', 'taxCode', 'beverageNotes', 'notes', 'internalNotes'] as const;
    // Trường tùy chọn bị xóa trắng gửi null để API xóa giá trị cũ
    for (const k of optional) if (f[k] !== initial[k]) body[k] = emptyToNull(f[k]);
    if (f.expectedTables !== initial.expectedTables) body.expectedTables = f.expectedTables;
    if (f.guestsPerTable !== initial.guestsPerTable) body.guestsPerTable = f.guestsPerTable;
    if (f.expectedGuests !== initial.expectedGuests) body.expectedGuests = f.expectedGuests;
    if (JSON.stringify(f.halls) !== JSON.stringify(initial.halls)) body.halls = Object.entries(f.halls).map(([hallId, layout]) => ({ hallId, layout }));
    if (Object.keys(body).length === 0) return toast.info('Không có thay đổi');
    setConflict(null);
    save.mutate(body, {
      onError: (e) => {
        if (e instanceof ApiError && e.code === 'HALL_CONFLICT') setConflict(e.message);
        else onErr(e);
      },
    });
  };
  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_340px]">
      <Card title="Thông tin tiệc" actions={!locked && <Button size="sm" onClick={submit} loading={save.isPending}>Lưu thay đổi</Button>}>
        <fieldset disabled={locked} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Loại tiệc" value={f.kind} onChange={(e) => set('kind', e.target.value as EventKind)}>
              {(Object.keys(EVENT_KIND_LABELS) as EventKind[]).map((k) => (
                <option key={k} value={k}>
                  {EVENT_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
            <Select label="Chính sách đồ uống" value={f.beveragePolicy} onChange={(e) => set('beveragePolicy', e.target.value as typeof f.beveragePolicy)}>
              {Object.entries(BEVERAGE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
            <Input label="Người liên hệ" value={f.contactName} onChange={(e) => set('contactName', e.target.value)} />
            <Input label="Số điện thoại" value={f.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} />
            <Input label="Email" value={f.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} />
            <Input label="Công ty" value={f.companyName} onChange={(e) => set('companyName', e.target.value)} />
            <Input label="Mã số thuế" value={f.taxCode} onChange={(e) => set('taxCode', e.target.value)} />
            <Input label="Ngày tổ chức" type="date" value={f.eventDate} onChange={(e) => set('eventDate', e.target.value)} />
            <Input label="Giờ bắt đầu" type="time" value={f.startTime} onChange={(e) => set('startTime', e.target.value)} />
            <Input label="Giờ kết thúc" type="time" value={f.endTime} onChange={(e) => set('endTime', e.target.value)} />
            <NumberInput label="Số mâm dự kiến" value={f.expectedTables} onChange={(v) => set('expectedTables', v ?? 0)} min={0} step={1} />
            <NumberInput label="Khách mỗi mâm" value={f.guestsPerTable} onChange={(v) => set('guestsPerTable', v ?? 10)} min={1} step={1} />
            <NumberInput label="Tổng khách dự kiến" value={f.expectedGuests} onChange={(v) => set('expectedGuests', v)} min={0} step={1} hint="Để trống nếu chưa rõ" />
            <Input label="Ghi chú đồ uống" value={f.beverageNotes} onChange={(e) => set('beverageNotes', e.target.value)} />
          </div>
          <div>
            <div className="mb-1 text-sm font-semibold text-ink-700">Sảnh</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {(halls.data ?? []).map((h) => {
                const on = h.id in f.halls;
                return (
                  <div key={h.id} className={cn('rounded-xl border p-2', on ? 'border-brand-700 bg-brand-50' : 'border-ink-100')}>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-brand-700"
                        checked={on}
                        onChange={(e) => {
                          const n = { ...f.halls };
                          if (e.target.checked) n[h.id] = Object.keys(h.capacityByLayout)[0] ?? 'round10';
                          else delete n[h.id];
                          set('halls', n);
                        }}
                      />
                      <span className="font-semibold">{h.name}</span>
                    </label>
                    {on && (
                      <select value={f.halls[h.id]} onChange={(e) => set('halls', { ...f.halls, [h.id]: e.target.value })} className="mt-1 min-h-[40px] w-full rounded-lg border border-ink-300 bg-white px-2 text-sm">
                        {Object.entries(h.capacityByLayout).map(([k, v]) => (
                          <option key={k} value={k}>
                            {LAYOUT_LABELS[k] ?? k} · tối đa {v}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <Textarea label="Yêu cầu của khách" value={f.notes} onChange={(e) => set('notes', e.target.value)} />
          <Textarea label="Ghi chú nội bộ" value={f.internalNotes} onChange={(e) => set('internalNotes', e.target.value)} />
          {conflict && <ErrorBox error={new Error(conflict)} />}
        </fieldset>
      </Card>
      <Card title="Lịch sử">
        <ol className="space-y-2 text-sm">
          {[...(ev.timeline ?? [])].reverse().map((t, i) => (
            <li key={i} className="border-l-2 border-brand-200 pl-3">
              <div className="text-xs text-ink-500">{vnDateTime(t.at)}</div>
              <div>
                {t.status && <Badge tone={EVENT_STATUS[t.status as keyof typeof EVENT_STATUS]?.tone ?? 'neutral'} className="mr-1">{EVENT_STATUS[t.status as keyof typeof EVENT_STATUS]?.label ?? t.status}</Badge>}
                {t.note}
              </div>
            </li>
          ))}
        </ol>
        {ev.customer && (
          <div className="mt-3 rounded-xl bg-paper p-2 text-sm">
            Hồ sơ khách: <b>{ev.customer.fullName ?? ev.contactName}</b> · {phoneDisplay(ev.customer.phone)}
          </div>
        )}
      </Card>
    </div>
  );
}

// ───────────────────────── Thực đơn theo mâm ─────────────────────────

interface MenuLineDraft {
  itemId?: string;
  name: string;
  quantityPerTable: number;
  unit: string;
  note: string;
}
interface MenuDraft {
  name: string;
  pricePerTable: number;
  tables: number;
  notes: string;
  isFinal: boolean;
  lines: MenuLineDraft[];
}

export function MenusTab({ ev, canManage }: TabProps) {
  const items = useMenuItems();
  const editable = canManage && EDITABLE_MENU.includes(ev.status);
  const [menus, setMenus] = useState<MenuDraft[]>(() =>
    ev.menus.length
      ? ev.menus.map((m) => ({ name: m.name, pricePerTable: m.pricePerTable, tables: m.tables, notes: m.notes ?? '', isFinal: m.isFinal, lines: m.lines.map((l) => ({ itemId: l.itemId ?? undefined, name: l.nameSnapshot, quantityPerTable: l.quantityPerTable, unit: l.unit ?? '', note: l.note ?? '' })) }))
      : [{ name: 'Set tiệc A', pricePerTable: 0, tables: ev.confirmedTables ?? ev.expectedTables, notes: '', isFinal: false, lines: [] }],
  );
  const [search, setSearch] = useState<Record<number, string>>({});
  const save = useAction(() => eventApi.menus(ev.id, menus.map((m) => ({ name: m.name.trim(), pricePerTable: m.pricePerTable, tables: m.tables, notes: m.notes.trim() || undefined, isFinal: m.isFinal, lines: m.lines.map((l) => ({ itemId: l.itemId, name: l.name.trim() || undefined, quantityPerTable: l.quantityPerTable, unit: l.unit.trim() || undefined, note: l.note.trim() || undefined })) }))), () => evInvalidate(ev.id), () => toast.success('Đã lưu thực đơn tiệc'));
  const upd = (i: number, patch: Partial<MenuDraft>) => setMenus((ms) => ms.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const updLine = (i: number, li: number, patch: Partial<MenuLineDraft>) => upd(i, { lines: menus[i]!.lines.map((l, k) => (k === li ? { ...l, ...patch } : l)) });
  const subtotal = menus.reduce((s, m) => s + m.pricePerTable * m.tables, 0);
  const valid = menus.length > 0 && menus.every((m) => m.name.trim() && m.lines.every((l) => l.itemId || l.name.trim()));

  return (
    <div className="space-y-3">
      {!editable && <p className="rounded-xl bg-ink-100 px-3 py-2 text-sm text-ink-700">Thực đơn chỉ sửa được trước khi tiệc diễn ra.</p>}
      {menus.map((m, i) => {
        const q = fold(search[i] ?? '');
        const matches = q ? items.filter((it) => fold(it.name).includes(q)).slice(0, 8) : [];
        return (
          <Card
            key={i}
            title={`${m.name || 'Set mới'} · ${money(m.pricePerTable)}/mâm × ${m.tables} mâm`}
            actions={
              editable &&
              menus.length > 1 && (
                <button type="button" onClick={() => setMenus((ms) => ms.filter((_, j) => j !== i))} className="flex h-10 w-10 items-center justify-center rounded-lg text-red-700 hover:bg-red-50" aria-label="Xóa set">
                  <Trash2 className="h-5 w-5" />
                </button>
              )
            }
          >
            <fieldset disabled={!editable} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-4">
                <Input label="Tên set" value={m.name} onChange={(e) => upd(i, { name: e.target.value })} className="sm:col-span-2" />
                <MoneyInput label="Giá mỗi mâm" value={m.pricePerTable} onChange={(v) => upd(i, { pricePerTable: v ?? 0 })} />
                <NumberInput label="Số mâm" value={m.tables} onChange={(v) => upd(i, { tables: Math.max(0, Math.round(v ?? 0)) })} min={0} step={1} />
              </div>
              <Input label="Ghi chú set" value={m.notes} onChange={(e) => upd(i, { notes: e.target.value })} />
              <Checkbox label="Bản chốt cuối" checked={m.isFinal} onChange={(v) => upd(i, { isFinal: v })} />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="text-left text-xs text-ink-500 uppercase">
                    <tr>
                      <th className="py-1">Món</th>
                      <th className="w-24 py-1">SL/mâm</th>
                      <th className="w-24 py-1">Đơn vị</th>
                      <th className="py-1">Ghi chú</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {m.lines.map((l, li) => (
                      <tr key={li} className="border-t border-ink-100">
                        <td className="py-1 pr-2">
                          <input value={l.name} onChange={(e) => updLine(i, li, { name: e.target.value })} className="min-h-[40px] w-full rounded-lg border border-ink-300 px-2" />
                          {l.itemId && <span className="text-[11px] text-emerald-700">Món trong thực đơn</span>}
                        </td>
                        <td className="py-1 pr-2">
                          <input type="number" min={0} step="any" value={l.quantityPerTable} onChange={(e) => updLine(i, li, { quantityPerTable: Number(e.target.value) || 0 })} className="min-h-[40px] w-full rounded-lg border border-ink-300 px-2" />
                        </td>
                        <td className="py-1 pr-2">
                          <input value={l.unit} onChange={(e) => updLine(i, li, { unit: e.target.value })} className="min-h-[40px] w-full rounded-lg border border-ink-300 px-2" />
                        </td>
                        <td className="py-1 pr-2">
                          <input value={l.note} onChange={(e) => updLine(i, li, { note: e.target.value })} className="min-h-[40px] w-full rounded-lg border border-ink-300 px-2" />
                        </td>
                        <td>
                          <button type="button" onClick={() => upd(i, { lines: m.lines.filter((_, k) => k !== li) })} className="flex h-10 w-10 items-center justify-center text-red-700" aria-label="Xóa món">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {editable && (
                <div className="relative">
                  <div className="flex gap-2">
                    <Input value={search[i] ?? ''} onChange={(e) => setSearch((s) => ({ ...s, [i]: e.target.value }))} placeholder="Tìm món trong thực đơn để thêm..." />
                    <Button variant="outline" onClick={() => upd(i, { lines: [...m.lines, { name: search[i] ?? '', quantityPerTable: 1, unit: 'đĩa', note: '' }] })}>
                      <Plus className="h-5 w-5" /> Dòng tự nhập
                    </Button>
                  </div>
                  {matches.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-ink-100 bg-white shadow-lg">
                      {matches.map((it) => (
                        <button
                          key={it.id}
                          type="button"
                          className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-paper"
                          onClick={() => {
                            upd(i, { lines: [...m.lines, { itemId: it.id, name: it.name, quantityPerTable: 1, unit: it.unit, note: '' }] });
                            setSearch((s) => ({ ...s, [i]: '' }));
                          }}
                        >
                          <span>{it.name}</span>
                          <span className="text-xs text-ink-500">{it.category}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </fieldset>
          </Card>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        {editable && (
          <Button variant="outline" onClick={() => setMenus((ms) => [...ms, { name: `Set tiệc ${String.fromCharCode(65 + ms.length)}`, pricePerTable: 0, tables: 0, notes: '', isFinal: false, lines: [] }])} disabled={menus.length >= 10}>
            <Plus className="h-5 w-5" /> Thêm set (phương án)
          </Button>
        )}
        <span className="ml-auto text-sm text-ink-700">
          Tiền thực đơn: <b className="tabular-nums">{money(subtotal)}</b>
        </span>
        {editable && (
          <Button onClick={() => save.mutate(undefined, { onError: onErr })} loading={save.isPending} disabled={!valid}>
            Lưu thực đơn
          </Button>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Dịch vụ ─────────────────────────

interface ServiceDraft {
  catalogId?: string;
  name: string;
  unitPrice: number;
  quantity: number;
  note: string;
  isIncluded: boolean;
}

export function ServicesTab({ ev, canManage }: TabProps) {
  const catalog = useServiceCatalog();
  const editable = canManage && EDITABLE_MENU.includes(ev.status);
  const [rows, setRows] = useState<ServiceDraft[]>(() => ev.services.map((s) => ({ catalogId: s.catalogId ?? undefined, name: s.name, unitPrice: s.unitPrice, quantity: s.quantity, note: s.note ?? '', isIncluded: s.isIncluded })));
  const save = useAction(() => eventApi.services(ev.id, rows.map((r) => ({ catalogId: r.catalogId, name: r.name.trim() || undefined, unitPrice: r.unitPrice, quantity: r.quantity, note: r.note.trim() || undefined, isIncluded: r.isIncluded }))), () => evInvalidate(ev.id), () => toast.success('Đã lưu dịch vụ'));
  const upd = (i: number, patch: Partial<ServiceDraft>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const groups = useMemo(() => {
    const m = new Map<string, NonNullable<typeof catalog.data>>();
    for (const c of catalog.data ?? []) if (c.isActive) m.set(c.category, [...(m.get(c.category) ?? []), c]);
    return [...m.entries()];
  }, [catalog.data]);
  const total = rows.filter((r) => !r.isIncluded).reduce((s, r) => s + Math.round(r.unitPrice * r.quantity), 0);
  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
      <Card title="Dịch vụ kèm theo" actions={<span className="text-sm font-semibold tabular-nums">{money(total)}</span>}>
        {rows.length === 0 && <p className="py-4 text-center text-sm text-ink-500">Chưa có dịch vụ. Chọn từ danh mục bên cạnh.</p>}
        <fieldset disabled={!editable} className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 rounded-xl border border-ink-100 p-2 sm:grid-cols-[1fr_140px_90px_auto]">
              <Input value={r.name} onChange={(e) => upd(i, { name: e.target.value })} aria-label="Tên dịch vụ" className="col-span-2 sm:col-span-1" />
              <MoneyInput value={r.unitPrice} onChange={(v) => upd(i, { unitPrice: v ?? 0 })} />
              <NumberInput value={r.quantity} onChange={(v) => upd(i, { quantity: v ?? 1 })} min={0} />
              <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={r.isIncluded} onChange={(e) => upd(i, { isIncluded: e.target.checked })} className="h-5 w-5 accent-brand-700" /> Tặng kèm
                </label>
                <button type="button" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="ml-auto flex h-10 w-10 items-center justify-center text-red-700" aria-label="Xóa dịch vụ">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <Input value={r.note} onChange={(e) => upd(i, { note: e.target.value })} placeholder="Ghi chú" className="col-span-2 sm:col-span-4" />
              <div className="col-span-2 text-right text-sm text-ink-700 sm:col-span-4">= {r.isIncluded ? 'Tặng kèm (0đ)' : money(Math.round(r.unitPrice * r.quantity))}</div>
            </div>
          ))}
        </fieldset>
        {editable && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setRows((rs) => [...rs, { name: 'Dịch vụ khác', unitPrice: 0, quantity: 1, note: '', isIncluded: false }])}>
              <Plus className="h-5 w-5" /> Dịch vụ tự nhập
            </Button>
            <Button className="ml-auto" onClick={() => save.mutate(undefined, { onError: onErr })} loading={save.isPending} disabled={rows.some((r) => !r.name.trim())}>
              Lưu dịch vụ
            </Button>
          </div>
        )}
      </Card>
      <Card title="Danh mục dịch vụ" bodyClassName="p-2">
        <div className="max-h-[60vh] space-y-3 overflow-y-auto">
          {groups.map(([cat, list]) => (
            <div key={cat}>
              <div className="px-2 text-xs font-semibold text-ink-500 uppercase">{cat}</div>
              {list.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={!editable}
                  onClick={() => {
                    const idx = rows.findIndex((r) => r.catalogId === c.id);
                    if (idx >= 0) upd(idx, { quantity: rows[idx]!.quantity + 1 });
                    else setRows((rs) => [...rs, { catalogId: c.id, name: c.name, unitPrice: c.price, quantity: 1, note: '', isIncluded: false }]);
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm hover:bg-paper disabled:opacity-50"
                >
                  <span>{c.name}</span>
                  <span className="text-ink-500 tabular-nums">
                    {moneyPlain(c.price)}/{c.unit}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ───────────────────────── Báo giá ─────────────────────────

const QUOTE_STATUS: Record<string, { label: string; tone: 'neutral' | 'info' | 'success' | 'danger' }> = {
  DRAFT: { label: 'Nháp', tone: 'neutral' },
  SENT: { label: 'Đã gửi khách', tone: 'info' },
  ACCEPTED: { label: 'Khách đồng ý', tone: 'success' },
  REJECTED: { label: 'Khách từ chối', tone: 'danger' },
  SUPERSEDED: { label: 'Đã thay bằng bản mới', tone: 'neutral' },
};

export function QuoteTab({ ev, canManage }: TabProps) {
  const [discount, setDiscount] = useState<number | null>(ev.discountAmount);
  const [scPct, setScPct] = useState<number | null>(ev.serviceChargeBps / 100);
  const [vatPct, setVatPct] = useState<number | null>(ev.vatBps / 100);
  const [validUntil, setValidUntil] = useState('');
  const [terms, setTerms] = useState(ev.quotes[0]?.payload.terms ?? 'Báo giá đã bao gồm VAT. Cọc 30% khi ký hợp đồng, 40% trước ngày tiệc 7 ngày, phần còn lại thanh toán sau tiệc.');
  const allowed = canManage && ['LEAD', 'QUOTED'].includes(ev.status);
  const preview = computeEventTotals({
    menus: ev.menus.map((m) => ({ pricePerTable: m.pricePerTable, tables: m.tables })),
    services: ev.services.map((s) => ({ unitPrice: s.unitPrice, quantity: s.quantity, isIncluded: s.isIncluded })),
    adjustments: ev.adjustments.map((a) => ({ amount: a.amount })),
    discountAmount: discount ?? 0,
    serviceChargeBps: Math.round((scPct ?? 0) * 100),
    vatBps: Math.round((vatPct ?? 0) * 100),
    priceIncludesVat: true,
  });
  const quote = useAction(
    () => eventApi.quote(ev.id, { discountAmount: discount ?? 0, serviceChargeBps: Math.round((scPct ?? 0) * 100), vatBps: Math.round((vatPct ?? 0) * 100), ...(validUntil ? { validUntil } : {}), ...(terms.trim() ? { terms: terms.trim() } : {}) }),
    () => evInvalidate(ev.id),
    (r) => toast.success(`Đã tạo báo giá v${r.event.quotes[0]?.version ?? ''}`),
  );
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card title="Lập báo giá">
        {ev.menus.length === 0 && <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">Thêm thực đơn tiệc trước khi báo giá.</p>}
        <fieldset disabled={!allowed} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <MoneyInput label="Giảm giá" value={discount} onChange={setDiscount} />
            <NumberInput label="Phí phục vụ" value={scPct} onChange={setScPct} min={0} suffix="%" />
            <NumberInput label="VAT (đã gồm trong giá)" value={vatPct} onChange={setVatPct} min={0} suffix="%" />
          </div>
          <Input label="Hiệu lực đến" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          <Textarea label="Điều khoản" value={terms} onChange={(e) => setTerms(e.target.value)} />
        </fieldset>
        <div className="mt-3 rounded-xl border border-ink-100 bg-paper px-3 py-2 text-sm">
          <Row label="Thực đơn" value={moneyPlain(preview.subtotalMenu)} />
          <Row label="Dịch vụ" value={moneyPlain(preview.subtotalServices)} />
          {preview.adjustmentsTotal !== 0 && <Row label="Phát sinh" value={moneyPlain(preview.adjustmentsTotal)} />}
          {preview.discountAmount > 0 && <Row label="Giảm giá" value={`-${moneyPlain(preview.discountAmount)}`} />}
          {preview.serviceChargeAmount > 0 && <Row label={`Phí phục vụ ${bpsLabel(Math.round((scPct ?? 0) * 100))}`} value={moneyPlain(preview.serviceChargeAmount)} />}
          <Row label={`Trong đó VAT ${bpsLabel(Math.round((vatPct ?? 0) * 100))}`} value={moneyPlain(preview.vatAmount)} className="text-ink-500" />
          <Row label="Tổng báo giá" value={money(preview.total)} bold className="border-t border-ink-100 pt-2" />
        </div>
        {allowed && (
          <Button block className="mt-3" onClick={() => quote.mutate(undefined, { onError: onErr })} loading={quote.isPending} disabled={ev.menus.length === 0}>
            Tạo báo giá v{ev.quotes.length + 1}
          </Button>
        )}
        {!allowed && <p className="mt-3 text-sm text-ink-500">Chỉ lập báo giá khi tiệc ở trạng thái “Yêu cầu mới” hoặc “Đã báo giá”.</p>}
      </Card>
      <Card title="Các phiên bản báo giá">
        {ev.quotes.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-500">Chưa có báo giá.</p>
        ) : (
          <ul className="space-y-2">
            {ev.quotes.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-ink-100 p-3">
                <span className="text-lg font-black">v{q.version}</span>
                <Badge tone={QUOTE_STATUS[q.status]?.tone ?? 'neutral'}>{QUOTE_STATUS[q.status]?.label ?? q.status}</Badge>
                <span className="text-sm text-ink-500">{vnDateTime(q.sentAt ?? q.createdAt)}</span>
                <span className="ml-auto font-bold tabular-nums">{money(q.total)}</span>
                <a href={`/events/${ev.id}/print/quote?v=${q.version}`} target="_blank" rel="noreferrer" className="min-h-[40px] rounded-xl border border-ink-300 px-3 py-2 text-sm font-semibold hover:bg-ink-100">
                  In / PDF
                </a>
                <div className="w-full text-xs text-ink-500">
                  {q.payload.menus.map((m) => `${m.name}: ${qty(m.tables)} mâm × ${moneyPlain(m.pricePerTable)}`).join(' · ')}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

