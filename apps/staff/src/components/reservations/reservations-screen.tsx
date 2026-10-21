'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Footprints, Plus, Search } from 'lucide-react';
import { useCan } from '@/lib/auth-store';
import { useFloor } from '@/lib/queries';
import { useReservations, type Reservation, type ReservationStatus } from '@/lib/queries-ops';
import { addDays, dateLabel, fold, minutesToHhmm, phoneDisplay, vnMinutes, vnTime, vnToday } from '@/lib/ops-utils';
import { cn, money } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, Input, Loading, Segmented } from '@/components/ui/primitives';
import { ErrorBox, FilterChips, PageHeader, Stat } from '@/components/ops/ui';
import { DEPOSIT_STATUS, RES_STATUS } from './labels';
import { AvailabilityDialog, CreateReservationDialog, ReservationDetailDialog, type CreatePrefill } from './reservation-dialogs';

type View = 'timeline' | 'list' | 'waitlist';
type StatusFilter = 'ALL' | ReservationStatus;

export function ReservationsScreen() {
  const [date, setDate] = useState(vnToday());
  const [view, setView] = useState<View>('timeline');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [search, setSearch] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [create, setCreate] = useState<CreatePrefill | null>(null);
  const [availOpen, setAvailOpen] = useState(false);
  const canManage = useCan('reservation.manage');
  const q = useReservations(date);
  const list = useMemo(() => q.data ?? [], [q.data]);
  const selected = list.find((r) => r.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const s = fold(search.trim());
    return list.filter((r) => {
      if (status !== 'ALL' && r.status !== status) return false;
      if (!s) return true;
      const digits = s.replace(/\D/g, '').replace(/^0/, '');
      return fold(r.customerName).includes(s) || (digits.length >= 3 && r.customerPhone.includes(digits)) || fold(r.code).includes(s);
    });
  }, [list, status, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of list) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [list]);
  const active = list.filter((r) => ['PENDING', 'CONFIRMED', 'SEATED'].includes(r.status));
  const guests = active.reduce((s, r) => s + r.partySize, 0);
  const waitlist = list.filter((r) => r.status === 'WAITLIST').sort((a, b) => (a.waitlistPosition ?? 99) - (b.waitlistPosition ?? 99));
  const depositPending = list.filter((r) => r.depositStatus === 'PENDING' && ['PENDING', 'CONFIRMED', 'WAITLIST'].includes(r.status));

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Đặt bàn"
        subtitle={dateLabel(date)}
        actions={
          canManage && (
            <>
              <Button variant="outline" onClick={() => setAvailOpen(true)}>
                Tra chỗ trống
              </Button>
              <Button variant="secondary" onClick={() => setCreate({ walkIn: true })}>
                <Footprints className="h-5 w-5" /> Khách vãng lai
              </Button>
              <Button onClick={() => setCreate({ date })}>
                <Plus className="h-5 w-5" /> Đặt bàn
              </Button>
            </>
          )
        }
      />
      <div className="space-y-3 p-3 md:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-ink-100 bg-white p-1">
            <button type="button" className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-ink-100" onClick={() => setDate(addDays(date, -1))} aria-label="Ngày trước">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="min-h-[40px] rounded-lg px-2 text-base font-semibold" aria-label="Chọn ngày" />
            <button type="button" className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-ink-100" onClick={() => setDate(addDays(date, 1))} aria-label="Ngày sau">
              <ChevronRight className="h-5 w-5" />
            </button>
            {date !== vnToday() && (
              <button type="button" className="min-h-[40px] rounded-lg px-3 text-sm font-semibold text-brand-800 hover:bg-brand-50" onClick={() => setDate(vnToday())}>
                Hôm nay
              </button>
            )}
          </div>
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: 'timeline', label: 'Dòng thời gian' },
              { value: 'list', label: 'Danh sách' },
              { value: 'waitlist', label: `Danh sách chờ${waitlist.length ? ` (${waitlist.length})` : ''}` },
            ]}
          />
          <div className="relative ml-auto w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-ink-300" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tên, số điện thoại, mã" className="pl-10" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Stat label="Đặt bàn" value={active.length} hint={`${counts.SEATED ?? 0} đã vào bàn`} />
          <Stat label="Tổng khách" value={guests} tone="brand" />
          <Stat label="Danh sách chờ" value={waitlist.length} tone={waitlist.length ? 'warning' : 'neutral'} />
          <Stat label="Chờ cọc" value={depositPending.length} tone={depositPending.length ? 'warning' : 'neutral'} hint={depositPending.length ? money(depositPending.reduce((s, r) => s + (r.depositRequired ?? 0), 0)) : undefined} />
        </div>

        <ErrorBox error={q.error} />
        {q.isLoading ? (
          <Loading />
        ) : view === 'timeline' ? (
          <>
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} className="h-5 w-5 accent-brand-700" /> Hiện cả đặt bàn đã hủy, không đến
            </label>
            <Timeline list={filtered.filter((r) => showClosed || !['CANCELLED', 'NO_SHOW'].includes(r.status))} date={date} onSelect={setSelectedId} />
          </>
        ) : view === 'list' ? (
          <>
            <FilterChips<StatusFilter>
              value={status}
              onChange={setStatus}
              options={[
                { value: 'ALL', label: 'Tất cả', count: list.length },
                ...(Object.keys(RES_STATUS) as ReservationStatus[]).map((s) => ({ value: s, label: RES_STATUS[s].label, count: counts[s] ?? 0 })),
              ]}
            />
            <ReservationList list={filtered} onSelect={setSelectedId} />
          </>
        ) : (
          <WaitlistView list={waitlist.filter((r) => filtered.includes(r))} onSelect={setSelectedId} />
        )}
      </div>

      <ReservationDetailDialog reservation={selected} onClose={() => setSelectedId(null)} dayList={list} />
      <CreateReservationDialog open={!!create} onClose={() => setCreate(null)} prefill={create ?? {}} dayList={list} />
      <AvailabilityDialog
        open={availOpen}
        onClose={() => setAvailOpen(false)}
        initialDate={date}
        onPick={(p) => {
          setAvailOpen(false);
          setCreate(p);
        }}
      />
    </div>
  );
}

function ReservationRow({ r, onSelect }: { r: Reservation; onSelect: (id: string) => void }) {
  const st = RES_STATUS[r.status];
  return (
    <button type="button" onClick={() => onSelect(r.id)} className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-paper">
      <div className="w-14 shrink-0 text-center">
        <div className="text-lg font-black tabular-nums">{vnTime(r.reservedAt)}</div>
        <div className="text-[11px] text-ink-500">{r.durationMinutes}p</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-bold">{r.customerName}</span>
          <span className="text-sm text-ink-500">{phoneDisplay(r.customerPhone)}</span>
          {r.customer?.tags.slice(0, 2).map((t) => (
            <Badge key={t} tone="brand">
              {t}
            </Badge>
          ))}
        </div>
        <div className="text-sm text-ink-700">
          {r.partySize} khách · {r.tables.length ? r.tables.map((t) => t.name).join(', ') : r.area?.name ?? 'Chưa xếp bàn'}
          {r.occasion ? ` · ${r.occasion}` : ''}
        </div>
        {r.specialRequests && <div className="truncate text-xs text-ink-500">{r.specialRequests}</div>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Badge tone={st.tone}>{st.label}</Badge>
        {r.depositStatus !== 'NOT_REQUIRED' && <Badge tone={DEPOSIT_STATUS[r.depositStatus].tone}>{DEPOSIT_STATUS[r.depositStatus].label}</Badge>}
        {r.isLate && <Badge tone="danger">Trễ</Badge>}
      </div>
    </button>
  );
}

function ReservationList({ list, onSelect }: { list: Reservation[]; onSelect: (id: string) => void }) {
  if (list.length === 0) return <EmptyState title="Không có đặt bàn" hint="Đổi ngày hoặc bộ lọc để xem thêm." />;
  return (
    <div className="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-100 bg-white">
      {list.map((r) => (
        <ReservationRow key={r.id} r={r} onSelect={onSelect} />
      ))}
    </div>
  );
}

function WaitlistView({ list, onSelect }: { list: Reservation[]; onSelect: (id: string) => void }) {
  if (list.length === 0) return <EmptyState title="Danh sách chờ trống" hint="Khách đặt qua web/Zalo khi hết chỗ sẽ vào danh sách chờ. Chạm vào khách để xác nhận đưa lên khi có bàn." />;
  return (
    <div className="space-y-2">
      <p className="text-sm text-ink-500">Sắp theo thứ tự chờ. Mở từng khách để “Đưa lên từ danh sách chờ” (xác nhận) hoặc đón khách ngay khi có bàn trống.</p>
      <div className="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-100 bg-white">
        {list.map((r) => (
          <div key={r.id} className="flex items-center">
            <span className="w-10 shrink-0 text-center text-lg font-black text-brand-800">#{r.waitlistPosition ?? '–'}</span>
            <div className="min-w-0 flex-1">
              <ReservationRow r={r} onSelect={onSelect} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Dòng thời gian theo khu vực: mỗi đặt bàn là một thanh từ giờ đến đến giờ dự kiến rời. */
function Timeline({ list, date, onSelect }: { list: Reservation[]; date: string; onSelect: (id: string) => void }) {
  const floor = useFloor();
  const areas = (floor.data?.areas ?? []).filter((a) => !['VIRTUAL', 'TAKEAWAY'].includes(a.kind));
  const tableArea = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of floor.data?.areas ?? []) for (const t of a.tables) m.set(t.id, a.id);
    return m;
  }, [floor.data]);

  const starts = list.map((r) => vnMinutes(r.reservedAt));
  const ends = list.map((r, i) => (starts[i] ?? 0) + r.durationMinutes);
  const startH = Math.min(10, ...starts.map((m) => Math.floor(m / 60)));
  const endH = Math.min(24, Math.max(22, ...ends.map((m) => Math.ceil(m / 60))));
  const span = (endH - startH) * 60;
  const pct = (m: number) => `${((m - startH * 60) / span) * 100}%`;

  const rows = useMemo(() => {
    const byArea = new Map<string, Reservation[]>();
    for (const r of list) {
      const areaId = r.areaId ?? (r.tableIds[0] ? tableArea.get(r.tableIds[0]) : undefined) ?? 'none';
      byArea.set(areaId, [...(byArea.get(areaId) ?? []), r]);
    }
    const out = areas.map((a) => ({ id: a.id, name: a.name, items: byArea.get(a.id) ?? [] }));
    const known = new Set(areas.map((a) => a.id));
    const rest = [...byArea.entries()].filter(([k]) => !known.has(k)).flatMap(([, v]) => v);
    if (rest.length) out.push({ id: 'none', name: 'Chưa xếp khu', items: rest });
    return out.map((row) => {
      // Xếp làn để các thanh chồng giờ không đè nhau
      const lanes: number[] = [];
      const placed = [...row.items]
        .sort((a, b) => a.reservedAt.localeCompare(b.reservedAt))
        .map((r) => {
          const s = vnMinutes(r.reservedAt);
          const e = s + r.durationMinutes;
          let lane = lanes.findIndex((end) => end <= s);
          if (lane === -1) {
            lane = lanes.length;
            lanes.push(e);
          } else lanes[lane] = e;
          return { r, s, e, lane };
        });
      return { ...row, placed, lanes: Math.max(1, lanes.length) };
    });
  }, [list, areas, tableArea]);

  const hours = Array.from({ length: endH - startH + 1 }, (_, i) => startH + i);
  const nowM = date === vnToday() ? vnMinutes(new Date()) : null;
  const LANE = 46;

  if (floor.isLoading) return <Loading />;
  return (
    <div className="scrollbar-thin overflow-x-auto rounded-2xl border border-ink-100 bg-white">
      <div className="min-w-[960px]">
        <div className="relative ml-36 h-8 border-b border-ink-100">
          {hours.map((h) => (
            <span key={h} className="absolute top-1.5 -translate-x-1/2 text-xs font-semibold text-ink-500" style={{ left: pct(h * 60) }}>
              {minutesToHhmm(h * 60)}
            </span>
          ))}
        </div>
        {rows.map((row) => (
          <div key={row.id} className="flex border-b border-ink-100 last:border-b-0">
            <div className="flex w-36 shrink-0 flex-col justify-center border-r border-ink-100 bg-paper px-3 py-2">
              <span className="text-sm font-bold">{row.name}</span>
              <span className="text-xs text-ink-500">
                {row.items.length} đặt · {row.items.reduce((s, r) => s + r.partySize, 0)} khách
              </span>
            </div>
            <div className="relative flex-1" style={{ height: row.lanes * LANE + 8 }}>
              {hours.map((h) => (
                <span key={h} className="absolute top-0 bottom-0 border-l border-dashed border-ink-100" style={{ left: pct(h * 60) }} />
              ))}
              {nowM !== null && nowM >= startH * 60 && nowM <= endH * 60 && <span className="absolute top-0 bottom-0 z-10 w-0.5 bg-red-500" style={{ left: pct(nowM) }} />}
              {row.placed.map(({ r, s, e, lane }) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onSelect(r.id)}
                  className={cn('absolute overflow-hidden rounded-lg border-l-4 border px-2 text-left text-xs shadow-sm hover:z-20 hover:shadow-md', RES_STATUS[r.status].bar)}
                  style={{ left: pct(s), width: `calc(${pct(e)} - ${pct(s)} - 2px)`, top: 4 + lane * LANE, height: LANE - 6 }}
                  title={`${vnTime(r.reservedAt)} ${r.customerName} · ${r.partySize} khách · ${RES_STATUS[r.status].label}`}
                >
                  <div className="truncate font-bold">
                    {vnTime(r.reservedAt)} {r.customerName}
                  </div>
                  <div className="truncate">
                    {r.partySize} khách{r.tables.length ? ` · ${r.tables.map((t) => t.name).join(', ')}` : ''}
                    {r.depositStatus === 'PENDING' ? ' · chờ cọc' : ''}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
        {rows.length === 0 && <EmptyState title="Chưa có khu vực" />}
      </div>
    </div>
  );
}
