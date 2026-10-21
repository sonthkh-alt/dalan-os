'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, PartyPopper, Plus, Search } from 'lucide-react';
import { EVENT_KIND_LABELS } from '@dalan/contracts';
import { ApiError, errorMessage } from '@/lib/api';
import { useBranchId, useCan } from '@/lib/auth-store';
import { useAction } from '@/lib/queries';
import { eventApi, opsKeys, useEvents, useEventsSummary, useHallCalendar, useHalls, type EventKind, type EventListItem, type HallCalendarRow } from '@/lib/queries-ops';
import { addDays, dateLabel, dayMonth, emptyToUndef, endOfMonth, startOfMonth, startOfWeek, vnToday, weekdayLabel } from '@/lib/ops-utils';
import { cn, money, moneyShort } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Badge, EmptyState, Input, Loading, Segmented, Select, Textarea } from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';
import { Checkbox, ErrorBox, NumberInput, PageHeader, Stat, TabBar, Table, useDebounced } from '@/components/ops/ui';
import { BEVERAGE_LABELS, EVENT_STATUS, LAYOUT_LABELS, PIPELINE } from './labels';

type Tab = 'pipeline' | 'calendar' | 'list';

export function EventsScreen() {
  const [tab, setTab] = useState<Tab>('pipeline');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const ds = useDebounced(search, 300);
  const events = useEvents(ds);
  const summary = useEventsSummary();
  const canManage = useCan('event.manage');
  const list = events.data ?? [];

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Tiệc và sự kiện"
        subtitle="Từ yêu cầu, báo giá, hợp đồng tới BEO và quyết toán"
        actions={
          canManage && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-5 w-5" /> Tạo tiệc
            </Button>
          )
        }
      />
      <TabBar
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'pipeline', label: 'Quy trình' },
          { value: 'calendar', label: 'Lịch sảnh' },
          { value: 'list', label: 'Danh sách' },
        ]}
      />
      <div className="space-y-3 p-3 md:p-4">
        {summary.data && (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stat label="Tiệc 7 ngày tới" value={summary.data.upcoming.next7Days} tone="brand" />
            <Stat label="Tiệc 30 ngày tới" value={summary.data.upcoming.next30Days} />
            <Stat label="Tỷ lệ chốt 30 ngày" value={summary.data.conversion.rate === null ? '—' : `${summary.data.conversion.rate}%`} hint={`${summary.data.conversion.contracted}/${summary.data.conversion.leads} yêu cầu`} />
            <Stat label="Cọc quá hạn" value={summary.data.overdueDeposits.length} tone={summary.data.overdueDeposits.length ? 'danger' : 'neutral'} hint={summary.data.overdueDeposits.length ? money(summary.data.overdueDeposits.reduce((s, d) => s + d.amount, 0)) : undefined} />
          </div>
        )}
        {summary.data && summary.data.overdueDeposits.length > 0 && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
            <b>Cọc quá hạn:</b> {summary.data.overdueDeposits.map((d) => `${d.eventCode} (${d.contactName}) · ${d.label} ${money(d.amount)} hạn ${dayMonth(d.dueDate)}`).join('; ')}
          </div>
        )}
        {tab !== 'calendar' && (
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-ink-300" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Mã tiệc, tên liên hệ, số điện thoại, công ty" className="pl-10" />
          </div>
        )}
        <ErrorBox error={events.error} />
        {tab === 'calendar' ? <HallCalendar /> : events.isLoading ? <Loading /> : tab === 'pipeline' ? <Pipeline list={list} /> : <EventTable list={list} />}
      </div>
      {createOpen && <CreateEventDialog onClose={() => setCreateOpen(false)} />}
    </div>
  );
}

function EventCard({ e }: { e: EventListItem }) {
  const tables = e.confirmedTables ?? e.expectedTables;
  return (
    <Link href={`/events/${e.id}`} className="block rounded-xl bg-white p-3 shadow-card ring-1 ring-ink-900/[0.06] transition hover:-translate-y-0.5 hover:shadow-raised hover:ring-brand-300">
      <div className="flex items-center gap-1.5 text-xs text-ink-500">
        <span className="font-mono">{e.code}</span>
        <span className="ml-auto">{EVENT_KIND_LABELS[e.kind]}</span>
      </div>
      <div className="mt-0.5 truncate font-bold">{e.companyName ?? e.contactName}</div>
      <div className="text-sm text-ink-700">
        {dateLabel(e.eventDate, false)} · {e.startTime}–{e.endTime}
      </div>
      <div className="text-sm text-ink-700">
        {tables} mâm{e.halls.length ? ` · ${e.halls.map((h) => h.hall.name).join(', ')}` : ''}
      </div>
      <div className="mt-1 flex items-center gap-2 text-sm">
        {e.total > 0 && <span className="font-semibold tabular-nums">{moneyShort(e.total)}</span>}
        {e.paidTotal > 0 && <span className="text-emerald-700 tabular-nums">đã thu {moneyShort(e.paidTotal)}</span>}
        {e.holdExpiresAt && ['LEAD', 'QUOTED'].includes(e.status) && <Badge tone="warning">Giữ chỗ tạm</Badge>}
      </div>
    </Link>
  );
}

function Pipeline({ list }: { list: EventListItem[] }) {
  const [showCancelled, setShowCancelled] = useState(false);
  const cancelled = list.filter((e) => e.status === 'CANCELLED');
  return (
    <div className="space-y-2">
      <div className="scrollbar-thin flex gap-3 overflow-x-auto pb-2">
        {PIPELINE.map((s) => {
          const items = list.filter((e) => e.status === s);
          return (
            <div key={s} className={cn('flex w-64 shrink-0 flex-col rounded-2xl border border-t-4 border-ink-100 bg-paper', EVENT_STATUS[s].column)}>
              <div className="flex items-center justify-between px-3 py-2">
                <span className="font-bold">{EVENT_STATUS[s].label}</span>
                <Badge>{items.length}</Badge>
              </div>
              <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto px-2 pb-2">
                {items.map((e) => (
                  <EventCard key={e.id} e={e} />
                ))}
                {items.length === 0 && <p className="px-1 py-4 text-center text-xs text-ink-500">Trống</p>}
              </div>
            </div>
          );
        })}
      </div>
      {cancelled.length > 0 && (
        <div>
          <button type="button" className="text-sm font-semibold text-ink-500 underline" onClick={() => setShowCancelled((v) => !v)}>
            {showCancelled ? 'Ẩn' : 'Xem'} {cancelled.length} tiệc đã hủy
          </button>
          {showCancelled && (
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {cancelled.map((e) => (
                <EventCard key={e.id} e={e} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EventTable({ list }: { list: EventListItem[] }) {
  const router = useRouter();
  if (list.length === 0) return <EmptyState icon={PartyPopper} title="Chưa có tiệc" hint="Tạo tiệc mới từ yêu cầu của khách để bắt đầu quy trình báo giá, hợp đồng và BEO." />;
  return (
    <Table head={['Ngày', 'Mã', 'Loại', 'Khách', 'Sảnh', 'Mâm', 'Tổng', 'Đã thu', 'Trạng thái']}>
      {list.map((e) => (
        <tr key={e.id} className="cursor-pointer hover:bg-paper" onClick={() => router.push(`/events/${e.id}`)}>
          <td className="px-3 py-2 whitespace-nowrap">
            {dateLabel(e.eventDate, false)} {e.startTime}
          </td>
          <td className="px-3 py-2 font-mono">{e.code}</td>
          <td className="px-3 py-2">{EVENT_KIND_LABELS[e.kind]}</td>
          <td className="px-3 py-2">{e.companyName ?? e.contactName}</td>
          <td className="px-3 py-2">{e.halls.map((h) => h.hall.name).join(', ') || '—'}</td>
          <td className="px-3 py-2 tabular-nums">{e.confirmedTables ?? e.expectedTables}</td>
          <td className="px-3 py-2 text-right tabular-nums">{moneyShort(e.total)}</td>
          <td className="px-3 py-2 text-right tabular-nums">{moneyShort(e.paidTotal)}</td>
          <td className="px-3 py-2">
            <Badge tone={EVENT_STATUS[e.status].tone}>{EVENT_STATUS[e.status].label}</Badge>
          </td>
        </tr>
      ))}
    </Table>
  );
}

// ───────────────────────── Lịch sảnh ─────────────────────────

type Booking = HallCalendarRow['bookings'][number];

function bookingStyle(b: Booking): { cls: string; label: string } {
  if (b.holdExpired) return { cls: 'border-dashed border-ink-300 bg-white text-ink-500', label: 'Hết hạn giữ chỗ' };
  if (b.isTentative) return { cls: 'border-dashed border-amber-500 bg-amber-50 text-amber-900', label: 'Giữ chỗ tạm' };
  if (b.status === 'CONTRACTED') return { cls: 'border-brand-600 bg-brand-50 text-brand-900', label: 'Đã ký' };
  if (['CONFIRMED', 'BEO_ISSUED', 'IN_PROGRESS'].includes(b.status)) return { cls: 'border-emerald-600 bg-emerald-50 text-emerald-900', label: 'Đã chốt' };
  return { cls: 'border-ink-300 bg-ink-100 text-ink-700', label: EVENT_STATUS[b.status].label };
}

function HallCalendar() {
  const [mode, setMode] = useState<'month' | 'week'>('month');
  const [anchor, setAnchor] = useState(vnToday());
  const from = mode === 'month' ? startOfWeek(startOfMonth(anchor)) : startOfWeek(anchor);
  const to = mode === 'month' ? addDays(startOfWeek(endOfMonth(anchor)), 6) : addDays(from, 6);
  const cal = useHallCalendar(from, to);
  const days = useMemo(() => {
    const out: string[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
    return out;
  }, [from, to]);
  const rows = cal.data ?? [];
  const byDay = useMemo(() => {
    const m = new Map<string, { hall: string; b: Booking }[]>();
    for (const r of rows) for (const b of r.bookings) m.set(b.eventDate, [...(m.get(b.eventDate) ?? []), { hall: r.hall.name, b }]);
    for (const v of m.values()) v.sort((x, y) => x.b.startTime.localeCompare(y.b.startTime));
    return m;
  }, [rows]);
  const move = (dir: number) => setAnchor(mode === 'month' ? (dir > 0 ? addDays(endOfMonth(anchor), 1) : startOfMonth(addDays(startOfMonth(anchor), -1))) : addDays(anchor, dir * 7));
  const today = vnToday();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-xl bg-white p-1 shadow-card ring-1 ring-ink-900/[0.06]">
          <button type="button" className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-ink-100" onClick={() => move(-1)} aria-label="Trước">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="min-w-[150px] text-center font-semibold">{mode === 'month' ? `Tháng ${anchor.slice(5, 7)}/${anchor.slice(0, 4)}` : `${dayMonth(from)} – ${dayMonth(to)}`}</span>
          <button type="button" className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-ink-100" onClick={() => move(1)} aria-label="Sau">
            <ChevronRight className="h-5 w-5" />
          </button>
          <button type="button" className="min-h-[40px] rounded-lg px-3 text-sm font-semibold text-brand-800 hover:bg-brand-50" onClick={() => setAnchor(today)}>
            Hôm nay
          </button>
        </div>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'month', label: 'Tháng' },
            { value: 'week', label: 'Tuần' },
          ]}
        />
        <div className="flex flex-wrap gap-2 text-xs">
          {[
            ['border-dashed border-amber-500 bg-amber-50', 'Giữ chỗ tạm (48 giờ)'],
            ['border-brand-600 bg-brand-50', 'Đã ký hợp đồng'],
            ['border-emerald-600 bg-emerald-50', 'Đã chốt / BEO'],
            ['border-ink-300 bg-ink-100', 'Đã quyết toán'],
          ].map(([cls, label]) => (
            <span key={label} className="flex items-center gap-1">
              <span className={cn('h-3 w-5 rounded border-2', cls)} /> {label}
            </span>
          ))}
        </div>
      </div>
      <ErrorBox error={cal.error} />
      {cal.isLoading ? (
        <Loading />
      ) : mode === 'month' ? (
        <div className="overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-ink-900/[0.06]">
          <div className="grid grid-cols-7 border-b border-ink-100 bg-paper text-center text-xs font-semibold text-ink-500">
            {days.slice(0, 7).map((d) => (
              <div key={d} className="py-2">
                {weekdayLabel(d, true)}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const items = byDay.get(d) ?? [];
              const out = d.slice(0, 7) !== anchor.slice(0, 7);
              return (
                <div key={d} className={cn('min-h-[96px] border-r border-b border-ink-100 p-1', out && 'bg-paper/60 text-ink-300', d === today && 'bg-gold-100/50')}>
                  <div className={cn('mb-1 text-xs font-bold', d === today && 'text-brand-800')}>{Number(d.slice(8))}</div>
                  <div className="space-y-1">
                    {items.map(({ hall, b }) => (
                      <Link key={`${b.id}-${hall}`} href={`/events/${b.id}`} className={cn('block truncate rounded border-l-4 border px-1 py-0.5 text-[11px] leading-tight', bookingStyle(b).cls)} title={`${b.code} · ${hall} · ${b.startTime}-${b.endTime} · ${bookingStyle(b).label}`}>
                        <b>{b.startTime}</b> {hall} · {b.contactName}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="scrollbar-thin overflow-x-auto rounded-2xl bg-white shadow-card ring-1 ring-ink-900/[0.06]">
          <div className="grid min-w-[900px] grid-cols-[160px_repeat(7,1fr)]">
            <div className="border-b border-ink-100 bg-paper" />
            {days.map((d) => (
              <div key={d} className={cn('border-b border-l border-ink-100 bg-paper py-2 text-center text-xs font-semibold', d === today && 'text-brand-800')}>
                {weekdayLabel(d, true)} {dayMonth(d)}
              </div>
            ))}
            {rows.map((r) => (
              <div key={r.hall.id} className="contents">
                <div className="border-b border-ink-100 px-3 py-2">
                  <div className="font-bold">{r.hall.name}</div>
                  <div className="text-xs text-ink-500">
                    {Object.entries(r.hall.capacityByLayout)
                      .map(([k, v]) => `${LAYOUT_LABELS[k] ?? k}: ${v}`)
                      .join(' · ')}
                  </div>
                  <div className="text-xs text-ink-500">Dọn {r.hall.turnoverMinutes} phút</div>
                </div>
                {days.map((d) => (
                  <div key={d} className="min-h-[80px] space-y-1 border-b border-l border-ink-100 p-1">
                    {r.bookings
                      .filter((b) => b.eventDate === d)
                      .map((b) => (
                        <Link key={b.id} href={`/events/${b.id}`} className={cn('block rounded border-l-4 border px-1.5 py-1 text-xs', bookingStyle(b).cls)}>
                          <div className="font-bold">
                            {b.startTime}–{b.endTime}
                          </div>
                          <div className="truncate">{b.contactName}</div>
                          <div className="truncate text-[11px]">
                            {b.confirmedTables ?? b.expectedTables} mâm · {bookingStyle(b).label}
                          </div>
                        </Link>
                      ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
          {rows.length === 0 && <EmptyState title="Cơ sở chưa có sảnh tiệc" />}
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Tạo tiệc ─────────────────────────

export function CreateEventDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const branchId = useBranchId();
  const halls = useHalls();
  const [kind, setKind] = useState<EventKind>('WEDDING');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [taxCode, setTaxCode] = useState('');
  const [eventDate, setEventDate] = useState(addDays(vnToday(), 30));
  const [startTime, setStartTime] = useState('18:00');
  const [endTime, setEndTime] = useState('21:00');
  const [selHalls, setSelHalls] = useState<Record<string, string>>({});
  const [holdHalls, setHoldHalls] = useState(true);
  const [expectedTables, setExpectedTables] = useState<number | null>(30);
  const [guestsPerTable, setGuestsPerTable] = useState<number | null>(10);
  const [beveragePolicy, setBeveragePolicy] = useState('ACTUAL');
  const [notes, setNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [conflict, setConflict] = useState<string | null>(null);
  const create = useAction((body: Record<string, unknown>) => eventApi.create(branchId, body), () => [opsKeys.eventsAll]);
  const valid = contactName.trim() && contactPhone.replace(/\D/g, '').length >= 9 && eventDate && startTime < endTime;
  const submit = () => {
    setConflict(null);
    create.mutate(
      {
        kind,
        contactName: contactName.trim(),
        contactPhone: contactPhone.trim(),
        contactEmail: emptyToUndef(contactEmail),
        companyName: emptyToUndef(companyName),
        taxCode: emptyToUndef(taxCode),
        eventDate,
        startTime,
        endTime,
        halls: Object.entries(selHalls).map(([hallId, layout]) => ({ hallId, layout })),
        holdHalls,
        expectedTables: expectedTables ?? 0,
        guestsPerTable: guestsPerTable ?? 10,
        expectedGuests: expectedTables && guestsPerTable ? expectedTables * guestsPerTable : undefined,
        beveragePolicy,
        notes: emptyToUndef(notes),
        internalNotes: emptyToUndef(internalNotes),
        source: 'STAFF',
      },
      {
        onSuccess: (ev) => {
          toast.success(`Đã tạo tiệc ${ev.code}`);
          onClose();
          router.push(`/events/${ev.id}`);
        },
        onError: (e) => {
          if (e instanceof ApiError && e.code === 'HALL_CONFLICT') setConflict(e.message);
          else toast.error(errorMessage(e));
        },
      },
    );
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Tạo tiệc mới"
      size="lg"
      footer={
        <Button block onClick={submit} loading={create.isPending} disabled={!valid}>
          Tạo yêu cầu tiệc
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Loại tiệc" value={kind} onChange={(e) => setKind(e.target.value as EventKind)}>
            {(Object.keys(EVENT_KIND_LABELS) as EventKind[]).map((k) => (
              <option key={k} value={k}>
                {EVENT_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
          <Select label="Chính sách đồ uống" value={beveragePolicy} onChange={(e) => setBeveragePolicy(e.target.value)}>
            {Object.entries(BEVERAGE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          <Input label="Người liên hệ" value={contactName} onChange={(e) => setContactName(e.target.value)} />
          <Input label="Số điện thoại" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} inputMode="tel" />
          <Input label="Email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          <Input label="Công ty" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          <Input label="Mã số thuế (xuất hóa đơn)" value={taxCode} onChange={(e) => setTaxCode(e.target.value)} />
          <Input label="Ngày tổ chức" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          <Input label="Giờ bắt đầu" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          <Input label="Giờ kết thúc" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          <NumberInput label="Số mâm dự kiến" value={expectedTables} onChange={setExpectedTables} min={0} step={1} />
          <Select label="Khách mỗi mâm" value={String(guestsPerTable ?? 10)} onChange={(e) => setGuestsPerTable(Number(e.target.value))}>
            {[6, 8, 10, 12].map((n) => (
              <option key={n} value={n}>
                {n} khách
              </option>
            ))}
          </Select>
        </div>
        <div>
          <div className="mb-1 text-sm font-semibold text-ink-700">Sảnh</div>
          {halls.isLoading && <Loading />}
          <div className="grid gap-2 sm:grid-cols-2">
            {(halls.data ?? [])
              .filter((h) => h.isActive)
              .map((h) => {
                const on = h.id in selHalls;
                const layout = selHalls[h.id] ?? Object.keys(h.capacityByLayout)[0] ?? 'round10';
                return (
                  <div key={h.id} className={cn('rounded-xl border p-2', on ? 'border-brand-700 bg-brand-50' : 'border-ink-100')}>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-brand-700"
                        checked={on}
                        onChange={(e) =>
                          setSelHalls((s) => {
                            const n = { ...s };
                            if (e.target.checked) n[h.id] = layout;
                            else delete n[h.id];
                            return n;
                          })
                        }
                      />
                      <span className="font-semibold">{h.name}</span>
                    </label>
                    {on && (
                      <select value={layout} onChange={(e) => setSelHalls((s) => ({ ...s, [h.id]: e.target.value }))} className="mt-1 min-h-[40px] w-full rounded-lg border border-ink-300 bg-white px-2 text-sm">
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
          <Checkbox label="Giữ chỗ tạm 48 giờ" checked={holdHalls} onChange={setHoldHalls} hint="Tự giải phóng sảnh nếu chưa ký hợp đồng" />
        </div>
        <Textarea label="Yêu cầu của khách" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <Textarea label="Ghi chú nội bộ" value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} />
        {conflict && <ErrorBox error={new Error(conflict)} />}
      </div>
    </Dialog>
  );
}
