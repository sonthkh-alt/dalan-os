'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Ban, Check, ChefHat, ChevronDown, History, Home, ListChecks, Maximize, Minimize, Play, RotateCcw, Undo2, Volume2, VolumeX, X, Zap } from 'lucide-react';
import { matchesSearch } from '@dalan/domain';
import { errorMessage } from '@/lib/api';
import { useBranchId } from '@/lib/auth-store';
import { kdsApi, keys, useAction, useKds, useMenu, useStations } from '@/lib/queries';
import { reconnectRealtime, useRealtime } from '@/lib/socket';
import type { KdsTicket } from '@/lib/types';
import { cn, qty } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';
import { KDS_AGE, NEW_TICKET_HIGHLIGHT_SEC, ageLevel, allDay, clock, countByLevel, isRush, sortTickets, ticketMinutes, type AgeLevel } from './kds-logic';

const STATION_KEY = 'dalan-kds-station';
const SOUND_KEY = 'dalan-kds-sound';

const LEVEL_HEAD: Record<AgeLevel, string> = { ok: 'bg-emerald-600', warn: 'bg-amber-500 text-zinc-950', late: 'bg-red-600' };
const LEVEL_BORDER: Record<AgeLevel, string> = { ok: 'border-emerald-600/60', warn: 'border-amber-400', late: 'border-red-500' };

function storageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function storageSet(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* trình duyệt chặn lưu trữ: bỏ qua */
  }
}

let audioCtx: AudioContext | null = null;
/** Tiếng "bíp" hai nốt bằng Web Audio (không cần tệp âm thanh). */
function beep(urgent = false) {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx ??= new Ctx();
    const ctx = audioCtx;
    void ctx.resume();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = urgent ? 'square' : 'sine';
    o.frequency.value = urgent ? 660 : 880;
    g.gain.value = 0.15;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.frequency.setValueAtTime(urgent ? 440 : 1175, ctx.currentTime + 0.14);
    o.stop(ctx.currentTime + 0.32);
  } catch {
    /* trình duyệt chặn âm thanh khi chưa tương tác */
  }
}

/** Màn hình bếp tối, tương phản cao: phiếu theo thời gian, bấm xong từng món/cả phiếu, gọi lại, tổng món đang chờ. */
export function KdsScreen() {
  const branchId = useBranchId();
  const stations = useStations();
  const [station, setStation] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<'active' | 'done'>('active');
  const [sound, setSound] = useState(false);
  const [soldOutOpen, setSoldOutOpen] = useState(false);
  const [allDayOpen, setAllDayOpen] = useState(true);
  const [allDaySheet, setAllDaySheet] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [bumped, setBumped] = useState<{ id: string; label: string }[]>([]);
  const [now, setNow] = useState(() => new Date());
  const firstSeen = useRef<Map<string, number>>(new Map());
  const seen = useRef<Set<string> | null>(null);
  const lastEvent = useRealtime((s) => s.lastEvent);

  // Đọc cấu hình máy bếp sau khi gắn vào trình duyệt (tránh lệch SSR)
  useEffect(() => {
    const st = storageGet(STATION_KEY);
    setStation(st === null ? null : st === '' ? 'ALL' : st);
    setSound(storageGet(SOUND_KEY) === '1');
    setReady(true);
    const t = setInterval(() => setNow(new Date()), 5_000);
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      clearInterval(t);
      document.removeEventListener('fullscreenchange', onFs);
    };
  }, []);

  const stationCode = station === 'ALL' ? null : station;
  const tickets = useKds(stationCode, view);
  const activeForAllDay = useKds(stationCode, 'active');

  // Phát hiện phiếu mới: âm báo (nếu bật) và làm nổi bật
  useEffect(() => {
    const data = tickets.data;
    if (!data || view !== 'active') return;
    const ids = new Set(data.map((t) => t.id));
    const nowMs = Date.now();
    for (const id of ids) if (!firstSeen.current.has(id)) firstSeen.current.set(id, seen.current ? nowMs : 0);
    if (seen.current && [...ids].some((id) => !seen.current!.has(id)) && sound) beep();
    seen.current = ids;
  }, [tickets.data, view, sound]);
  useEffect(() => {
    if (lastEvent?.type === 'kitchen.ticket.voided' && sound) beep(true);
  }, [lastEvent, sound]);

  const choose = (code: string) => {
    setStation(code);
    storageSet(STATION_KEY, code === 'ALL' ? '' : code);
    seen.current = null;
    reconnectRealtime();
  };
  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    storageSet(SOUND_KEY, next ? '1' : '0');
    if (next) beep();
  };
  const toggleFullscreen = () => {
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
    } catch {
      toast.info('Trình duyệt không hỗ trợ toàn màn hình');
    }
  };

  const onError = (e: unknown) => toast.error(errorMessage(e));
  const invalidate = () => [['kds'], keys.floor(branchId)] as const;
  const start = useAction((id: string) => kdsApi.start(id), invalidate);
  const bump = useAction((t: KdsTicket) => kdsApi.bump(t.id), invalidate, (_, t) => {
    setBumped((cur) => [{ id: t.id, label: `${t.tableNames.join('+') || t.sessionCode} #${t.seq}` }, ...cur.filter((x) => x.id !== t.id)].slice(0, 10));
  });
  const recall = useAction((id: string) => kdsApi.recall(id), invalidate, (_, id) => {
    setBumped((cur) => cur.filter((x) => x.id !== id));
    toast.success('Đã gọi lại phiếu');
  });
  const bumpLine = useAction((input: { ticketId: string; lineId: string }) => kdsApi.bumpLine(input.ticketId, input.lineId), invalidate);

  const sorted = useMemo(() => sortTickets(tickets.data ?? [], view), [tickets.data, view]);
  const counts = useMemo(() => countByLevel(view === 'active' ? sorted : [], now), [sorted, view, now]);
  const allDayRows = useMemo(() => allDay(activeForAllDay.data ?? []), [activeForAllDay.data]);
  const stationName = station === 'ALL' ? 'Expo · tất cả trạm' : (stations.data?.find((s) => s.code === station)?.name ?? station ?? '');

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950">
        <Spinner />
      </div>
    );
  }

  // Lần đầu: chọn trạm cho máy bếp này
  if (!station) {
    return (
      <div className="flex h-full flex-col bg-zinc-950 text-zinc-100">
        <div className="flex items-center gap-2 px-4 py-3">
          <Link href="/" className="flex h-11 items-center gap-2 rounded-xl bg-white/10 px-4 font-semibold hover:bg-white/20">
            <Home className="h-5 w-5" /> Trang chủ
          </Link>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-5 overflow-y-auto p-6">
          <ChefHat className="h-12 w-12 text-amber-400" />
          <h1 className="text-center text-2xl font-bold">Chọn trạm bếp cho màn hình này</h1>
          <p className="max-w-md text-center text-zinc-400">Mỗi máy bếp hiện phiếu của trạm được chọn. Chọn “Expo” cho vị trí ra món để thấy mọi trạm.</p>
          {stations.isLoading && <Spinner />}
          {stations.isError && <p className="text-red-400">{errorMessage(stations.error)}</p>}
          <div className="grid w-full max-w-3xl grid-cols-2 gap-3 sm:grid-cols-3">
            {stations.data?.map((s) => (
              <button key={s.id} type="button" onClick={() => choose(s.code)} className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-white/10 bg-white/5 text-xl font-bold hover:border-amber-400">
                {s.color && <span className="h-2 w-10 rounded-full" style={{ background: s.color }} />}
                {s.name}
              </button>
            ))}
            <button type="button" onClick={() => choose('ALL')} className="min-h-24 rounded-2xl border-2 border-dashed border-white/30 text-xl font-bold hover:border-amber-400">
              Expo (tất cả trạm)
            </button>
          </div>
        </div>
      </div>
    );
  }

  const lastBumped = bumped[0];
  const showAside = view === 'active' && allDayOpen;

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-100">
      {/* Thanh điều khiển bếp */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2">
        <Link href="/" className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20" aria-label="Về trang chủ" title="Về trang chủ">
          <Home className="h-5 w-5" />
        </Link>
        <div className="relative">
          <select
            value={station}
            onChange={(e) => choose(e.target.value)}
            className="h-11 appearance-none rounded-xl bg-white/10 pr-9 pl-3 text-lg font-bold text-white outline-none focus:ring-2 focus:ring-amber-400"
            aria-label="Chọn trạm bếp"
          >
            <option value="ALL" className="text-ink-900">Expo · tất cả trạm</option>
            {stations.data?.map((s) => (
              <option key={s.id} value={s.code} className="text-ink-900">
                {s.name}
              </option>
            ))}
            {!stations.data?.some((s) => s.code === station) && station !== 'ALL' && <option value={station}>{stationName}</option>}
          </select>
          <ChevronDown className="pointer-events-none absolute top-1/2 right-2 h-5 w-5 -translate-y-1/2 text-white/70" />
        </div>
        {view === 'active' && (
          <span className="flex items-center gap-1.5 text-sm font-bold tabular-nums" title={`Xanh < ${KDS_AGE.WARN_MIN}′ · Vàng < ${KDS_AGE.LATE_MIN}′ · Đỏ ≥ ${KDS_AGE.LATE_MIN}′`}>
            <span className="rounded-lg bg-emerald-600 px-2.5 py-1">{counts.ok}</span>
            <span className="rounded-lg bg-amber-500 px-2.5 py-1 text-zinc-950">{counts.warn}</span>
            <span className={cn('rounded-lg bg-red-600 px-2.5 py-1', counts.late > 0 && 'animate-pulse')}>{counts.late}</span>
          </span>
        )}
        {tickets.isFetching && <Spinner className="h-5 w-5 border-white/30 border-t-white" />}
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          {lastBumped && view === 'active' && (
            <button type="button" onClick={() => recall.mutate(lastBumped.id, { onError })} disabled={recall.isPending} className="flex h-11 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-sm font-semibold hover:bg-white/20" title="Gọi lại phiếu vừa bấm xong">
              <Undo2 className="h-5 w-5" /> <span className="hidden sm:inline">Gọi lại</span> {lastBumped.label}
            </button>
          )}
          <button type="button" onClick={() => setView(view === 'active' ? 'done' : 'active')} className={cn('flex h-11 items-center gap-1.5 rounded-xl px-3 font-semibold', view === 'done' ? 'bg-white text-zinc-900' : 'bg-white/10 hover:bg-white/20')}>
            <History className="h-5 w-5" /> {view === 'done' ? 'Về phiếu đang chờ' : 'Đã xong'}
          </button>
          {view === 'active' && (
            <button
              type="button"
              onClick={() => {
                if (window.matchMedia('(min-width: 1024px)').matches) setAllDayOpen((v) => !v);
                else setAllDaySheet(true);
              }}
              className={cn('flex h-11 items-center gap-1.5 rounded-xl px-3 font-semibold', allDayOpen ? 'bg-white/10 hover:bg-white/20 lg:bg-amber-400 lg:text-zinc-950' : 'bg-white/10 hover:bg-white/20')}
            >
              <ListChecks className="h-5 w-5" /> <span className="hidden sm:inline">Tổng món</span>
            </button>
          )}
          <button type="button" onClick={() => setSoldOutOpen(true)} className="flex h-11 items-center gap-1.5 rounded-xl bg-white/10 px-3 font-semibold hover:bg-white/20">
            <Ban className="h-5 w-5" /> <span className="hidden sm:inline">Hết món</span>
          </button>
          <button type="button" onClick={toggleSound} className={cn('flex h-11 w-11 items-center justify-center rounded-xl', sound ? 'bg-emerald-600' : 'bg-white/10 hover:bg-white/20')} aria-label={sound ? 'Tắt âm báo' : 'Bật âm báo'} aria-pressed={sound} title={sound ? 'Âm báo: bật' : 'Âm báo: tắt'}>
            {sound ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </button>
          <button type="button" onClick={toggleFullscreen} className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20" aria-label={fullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}>
            {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </button>
        </span>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-3">
          {tickets.isLoading && (
            <div className="flex items-center justify-center gap-3 py-20 text-zinc-400">
              <Spinner /> Đang tải phiếu...
            </div>
          )}
          {tickets.isError && (
            <div className="mx-auto max-w-md rounded-2xl bg-red-950 p-4 text-center">
              <p className="mb-3 font-semibold text-red-200">{errorMessage(tickets.error)}</p>
              <Button variant="outline" onClick={() => tickets.refetch()}>Thử lại</Button>
            </div>
          )}
          {!tickets.isLoading && !tickets.isError && sorted.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-24 text-center text-zinc-500">
              <Check className="h-14 w-14" />
              <p className="text-2xl font-semibold">{view === 'active' ? 'Không còn phiếu nào đang chờ' : 'Chưa có phiếu xong trong 2 giờ qua'}</p>
            </div>
          )}
          <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {sorted.map((t) => {
              const seenAt = firstSeen.current.get(t.id) ?? 0;
              const fresh = view === 'active' && seenAt > 0 && now.getTime() - seenAt < NEW_TICKET_HIGHLIGHT_SEC * 1000;
              return (
                <TicketCard
                  key={t.id}
                  ticket={t}
                  now={now}
                  view={view}
                  fresh={fresh}
                  showStation={station === 'ALL'}
                  busy={(bump.isPending && bump.variables?.id === t.id) || (start.isPending && start.variables === t.id)}
                  lineBusy={bumpLine.isPending ? bumpLine.variables?.lineId : undefined}
                  onStart={() => start.mutate(t.id, { onError })}
                  onBump={() => bump.mutate(t, { onError })}
                  onRecall={() => recall.mutate(t.id, { onError })}
                  onBumpLine={(lineId) => bumpLine.mutate({ ticketId: t.id, lineId }, { onError })}
                />
              );
            })}
          </div>
        </div>
        {showAside && (
          <aside className="scrollbar-thin hidden w-72 shrink-0 overflow-y-auto border-l border-white/10 bg-zinc-900 p-3 lg:block">
            <AllDayList rows={allDayRows} />
          </aside>
        )}
      </div>

      <Dialog open={allDaySheet} onClose={() => setAllDaySheet(false)} title="Tổng món đang chờ" size="sm">
        <div className="-mx-4 -my-3 bg-zinc-900 p-3 text-zinc-100">
          <AllDayList rows={allDayRows} />
        </div>
      </Dialog>
      <SoldOutDialog open={soldOutOpen} onClose={() => setSoldOutOpen(false)} />
    </div>
  );
}

function AllDayList({ rows }: { rows: ReturnType<typeof allDay> }) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold tracking-wide text-amber-400 uppercase">
        <ListChecks className="h-4 w-4" /> Tổng món đang chờ
      </h3>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500">Không có món nào đang chờ</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2">
              <span className="min-w-10 text-right text-2xl font-black text-amber-300 tabular-nums">{qty(r.quantity)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{r.name}</span>
                {r.modifiers && <span className="block truncate text-xs text-amber-200/80">{r.modifiers}</span>}
                <span className="block text-[11px] text-zinc-500">
                  {r.unit === 'kg' ? 'phần' : r.unit} · {r.tickets} phiếu
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface TicketCardProps {
  ticket: KdsTicket;
  now: Date;
  view: 'active' | 'done';
  fresh: boolean;
  showStation: boolean;
  busy: boolean;
  lineBusy?: string;
  onStart: () => void;
  onBump: () => void;
  onRecall: () => void;
  onBumpLine: (lineId: string) => void;
}

function TicketCard({ ticket: t, now, view, fresh, showStation, busy, lineBusy, onStart, onBump, onRecall, onBumpLine }: TicketCardProps) {
  const minutes = ticketMinutes(t, now);
  const level: AgeLevel = view === 'done' ? 'ok' : ageLevel(minutes);
  const rush = isRush(t);
  const remaining = t.lines.filter((l) => l.status === 'NEW' || l.status === 'IN_PROGRESS').length;
  return (
    <article className={cn('flex flex-col overflow-hidden rounded-2xl border-2 bg-zinc-900 shadow-lg', view === 'done' ? 'border-white/10 opacity-80' : LEVEL_BORDER[level], fresh && 'ring-4 ring-sky-400', t.status === 'RECALLED' && 'ring-4 ring-fuchsia-500')}>
      <header className={cn('flex items-start gap-2 px-3 py-2 text-white', view === 'done' ? 'bg-zinc-700' : LEVEL_HEAD[level])}>
        <div className="min-w-0 flex-1">
          <div className="truncate text-2xl leading-tight font-black">{t.tableNames.join(' + ') || t.sessionCode}</div>
          <div className="flex flex-wrap items-center gap-x-2 text-xs font-semibold opacity-90">
            <span>#{t.seq}</span>
            <span>Đợt {t.course}</span>
            <span>{t.guestCount} khách</span>
            {showStation && <span className="rounded bg-black/20 px-1">{t.station.name}</span>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl leading-tight font-black tabular-nums">{view === 'done' ? '✓' : clock(t, now)}</div>
          {t.status === 'IN_PROGRESS' && <div className="text-[11px] font-bold uppercase opacity-90">Đang làm</div>}
          {t.status === 'NEW' && view === 'active' && <div className="text-[11px] font-bold uppercase opacity-90">Mới</div>}
        </div>
      </header>
      {(rush || fresh || t.status === 'RECALLED' || t.orderSource === 'GUEST') && (
        <div className="flex flex-wrap gap-1.5 bg-zinc-800 px-3 py-1.5 text-xs font-black uppercase">
          {rush && (
            <span className="flex items-center gap-1 rounded bg-red-600 px-2 py-0.5 text-white">
              <Zap className="h-3.5 w-3.5" /> {t.isVip ? 'VIP · ưu tiên' : 'Ưu tiên'}
            </span>
          )}
          {fresh && <span className="rounded bg-sky-500 px-2 py-0.5 text-zinc-950">Phiếu mới</span>}
          {t.status === 'RECALLED' && <span className="rounded bg-fuchsia-600 px-2 py-0.5 text-white">Gọi lại</span>}
          {t.orderSource === 'GUEST' && <span className="rounded bg-white/15 px-2 py-0.5 text-white">Khách QR</span>}
        </div>
      )}
      {t.orderNotes && (
        <div className="flex items-start gap-1.5 bg-amber-400 px-3 py-1.5 text-sm font-bold text-zinc-950">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {t.orderNotes}
        </div>
      )}
      <ul className="divide-y divide-white/10">
        {t.lines.map((l) => {
          const done = l.status === 'DONE';
          const voided = l.status === 'VOIDED';
          const canBump = view === 'active' && !done && !voided;
          return (
            <li key={l.id}>
              <button
                type="button"
                disabled={!canBump || lineBusy === l.id}
                onClick={() => onBumpLine(l.id)}
                className={cn('flex min-h-14 w-full items-start gap-3 px-3 py-2 text-left transition', canBump && 'hover:bg-white/5 active:bg-white/10', (done || voided) && 'opacity-40')}
                aria-label={canBump ? `Xong món ${l.name}` : l.name}
              >
                <span className="min-w-9 text-right text-3xl leading-none font-black tabular-nums">{l.unit === 'kg' && l.weightKg ? '1' : qty(l.quantity)}</span>
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-lg leading-tight font-bold', (done || voided) && 'line-through')}>{l.name}</span>
                  {l.weightKg && <span className="block text-sm font-semibold text-zinc-300">{qty(l.weightKg)} kg</span>}
                  {l.modifiers.length > 0 && <span className="block text-base font-bold text-amber-300">{l.modifiers.map((m) => m.optionName).join(' · ')}</span>}
                  {l.note && <span className="mt-1 block rounded-lg bg-amber-400 px-2 py-0.5 text-sm font-black text-zinc-950">⚠ {l.note}</span>}
                  <span className="flex gap-2 text-xs text-zinc-400">
                    {l.seatNo && <span>Ghế {l.seatNo}</span>}
                    {l.course !== t.course && <span>Đợt {l.course}</span>}
                    {voided && <span className="font-bold text-red-400">ĐÃ HỦY</span>}
                  </span>
                </span>
                {canBump && <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-white/30">{lineBusy === l.id ? <Spinner className="h-4 w-4" /> : <Check className="h-5 w-5 text-white/60" />}</span>}
                {done && <Check className="mt-1 h-6 w-6 shrink-0 text-emerald-400" />}
                {voided && <X className="mt-1 h-6 w-6 shrink-0 text-red-400" />}
              </button>
            </li>
          );
        })}
      </ul>
      <footer className="mt-auto flex gap-2 border-t border-white/10 p-2">
        {view === 'done' ? (
          <button type="button" onClick={onRecall} disabled={busy} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-white/10 font-bold hover:bg-white/20">
            <RotateCcw className="h-5 w-5" /> Gọi lại phiếu
          </button>
        ) : (
          <>
            {t.status === 'NEW' && (
              <button type="button" onClick={onStart} disabled={busy} className="flex min-h-14 items-center justify-center gap-1.5 rounded-xl bg-white/10 px-4 font-bold hover:bg-white/20">
                <Play className="h-5 w-5" /> Làm
              </button>
            )}
            <button type="button" onClick={onBump} disabled={busy} className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-lg font-black text-white hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-60">
              {busy ? <Spinner className="h-5 w-5 border-white/40 border-t-white" /> : <Check className="h-6 w-6" />} Xong phiếu{remaining > 0 && remaining < t.lines.length ? ` (${remaining})` : ''}
            </button>
          </>
        )}
      </footer>
    </article>
  );
}

/** Báo hết món nhanh từ bếp (86): hết hôm nay, hết hẳn hoặc mở bán lại. */
function SoldOutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const branchId = useBranchId();
  const menu = useMenu();
  const [q, setQ] = useState('');
  const all = useMemo(() => {
    const seen = new Set<string>();
    return (menu.data?.menus ?? []).flatMap((m) => m.categories.flatMap((c) => c.items)).filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)));
  }, [menu.data]);
  const items = useMemo(() => all.filter((i) => matchesSearch(i.name, q)).sort((a, b) => Number(b.soldOut) - Number(a.soldOut)).slice(0, 60), [all, q]);
  const act = useAction((input: { itemId: string; mode: 'today' | 'indefinite' | 'clear' }) => kdsApi.soldOut(branchId, input.itemId, input.mode), () => [keys.menu(branchId)], () => toast.success('Đã cập nhật trạng thái món'));
  const onError = (e: unknown) => toast.error(errorMessage(e));
  const soldCount = all.filter((i) => i.soldOut).length;
  return (
    <Dialog open={open} onClose={onClose} title={`Báo hết món${soldCount ? ` · đang hết ${soldCount}` : ''}`} size="md">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm món (không cần dấu)..." className="mb-2 min-h-12 w-full rounded-xl border border-ink-300 px-3 text-lg outline-none focus:border-brand-500" />
      {menu.isLoading && <p className="py-6 text-center text-ink-500">Đang tải thực đơn...</p>}
      <ul className="divide-y divide-ink-100">
        {items.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-2 py-2">
            <span className="min-w-0 flex-1 font-semibold">
              {i.name}
              {i.soldOut && <span className="ml-2 rounded-full bg-red-600 px-2 text-xs text-white">Đang hết</span>}
            </span>
            {i.soldOut ? (
              <Button size="sm" variant="success" onClick={() => act.mutate({ itemId: i.id, mode: 'clear' }, { onError })}>Mở bán lại</Button>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={() => act.mutate({ itemId: i.id, mode: 'today' }, { onError })}>Hết hôm nay</Button>
                <Button size="sm" variant="danger" onClick={() => act.mutate({ itemId: i.id, mode: 'indefinite' }, { onError })}>Hết hẳn</Button>
              </>
            )}
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
