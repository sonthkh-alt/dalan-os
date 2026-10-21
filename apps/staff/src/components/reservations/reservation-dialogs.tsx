'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Banknote, CalendarClock, Check, ListPlus, Phone, UserCheck, Users } from 'lucide-react';
import { RESERVATION_TRANSITIONS, type ReservationStatus as DomainResStatus } from '@dalan/domain';
import { ApiError, errorMessage } from '@/lib/api';
import { useBranchId, useCan } from '@/lib/auth-store';
import { keys, useAction, useFloor } from '@/lib/queries';
import { opsKeys, reservationApi, useAvailability, type DepositMethod, type Reservation, type ReservationCreateBody, type ReservationDepositBody } from '@/lib/queries-ops';
import { dateLabel, emptyToNull, emptyToUndef, minutesToHhmm, phoneDisplay, toVnIso, vnDate, vnMinutes, vnTime, vnToday } from '@/lib/ops-utils';
import type { FloorArea } from '@/lib/types';
import { cn, money } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Badge, Input, Loading, Segmented, Select, Textarea } from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';
import { Checkbox, ErrorBox, MoneyInput, NumberInput } from '@/components/ops/ui';
import { ACTIVE_RES, DEPOSIT_STATUS, OPEN_RES, RES_STATUS, SOURCE_LABELS } from './labels';

const usableAreas = (areas: FloorArea[] | undefined) => (areas ?? []).filter((a) => !['VIRTUAL', 'TAKEAWAY'].includes(a.kind));

/** Bàn đang bị đặt bàn khác giữ trong khoảng thời gian chồng lấn. */
export function reservedTablesFor(list: Reservation[], startIso: string, durationMinutes: number, excludeId?: string): Map<string, string> {
  const start = new Date(startIso).getTime();
  const end = start + durationMinutes * 60_000;
  const map = new Map<string, string>();
  for (const r of list) {
    if (r.id === excludeId || !ACTIVE_RES.includes(r.status)) continue;
    const s = new Date(r.reservedAt).getTime();
    const e = s + r.durationMinutes * 60_000;
    if (s < end && e > start) for (const t of r.tableIds) map.set(t, `${r.customerName} ${vnTime(r.reservedAt)}`);
  }
  return map;
}

/** Chọn bàn theo khu vực, đánh dấu bàn đang có khách hoặc đã được giữ. */
export function TablePicker({ selected, onChange, partySize, reservedBy, showLive }: { selected: string[]; onChange: (ids: string[]) => void; partySize: number; reservedBy: Map<string, string>; showLive: boolean }) {
  const floor = useFloor();
  const areas = usableAreas(floor.data?.areas);
  const seats = areas.flatMap((a) => a.tables).filter((t) => selected.includes(t.id)).reduce((s, t) => s + t.maxSeats, 0);
  if (floor.isLoading) return <Loading label="Đang tải sơ đồ bàn..." />;
  return (
    <div className="space-y-3">
      <div className={cn('rounded-xl px-3 py-2 text-sm', seats >= partySize ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800')}>
        Đã chọn {selected.length} bàn · {seats} chỗ cho {partySize} khách
      </div>
      {areas.map((a) => (
        <div key={a.id}>
          <div className="mb-1 text-sm font-bold text-ink-700">{a.name}</div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {a.tables.map((t) => {
              const on = selected.includes(t.id);
              const held = reservedBy.get(t.id);
              const busy = showLive && !!t.session;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onChange(on ? selected.filter((x) => x !== t.id) : [...selected, t.id])}
                  className={cn(
                    'flex min-h-[64px] flex-col items-center justify-center rounded-xl border-2 px-1 text-center',
                    on ? 'border-brand-700 bg-brand-50' : busy ? 'border-sky-300 bg-sky-50' : held ? 'border-amber-300 bg-amber-50' : 'border-ink-100 bg-white',
                  )}
                  title={held ? `Đã giữ: ${held}` : busy ? 'Đang có khách' : undefined}
                >
                  <span className="font-bold">{t.name}</span>
                  <span className="text-xs text-ink-500">{t.maxSeats} chỗ</span>
                  {held && <span className="line-clamp-1 text-[10px] text-amber-800">Giữ {held.split(' ').pop()}</span>}
                  {!held && busy && <span className="text-[10px] text-sky-800">Đang có khách</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ───────────────────────── Tạo đặt bàn ─────────────────────────

export interface CreatePrefill {
  date?: string;
  time?: string;
  partySize?: number;
  areaId?: string;
  walkIn?: boolean;
}

function nowRounded(): string {
  const m = vnMinutes(new Date());
  return minutesToHhmm(Math.floor(m / 5) * 5);
}

export function CreateReservationDialog({ open, onClose, prefill, dayList }: { open: boolean; onClose: () => void; prefill: CreatePrefill; dayList: Reservation[] }) {
  if (!open) return null;
  return <CreateReservationForm onClose={onClose} prefill={prefill} dayList={dayList} />;
}

function CreateReservationForm({ onClose, prefill, dayList }: { onClose: () => void; prefill: CreatePrefill; dayList: Reservation[] }) {
  const router = useRouter();
  const branchId = useBranchId();
  const floor = useFloor();
  const canOpenTable = useCan('dining.open');
  const [mode, setMode] = useState<'PHONE' | 'WALK_IN'>(prefill.walkIn ? 'WALK_IN' : 'PHONE');
  const walkIn = mode === 'WALK_IN';
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [partySize, setPartySize] = useState<number | null>(prefill.partySize ?? 2);
  const [date, setDate] = useState(prefill.date ?? vnToday());
  const [time, setTime] = useState(prefill.time ?? '');
  const [areaId, setAreaId] = useState(prefill.areaId ?? '');
  const [duration, setDuration] = useState<number | null>(null);
  const [occasion, setOccasion] = useState('');
  const [special, setSpecial] = useState('');
  const [notes, setNotes] = useState('');
  const [depositOverride, setDepositOverride] = useState<number | null>(null);
  const [tableIds, setTableIds] = useState<string[]>([]);
  const [showTables, setShowTables] = useState(!!prefill.walkIn);
  const [autoConfirm, setAutoConfirm] = useState(true);
  const [seatNow, setSeatNow] = useState(true);
  const [noAvail, setNoAvail] = useState<string | null>(null);

  const effDate = walkIn ? vnToday() : date;
  const effTime = walkIn ? nowRounded() : time;
  const avail = useAvailability(!walkIn && partySize ? { date: effDate, partySize, areaId: areaId || undefined, durationMinutes: duration ?? undefined } : null);
  const reservedBy = useMemo(() => (effTime ? reservedTablesFor(dayList, toVnIso(effDate, effTime), duration ?? avail.data?.durationMinutes ?? 90) : new Map<string, string>()), [dayList, effDate, effTime, duration, avail.data]);

  const create = useAction(
    (body: ReservationCreateBody) => reservationApi.create(branchId, body),
    () => [opsKeys.reservationsAll, keys.floor(branchId)],
  );
  const checkIn = useAction((input: { id: string; tableIds: string[]; guestCount: number }) => reservationApi.checkIn(input.id, { tableIds: input.tableIds, guestCount: input.guestCount }), () => [opsKeys.reservationsAll, keys.floor(branchId)]);

  const valid = name.trim().length > 0 && phone.replace(/\D/g, '').length >= 9 && !!partySize && partySize > 0 && (walkIn ? true : !!time);

  /** normal: kiểm tra sức chứa; waitlist: hết chỗ thì vào danh sách chờ; force: bỏ qua sức chứa. */
  const submit = (how: 'normal' | 'waitlist' | 'force') => {
    if (!valid || !partySize) return;
    setNoAvail(null);
    const force = how === 'force';
    const body: ReservationCreateBody = {
      customerName: name.trim(),
      customerPhone: phone.trim(),
      partySize,
      reservedAt: toVnIso(effDate, effTime),
      source: walkIn ? 'WALK_IN' : 'PHONE',
      areaId: areaId || undefined,
      durationMinutes: duration ?? undefined,
      occasion: emptyToUndef(occasion),
      specialRequests: emptyToUndef(special),
      notes: emptyToUndef(notes),
      tableIds: tableIds.length ? tableIds : undefined,
      depositRequired: depositOverride ?? undefined,
      force: walkIn ? true : force,
      autoConfirm: walkIn ? true : autoConfirm,
      ...(!walkIn && how === 'waitlist' ? { waitlist: true } : {}),
    };
    create.mutate(body, {
      onSuccess: (r) => {
        if (walkIn && seatNow && tableIds.length && canOpenTable) {
          checkIn.mutate(
            { id: r.id, tableIds, guestCount: partySize },
            {
              onSuccess: (res) => {
                toast.success(`Đã đón khách ${r.customerName}`);
                onClose();
                router.push(`/sessions/${res.session.id}`);
              },
              onError: (e) => {
                toast.error(`Đã tạo đặt bàn nhưng chưa mở bàn: ${errorMessage(e)}`);
                onClose();
              },
            },
          );
          return;
        }
        toast.success(r.status === 'WAITLIST' ? `Đã thêm ${r.code} vào danh sách chờ` : `Đã tạo đặt bàn ${r.code}`);
        onClose();
      },
      onError: (e) => {
        if (e instanceof ApiError && e.code === 'NO_AVAILABILITY') {
          setNoAvail(e.message);
          return;
        }
        toast.error(errorMessage(e));
      },
    });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={walkIn ? 'Khách vãng lai' : 'Đặt bàn mới'}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Đóng
          </Button>
          <Button className="flex-1" onClick={() => submit('normal')} disabled={!valid} loading={create.isPending || checkIn.isPending}>
            {walkIn ? (seatNow && tableIds.length ? 'Tạo và mở bàn' : 'Tạo đặt bàn') : 'Lưu đặt bàn'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'PHONE', label: 'Đặt qua điện thoại' },
            { value: 'WALK_IN', label: 'Khách vãng lai' },
          ]}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Tên khách" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Anh Minh" autoFocus />
          <Input label="Số điện thoại" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="0912 345 678" />
          <NumberInput label="Số khách" value={partySize} onChange={setPartySize} min={1} step={1} />
          <Select label="Khu vực" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
            <option value="">Bất kỳ</option>
            {usableAreas(floor.data?.areas).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>

        {!walkIn && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input label="Ngày" type="date" value={date} min={vnToday()} onChange={(e) => setDate(e.target.value)} />
              <Input label="Giờ" type="time" value={time} step={900} onChange={(e) => setTime(e.target.value)} />
              <NumberInput label="Thời lượng (phút)" value={duration} onChange={setDuration} min={30} step={15} hint={avail.data ? `Mặc định ${avail.data.durationMinutes} phút` : undefined} />
            </div>
            <div>
              <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink-700">
                <CalendarClock className="h-4 w-4" /> Khung giờ còn chỗ {avail.isFetching && <span className="text-xs font-normal text-ink-500">đang tính...</span>}
              </div>
              {avail.data && (
                <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
                  {avail.data.slots.map((s) => (
                    <button
                      key={s.time}
                      type="button"
                      disabled={!s.available}
                      onClick={() => setTime(s.time)}
                      title={s.reason ?? `Còn ${s.remainingSeats} chỗ`}
                      className={cn('min-h-[40px] shrink-0 rounded-lg border px-2.5 text-sm font-semibold tabular-nums', time === s.time ? 'border-brand-700 bg-brand-700 text-white' : s.available ? 'border-ink-100 bg-white' : 'border-ink-100 bg-ink-100 text-ink-300 line-through')}
                    >
                      {s.time}
                    </button>
                  ))}
                </div>
              )}
              {avail.data?.depositRequired ? <p className="mt-1 text-sm text-amber-800">Theo chính sách, đặt bàn này cần cọc {money(avail.data.depositRequired)}.</p> : null}
            </div>
          </>
        )}
        {walkIn && <p className="rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-900">Khách đến ngay lúc {effTime} hôm nay. Chọn bàn để mở phiên bàn luôn.</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Dịp" value={occasion} onChange={(e) => setOccasion(e.target.value)} placeholder="Sinh nhật, liên hoan, tiếp khách..." />
          <MoneyInput label="Tiền cọc (để trống: theo chính sách)" value={depositOverride} onChange={setDepositOverride} />
        </div>
        <Textarea label="Yêu cầu đặc biệt" value={special} onChange={(e) => setSpecial(e.target.value)} placeholder="Ghế trẻ em, dị ứng, trang trí..." />
        <Input label="Ghi chú nội bộ" value={notes} onChange={(e) => setNotes(e.target.value)} />
        {!walkIn && <Checkbox label="Xác nhận luôn" checked={autoConfirm} onChange={setAutoConfirm} hint="Bỏ chọn nếu cần gọi lại khách hoặc chờ cọc" />}
        {walkIn && canOpenTable && <Checkbox label="Mở bàn ngay sau khi tạo" checked={seatNow} onChange={setSeatNow} />}

        <div>
          <button type="button" onClick={() => setShowTables((v) => !v)} className="text-sm font-semibold text-brand-800 underline">
            {showTables ? 'Ẩn chọn bàn' : `Chọn bàn trước${tableIds.length ? ` (${tableIds.length})` : ''}`}
          </button>
          {showTables && (
            <div className="mt-2">
              <TablePicker selected={tableIds} onChange={setTableIds} partySize={partySize ?? 1} reservedBy={reservedBy} showLive={effDate === vnToday()} />
            </div>
          )}
        </div>

        {noAvail && (
          <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <span className="flex-1">{noAvail}. Chọn giờ khác, đưa khách vào danh sách chờ, hoặc vẫn đặt nếu chắc chắn sắp xếp được.</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => submit('waitlist')} loading={create.isPending && create.variables?.waitlist === true}>
                <ListPlus className="h-4 w-4" /> Đưa vào danh sách chờ
              </Button>
              <Button size="sm" variant="secondary" onClick={() => submit('force')} loading={create.isPending && create.variables?.force === true}>
                Vẫn đặt (bỏ qua sức chứa)
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

// ───────────────────────── Tra cứu chỗ trống ─────────────────────────

export function AvailabilityDialog({ open, onClose, onPick, initialDate }: { open: boolean; onClose: () => void; onPick: (p: CreatePrefill) => void; initialDate: string }) {
  const floor = useFloor();
  const [date, setDate] = useState(initialDate);
  const [partySize, setPartySize] = useState<number | null>(4);
  const [areaId, setAreaId] = useState('');
  const avail = useAvailability(open && partySize ? { date, partySize, areaId: areaId || undefined } : null);
  return (
    <Dialog open={open} onClose={onClose} title="Tra cứu chỗ trống" size="lg">
      <div className="grid gap-3 sm:grid-cols-3">
        <Input label="Ngày" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <NumberInput label="Số khách" value={partySize} onChange={setPartySize} min={1} step={1} />
        <Select label="Khu vực" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
          <option value="">Toàn cơ sở</option>
          {usableAreas(floor.data?.areas).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </div>
      {avail.isLoading && <Loading />}
      <ErrorBox error={avail.error} className="mt-3" />
      {avail.data && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2 text-sm text-ink-700">
            <Badge>Sức chứa {avail.data.capacitySeats} chỗ</Badge>
            <Badge>Ngồi {avail.data.durationMinutes} phút</Badge>
            {avail.data.area && <Badge tone="info">{avail.data.area.name}</Badge>}
            {avail.data.depositRequired ? <Badge tone="warning">Cần cọc {money(avail.data.depositRequired)}</Badge> : <Badge tone="success">Không cần cọc</Badge>}
          </div>
          {avail.data.slots.length === 0 && <p className="text-sm text-ink-500">Cơ sở không nhận khách trong ngày này.</p>}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {avail.data.slots.map((s) => (
              <button
                key={s.time}
                type="button"
                disabled={!s.available}
                onClick={() => onPick({ date, time: s.time, partySize: partySize ?? undefined, areaId: areaId || undefined })}
                className={cn('flex min-h-[56px] flex-col items-center justify-center rounded-xl border text-sm', s.available ? 'border-emerald-200 bg-emerald-50 text-emerald-900 hover:border-emerald-500' : 'border-ink-100 bg-ink-100 text-ink-500')}
              >
                <span className="font-bold tabular-nums">{s.time}</span>
                <span className="text-[11px]">{s.available ? `còn ${s.remainingSeats} chỗ` : s.reason}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-ink-500">Chạm vào khung giờ còn chỗ để tạo đặt bàn.</p>
        </div>
      )}
    </Dialog>
  );
}

// ───────────────────────── Chi tiết đặt bàn ─────────────────────────

const can = (from: Reservation['status'], to: DomainResStatus) => RESERVATION_TRANSITIONS[from as DomainResStatus]?.includes(to) ?? false;

export function ReservationDetailDialog({ reservation: r, onClose, dayList }: { reservation: Reservation | null; onClose: () => void; dayList: Reservation[] }) {
  const router = useRouter();
  const branchId = useBranchId();
  const canManage = useCan('reservation.manage');
  const canOpenTable = useCan('dining.open');
  const [panel, setPanel] = useState<'none' | 'assign' | 'checkin' | 'edit' | 'cancel' | 'noshow' | 'deposit'>('none');
  const [tables, setTables] = useState<string[]>([]);
  const [guests, setGuests] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const inv = () => [opsKeys.reservationsAll, keys.floor(branchId)] as const;
  const onError = (e: unknown) => toast.error(errorMessage(e));
  const confirm = useAction((id: string) => reservationApi.confirm(id), inv, () => toast.success('Đã xác nhận đặt bàn'));
  const assign = useAction((p: { id: string; tableIds: string[] }) => reservationApi.assign(p.id, p.tableIds), inv, () => {
    toast.success('Đã xếp bàn');
    setPanel('none');
  });
  const checkIn = useAction((p: { id: string; tableIds: string[]; guestCount: number }) => reservationApi.checkIn(p.id, { tableIds: p.tableIds, guestCount: p.guestCount }), inv, (res) => {
    toast.success('Đã đón khách, mở phiên bàn');
    onClose();
    router.push(`/sessions/${res.session.id}`);
  });
  const cancel = useAction((p: { id: string; reason?: string }) => reservationApi.cancel(p.id, p.reason), inv, () => {
    toast.success('Đã hủy đặt bàn');
    setPanel('none');
  });
  const noShow = useAction((id: string) => reservationApi.noShow(id), inv, () => {
    toast.success('Đã đánh dấu không đến');
    setPanel('none');
  });
  const reservedBy = useMemo(() => (r ? reservedTablesFor(dayList, r.reservedAt, r.durationMinutes, r.id) : new Map<string, string>()), [dayList, r]);

  if (!r) return null;
  const st = RES_STATUS[r.status];
  const open = OPEN_RES.includes(r.status);
  const isToday = vnDate(r.reservedAt) === vnToday();
  const depositRemaining = Math.max(0, (r.depositRequired ?? 0) - r.depositPaid);
  // API từ chối thu cọc khi đặt bàn đã kết thúc (hủy, không đến, hoàn tất)
  const canTakeDeposit = canManage && !['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(r.status) && depositRemaining > 0;
  const startPanel = (p: typeof panel) => {
    setTables(r.tableIds);
    setGuests(r.partySize);
    setReason('');
    setPanel(p);
  };

  return (
    <>
      <Dialog open onClose={onClose} title={`${r.code} · ${r.customerName}`} size="lg">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={st.tone}>{st.label}</Badge>
            {r.status === 'WAITLIST' && r.waitlistPosition && <Badge tone="brand">Thứ tự chờ #{r.waitlistPosition}</Badge>}
            <Badge tone={DEPOSIT_STATUS[r.depositStatus].tone}>{DEPOSIT_STATUS[r.depositStatus].label}</Badge>
            {r.isLate && <Badge tone="danger">Trễ giờ</Badge>}
            {r.isUpcoming && <Badge tone="info">Sắp đến</Badge>}
            <span className="text-sm text-ink-500">Nguồn: {SOURCE_LABELS[r.source] ?? r.source}</span>
          </div>
          <div className="grid gap-2 rounded-xl border border-ink-100 bg-paper p-3 text-sm sm:grid-cols-2">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-ink-500" />
              <b>{vnTime(r.reservedAt)}</b> · {dateLabel(vnDate(r.reservedAt))} · {r.durationMinutes} phút
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-ink-500" /> <b>{r.partySize} khách</b>
              {r.area && <span>· {r.area.name}</span>}
            </div>
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-ink-500" />
              <a href={`tel:${r.customerPhone.replace(/^\+84/, '0')}`} className="font-semibold text-brand-800 underline">
                {phoneDisplay(r.customerPhone)}
              </a>
            </div>
            <div>Bàn: {r.tables.length ? <b>{r.tables.map((t) => t.name).join(', ')}</b> : <span className="text-amber-700">Chưa xếp bàn</span>}</div>
            {r.depositRequired || r.depositPaid ? (
              <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                <span className="flex-1">
                  Cọc: <b>{money(r.depositRequired ?? 0)}</b> · đã nhận <b>{money(r.depositPaid)}</b>
                  {depositRemaining > 0 && <span className="text-amber-800"> · còn thiếu {money(depositRemaining)}</span>}
                </span>
                {canTakeDeposit && (
                  <Button size="sm" variant="secondary" onClick={() => setPanel('deposit')}>
                    <Banknote className="h-4 w-4" /> Thu cọc
                  </Button>
                )}
              </div>
            ) : null}
          </div>
          {r.customer && (
            <div className="rounded-xl border border-gold-300 bg-gold-100/60 p-3 text-sm">
              <div className="font-semibold">
                {r.customer.fullName ?? r.customerName} · lần ghé thứ {r.customer.visitCount + 1}
              </div>
              {r.customer.tags.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{r.customer.tags.map((t) => <Badge key={t} tone="brand">{t}</Badge>)}</div>}
              {r.customer.allergies && <div className="mt-1 text-red-800">Dị ứng: {r.customer.allergies}</div>}
              {r.customer.preferences && <div className="mt-1">Sở thích: {r.customer.preferences}</div>}
              <button type="button" className="mt-1 text-xs font-semibold text-brand-800 underline" onClick={() => router.push(`/customers/${r.customer!.id}`)}>
                Xem hồ sơ khách
              </button>
            </div>
          )}
          {(r.occasion || r.specialRequests || r.notes) && (
            <div className="space-y-1 text-sm">
              {r.occasion && <div>Dịp: <b>{r.occasion}</b></div>}
              {r.specialRequests && <div>Yêu cầu: {r.specialRequests}</div>}
              {r.notes && <div className="text-ink-500">Ghi chú: {r.notes}</div>}
            </div>
          )}
          {r.preorderLines && r.preorderLines.length > 0 && <div className="text-sm text-ink-700">Có {r.preorderLines.length} món đặt trước, sẽ tự gửi bếp khi đón khách.</div>}
          {r.cancelReason && <div className="text-sm text-ink-500">Lý do hủy: {r.cancelReason}</div>}
          {r.session && (
            <Button variant="outline" onClick={() => router.push(`/sessions/${r.session!.id}`)}>
              Mở phiên bàn {r.session.code}
            </Button>
          )}

          {canManage && open && (
            <div className="flex flex-wrap gap-2 border-t border-ink-100 pt-3">
              {canOpenTable && (
                <Button variant="success" onClick={() => startPanel('checkin')}>
                  <UserCheck className="h-5 w-5" /> Đón khách
                </Button>
              )}
              {can(r.status, 'CONFIRMED') && (
                <Button onClick={() => confirm.mutate(r.id, { onError })} loading={confirm.isPending}>
                  <Check className="h-5 w-5" /> {r.status === 'WAITLIST' ? 'Đưa lên từ danh sách chờ' : 'Xác nhận'}
                </Button>
              )}
              <Button variant="outline" onClick={() => startPanel('assign')}>
                Xếp bàn
              </Button>
              <Button variant="outline" onClick={() => startPanel('edit')}>
                Sửa
              </Button>
              {can(r.status, 'NO_SHOW') && (
                <Button variant="outline" onClick={() => setPanel('noshow')}>
                  Không đến
                </Button>
              )}
              {can(r.status, 'CANCELLED') && (
                <Button variant="ghost" className="text-red-700" onClick={() => startPanel('cancel')}>
                  Hủy đặt bàn
                </Button>
              )}
            </div>
          )}
        </div>
      </Dialog>

      <Dialog
        open={panel === 'assign' || panel === 'checkin'}
        onClose={() => setPanel('none')}
        title={panel === 'checkin' ? 'Đón khách và mở bàn' : 'Xếp bàn'}
        size="lg"
        footer={
          <Button
            block
            disabled={tables.length === 0 || (panel === 'checkin' && !guests)}
            loading={assign.isPending || checkIn.isPending}
            onClick={() =>
              panel === 'checkin' ? checkIn.mutate({ id: r.id, tableIds: tables, guestCount: guests ?? r.partySize }, { onError }) : assign.mutate({ id: r.id, tableIds: tables }, { onError })
            }
          >
            {panel === 'checkin' ? 'Mở phiên bàn' : 'Lưu xếp bàn'}
          </Button>
        }
      >
        {panel === 'checkin' && <NumberInput label="Số khách thực tế" value={guests} onChange={setGuests} min={1} step={1} className="mb-3" />}
        <TablePicker selected={tables} onChange={setTables} partySize={guests ?? r.partySize} reservedBy={reservedBy} showLive={isToday} />
      </Dialog>

      <ConfirmDialog open={panel === 'noshow'} onClose={() => setPanel('none')} title="Khách không đến?" message={r.depositStatus === 'PAID' ? 'Tiền cọc sẽ chuyển sang trạng thái mất cọc.' : `Đánh dấu ${r.customerName} không đến.`} confirmLabel="Đánh dấu không đến" danger loading={noShow.isPending} onConfirm={() => noShow.mutate(r.id, { onError })} />

      <Dialog
        open={panel === 'cancel'}
        onClose={() => setPanel('none')}
        title="Hủy đặt bàn"
        size="sm"
        footer={
          <Button variant="danger" block loading={cancel.isPending} onClick={() => cancel.mutate({ id: r.id, reason: emptyToUndef(reason) }, { onError })}>
            Hủy đặt bàn
          </Button>
        }
      >
        <Textarea label="Lý do" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Khách báo bận, đổi ngày..." />
        {r.depositStatus === 'PAID' && <p className="mt-2 text-sm text-ink-700">Khách đã cọc: nhà hàng hủy thì cọc được đánh dấu hoàn lại.</p>}
      </Dialog>

      {panel === 'edit' && <EditReservationDialog reservation={r} onClose={() => setPanel('none')} />}
      {panel === 'deposit' && <DepositDialog reservation={r} remaining={depositRemaining} onClose={() => setPanel('none')} />}
    </>
  );
}

const DEPOSIT_METHODS: { value: DepositMethod; label: string }[] = [
  { value: 'CASH', label: 'Tiền mặt' },
  { value: 'BANK_TRANSFER', label: 'Chuyển khoản' },
  { value: 'CARD_TERMINAL', label: 'Quẹt thẻ' },
];

/** Thu cọc tại quầy; đủ mức yêu cầu thì API đánh dấu đã cọc và tự xác nhận đặt bàn đang chờ. */
function DepositDialog({ reservation: r, remaining, onClose }: { reservation: Reservation; remaining: number; onClose: () => void }) {
  const branchId = useBranchId();
  const [amount, setAmount] = useState<number | null>(remaining);
  const [method, setMethod] = useState<DepositMethod>('CASH');
  const [externalRef, setExternalRef] = useState('');
  const [note, setNote] = useState('');
  const save = useAction(
    (body: ReservationDepositBody) => reservationApi.deposit(r.id, body),
    () => [opsKeys.reservationsAll, keys.floor(branchId)],
    (out) => {
      toast.success(out.depositStatus === 'PAID' ? (r.status === 'PENDING' && out.status === 'CONFIRMED' ? 'Đã thu đủ cọc, đặt bàn được xác nhận' : 'Đã thu đủ cọc') : `Đã ghi nhận cọc, còn thiếu ${money(Math.max(0, (out.depositRequired ?? 0) - out.depositPaid))}`);
      onClose();
    },
  );
  const valid = !!amount && amount >= 1 && Number.isInteger(amount);
  const submit = () => {
    if (!valid || !amount) return;
    const body: ReservationDepositBody = { amount, method, externalRef: method === 'CASH' ? undefined : emptyToUndef(externalRef), note: emptyToUndef(note) };
    save.mutate(body, { onError: (e) => toast.error(errorMessage(e)) });
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Thu cọc ${r.code}`}
      size="sm"
      footer={
        <Button block onClick={submit} loading={save.isPending} disabled={!valid}>
          Xác nhận đã thu {amount ? money(amount) : ''}
        </Button>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-ink-700">
          Yêu cầu {money(r.depositRequired ?? 0)} · đã nhận {money(r.depositPaid)} · còn thiếu <b>{money(remaining)}</b>
        </p>
        <MoneyInput label="Số tiền thu" value={amount} onChange={setAmount} />
        <Segmented value={method} onChange={setMethod} options={DEPOSIT_METHODS} />
        {method !== 'CASH' && <Input label="Mã giao dịch (nếu có)" value={externalRef} onChange={(e) => setExternalRef(e.target.value)} maxLength={100} />}
        <Input label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        {r.status === 'PENDING' && <p className="text-xs text-ink-500">Thu đủ cọc sẽ tự xác nhận đặt bàn.</p>}
      </div>
    </Dialog>
  );
}

function EditReservationDialog({ reservation: r, onClose }: { reservation: Reservation; onClose: () => void }) {
  const branchId = useBranchId();
  const floor = useFloor();
  const initial = {
    customerName: r.customerName,
    customerPhone: r.customerPhone.replace(/^\+84/, '0'),
    partySize: r.partySize,
    date: vnDate(r.reservedAt),
    time: vnTime(r.reservedAt),
    durationMinutes: r.durationMinutes,
    areaId: r.areaId ?? '',
    occasion: r.occasion ?? '',
    specialRequests: r.specialRequests ?? '',
    notes: r.notes ?? '',
    depositRequired: r.depositRequired ?? 0,
  };
  const [f, setF] = useState(initial);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const save = useAction((body: Record<string, unknown>) => reservationApi.update(r.id, body), () => [opsKeys.reservationsAll], () => {
    toast.success('Đã lưu thay đổi');
    onClose();
  });
  const submit = () => {
    const body: Record<string, unknown> = {};
    if (f.customerName !== initial.customerName) body.customerName = f.customerName.trim();
    if (f.customerPhone !== initial.customerPhone) body.customerPhone = f.customerPhone.trim();
    if (f.partySize !== initial.partySize) body.partySize = f.partySize;
    if (f.date !== initial.date || f.time !== initial.time) body.reservedAt = toVnIso(f.date, f.time);
    if (f.durationMinutes !== initial.durationMinutes) body.durationMinutes = f.durationMinutes;
    if (f.areaId !== initial.areaId) body.areaId = f.areaId || null;
    if (f.occasion !== initial.occasion) body.occasion = emptyToNull(f.occasion);
    if (f.specialRequests !== initial.specialRequests) body.specialRequests = emptyToNull(f.specialRequests);
    if (f.notes !== initial.notes) body.notes = emptyToNull(f.notes);
    if (f.depositRequired !== initial.depositRequired) body.depositRequired = f.depositRequired || null;
    if (Object.keys(body).length === 0) return onClose();
    save.mutate(body, { onError: (e) => toast.error(errorMessage(e)) });
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Sửa ${r.code}`}
      size="lg"
      footer={
        <Button block onClick={submit} loading={save.isPending} disabled={!f.customerName.trim() || !f.partySize}>
          Lưu thay đổi
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Tên khách" value={f.customerName} onChange={(e) => set('customerName', e.target.value)} />
        <Input label="Số điện thoại" value={f.customerPhone} onChange={(e) => set('customerPhone', e.target.value)} inputMode="tel" />
        <NumberInput label="Số khách" value={f.partySize} onChange={(v) => set('partySize', v ?? 0)} min={1} step={1} />
        <Select label="Khu vực" value={f.areaId} onChange={(e) => set('areaId', e.target.value)}>
          <option value="">Chưa chọn</option>
          {usableAreas(floor.data?.areas).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
        <Input label="Ngày" type="date" value={f.date} onChange={(e) => set('date', e.target.value)} />
        <Input label="Giờ" type="time" value={f.time} onChange={(e) => set('time', e.target.value)} />
        <NumberInput label="Thời lượng (phút)" value={f.durationMinutes} onChange={(v) => set('durationMinutes', v ?? 90)} min={30} step={15} />
        <MoneyInput label="Tiền cọc yêu cầu" value={f.depositRequired} onChange={(v) => set('depositRequired', v ?? 0)} hint="Để 0 nếu không cần cọc" />
        <Input label="Dịp" value={f.occasion} onChange={(e) => set('occasion', e.target.value)} />
        <Input label="Ghi chú nội bộ" value={f.notes} onChange={(e) => set('notes', e.target.value)} />
      </div>
      <Textarea label="Yêu cầu đặc biệt" value={f.specialRequests} onChange={(e) => set('specialRequests', e.target.value)} className="mt-3" />
      <p className="mt-2 text-xs text-ink-500">Chỉ các trường đã thay đổi được gửi lên. Đổi giờ không kiểm tra lại sức chứa, hãy tra cứu chỗ trống trước nếu cần.</p>
    </Dialog>
  );
}
