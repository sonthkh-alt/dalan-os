'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Ban, Check, History, ListChecks, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { matchesSearch } from '@dalan/domain';
import { errorMessage } from '@/lib/api';
import { useBranchId } from '@/lib/auth-store';
import { kdsApi, keys, useAction, useKds, useKdsAggregate, useMenu, useStations } from '@/lib/queries';
import { reconnectRealtime, useRealtime } from '@/lib/socket';
import type { KdsTicket } from '@/lib/types';
import { cn, qty } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Loading } from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';

const AGE_STYLE = { ok: 'border-emerald-500 bg-emerald-50', warn: 'border-amber-500 bg-amber-50', late: 'border-red-600 bg-red-50' } as const;
const AGE_HEAD = { ok: 'bg-emerald-600', warn: 'bg-amber-500', late: 'bg-red-600' } as const;

function beep() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 880;
    g.gain.value = 0.15;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.frequency.setValueAtTime(1175, ctx.currentTime + 0.12);
    o.stop(ctx.currentTime + 0.3);
  } catch {
    /* trình duyệt chặn âm thanh khi chưa tương tác */
  }
}

export function KdsScreen() {
  const branchId = useBranchId();
  const stations = useStations();
  const [station, setStation] = useState<string | null>(() => (typeof window !== 'undefined' ? window.localStorage.getItem('dalan-kds-station') : null));
  const [view, setView] = useState<'active' | 'done'>('active');
  const [sound, setSound] = useState(true);
  const [soldOutOpen, setSoldOutOpen] = useState(false);
  const tickets = useKds(station === 'ALL' ? null : station, view);
  const aggregate = useKdsAggregate(station === 'ALL' ? null : station);
  const seen = useRef<Set<string> | null>(null);
  const lastEvent = useRealtime((s) => s.lastEvent);

  useEffect(() => {
    const data = tickets.data;
    if (!data || view !== 'active') return;
    const ids = new Set(data.map((t) => t.id));
    if (seen.current) {
      const fresh = [...ids].some((id) => !seen.current!.has(id));
      if (fresh && sound) beep();
    }
    seen.current = ids;
  }, [tickets.data, view, sound]);
  useEffect(() => {
    if (lastEvent?.type === 'kitchen.ticket.voided' && sound) beep();
  }, [lastEvent, sound]);

  const choose = (code: string) => {
    setStation(code);
    window.localStorage.setItem('dalan-kds-station', code === 'ALL' ? '' : code);
    reconnectRealtime();
  };
  const onError = (e: unknown) => toast.error(errorMessage(e));
  const invalidate = () => [['kds'], keys.floor(branchId)] as const;
  const start = useAction((id: string) => kdsApi.start(id), invalidate);
  const bump = useAction((id: string) => kdsApi.bump(id), invalidate);
  const recall = useAction((id: string) => kdsApi.recall(id), invalidate);
  const bumpLine = useAction((input: { ticketId: string; lineId: string }) => kdsApi.bumpLine(input.ticketId, input.lineId), invalidate);

  const sorted = useMemo(() => (tickets.data ?? []).slice().sort((a, b) => (view === 'done' ? (b.bumpedAt ?? '').localeCompare(a.bumpedAt ?? '') : b.priority - a.priority || a.firedAt.localeCompare(b.firedAt))), [tickets.data, view]);

  if (!station) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
        <h1 className="text-2xl font-bold">Chọn trạm bếp cho màn hình này</h1>
        {stations.isLoading && <Loading />}
        <div className="grid w-full max-w-2xl grid-cols-2 gap-3 sm:grid-cols-3">
          {stations.data?.map((s) => (
            <button key={s.id} type="button" onClick={() => choose(s.code)} className="min-h-[80px] rounded-2xl border-2 border-ink-100 bg-white text-xl font-bold hover:border-brand-500">{s.name}</button>
          ))}
          <button type="button" onClick={() => choose('ALL')} className="min-h-[80px] rounded-2xl border-2 border-dashed border-ink-300 bg-paper text-xl font-bold">Expo (tất cả trạm)</button>
        </div>
      </div>
    );
  }

  const stationName = station === 'ALL' ? 'Expo – tất cả trạm' : (stations.data?.find((s) => s.code === station)?.name ?? station);
  const counts = { ok: sorted.filter((t) => t.ageLevel === 'ok').length, warn: sorted.filter((t) => t.ageLevel === 'warn').length, late: sorted.filter((t) => t.ageLevel === 'late').length };

  return (
    <div className="flex h-full flex-col bg-ink-900 text-white">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <button type="button" onClick={() => { window.localStorage.removeItem('dalan-kds-station'); setStation(null); }} className="rounded-xl bg-white/10 px-3 py-2 text-lg font-bold">{stationName}</button>
        {view === 'active' && (
          <span className="flex gap-1 text-sm">
            <span className="rounded-full bg-emerald-600 px-2 py-0.5">{counts.ok}</span>
            <span className="rounded-full bg-amber-500 px-2 py-0.5">{counts.warn}</span>
            <span className="rounded-full bg-red-600 px-2 py-0.5">{counts.late}</span>
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => setView(view === 'active' ? 'done' : 'active')} className={cn('flex min-h-[44px] items-center gap-1 rounded-xl px-3 font-semibold', view === 'done' ? 'bg-white text-ink-900' : 'bg-white/10')}>
            <History className="h-5 w-5" /> {view === 'done' ? 'Đang chờ' : 'Đã xong'}
          </button>
          <button type="button" onClick={() => setSoldOutOpen(true)} className="flex min-h-[44px] items-center gap-1 rounded-xl bg-white/10 px-3 font-semibold"><Ban className="h-5 w-5" /> Hết món</button>
          <button type="button" onClick={() => setSound(!sound)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10" aria-label="Âm báo">{sound ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}</button>
        </span>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="scrollbar-thin min-h-0 flex-1 overflow-x-auto overflow-y-hidden p-2">
          {tickets.isLoading && <Loading label="Đang tải phiếu..." />}
          {!tickets.isLoading && sorted.length === 0 && <p className="py-20 text-center text-2xl text-white/60">{view === 'active' ? 'Không có phiếu đang chờ' : 'Chưa có phiếu xong trong 2 giờ qua'}</p>}
          <div className="grid h-full auto-cols-[280px] grid-flow-col grid-rows-1 gap-2 sm:auto-cols-[300px]">
            {sorted.map((t) => (
              <TicketCard key={t.id} ticket={t} view={view} busy={bump.isPending || start.isPending} onStart={() => start.mutate(t.id, { onError })} onBump={() => bump.mutate(t.id, { onError })} onRecall={() => recall.mutate(t.id, { onError })} onBumpLine={(lineId) => bumpLine.mutate({ ticketId: t.id, lineId }, { onError })} />
            ))}
          </div>
        </div>
        {view === 'active' && (aggregate.data?.length ?? 0) > 0 && (
          <aside className="hidden w-56 shrink-0 overflow-y-auto border-l border-white/10 p-2 lg:block">
            <h3 className="mb-1 flex items-center gap-1 text-sm font-semibold text-white/70"><ListChecks className="h-4 w-4" /> Đang chờ theo món</h3>
            <ul className="space-y-1">
              {aggregate.data?.map((a) => (
                <li key={a.name} className="flex items-center justify-between gap-2 rounded-lg bg-white/10 px-2 py-1 text-sm">
                  <span className="truncate">{a.name}</span>
                  <b className="tabular-nums">{qty(a.quantity)}</b>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
      <SoldOutDialog open={soldOutOpen} onClose={() => setSoldOutOpen(false)} />
    </div>
  );
}

function TicketCard({ ticket: t, view, busy, onStart, onBump, onRecall, onBumpLine }: { ticket: KdsTicket; view: 'active' | 'done'; busy: boolean; onStart: () => void; onBump: () => void; onRecall: () => void; onBumpLine: (lineId: string) => void }) {
  const [age, setAge] = useState(t.ageMinutes);
  useEffect(() => {
    setAge(t.ageMinutes);
    const i = setInterval(() => setAge((a) => a + 1), 60_000);
    return () => clearInterval(i);
  }, [t.ageMinutes]);
  const level = view === 'done' ? 'ok' : age >= 20 ? 'late' : age >= 10 ? 'warn' : 'ok';
  return (
    <div className={cn('flex h-full flex-col overflow-hidden rounded-2xl border-4 text-ink-900', AGE_STYLE[level])}>
      <div className={cn('flex items-center gap-2 px-3 py-2 text-white', AGE_HEAD[level])}>
        <span className="text-2xl font-black">{t.tableNames.join('+') || t.sessionCode}</span>
        {t.isVip && <span className="rounded bg-white/25 px-1.5 text-xs font-bold">VIP</span>}
        <span className="ml-auto text-right text-sm leading-tight">
          <span className="block text-lg font-bold tabular-nums">{age}′</span>
          <span className="block opacity-80">#{t.seq} · đợt {t.course}</span>
        </span>
      </div>
      {t.orderSource === 'GUEST' && <div className="bg-brand-100 px-3 py-0.5 text-xs font-semibold text-brand-800">Khách gọi qua QR</div>}
      {t.orderNotes && <div className="bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">“{t.orderNotes}”</div>}
      <ul className="scrollbar-thin flex-1 divide-y divide-ink-100 overflow-y-auto">
        {t.lines.map((l) => {
          const done = l.status === 'DONE' || l.status === 'VOIDED';
          return (
            <li key={l.id} className={cn('flex items-start gap-2 px-3 py-2', done && 'opacity-50')}>
              <span className="w-10 shrink-0 text-right text-2xl font-black tabular-nums">{qty(l.quantity)}</span>
              <div className="min-w-0 flex-1">
                <div className={cn('text-lg leading-tight font-bold', l.status === 'VOIDED' && 'line-through')}>{l.name}</div>
                {l.weightKg && <div className="text-sm">{l.weightKg} kg</div>}
                {l.modifiers.length > 0 && <div className="text-sm font-semibold text-brand-800">{l.modifiers.map((m) => m.optionName).join(', ')}</div>}
                {l.note && <div className="text-sm font-bold text-amber-900">⚠ {l.note}</div>}
                {l.seatNo && <div className="text-xs text-ink-500">Ghế {l.seatNo}</div>}
              </div>
              {view === 'active' && !done && (
                <button type="button" onClick={() => onBumpLine(l.id)} disabled={busy} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white" aria-label="Món này xong"><Check className="h-6 w-6" /></button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex gap-2 p-2">
        {view === 'done' ? (
          <Button block variant="outline" onClick={onRecall} disabled={busy}><RotateCcw className="h-5 w-5" /> Gọi lại</Button>
        ) : (
          <>
            {t.status === 'NEW' && <Button variant="outline" size="lg" onClick={onStart} disabled={busy}><Play className="h-5 w-5" /> Làm</Button>}
            <Button block size="lg" variant="success" onClick={onBump} disabled={busy}><Check className="h-6 w-6" /> Xong cả phiếu</Button>
          </>
        )}
      </div>
    </div>
  );
}

function SoldOutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const branchId = useBranchId();
  const menu = useMenu();
  const [q, setQ] = useState('');
  const items = useMemo(() => (menu.data?.menus ?? []).flatMap((m) => m.categories.flatMap((c) => c.items)).filter((i) => matchesSearch(i.name, q)).slice(0, 40), [menu.data, q]);
  const act = useAction((input: { itemId: string; mode: 'today' | 'indefinite' | 'clear' }) => kdsApi.soldOut(branchId, input.itemId, input.mode), () => [keys.menu(branchId)], () => toast.success('Đã cập nhật'));
  return (
    <Dialog open={open} onClose={onClose} title="Báo hết món" size="md">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm món..." className="mb-2 min-h-[48px] w-full rounded-xl border border-ink-300 px-3 text-lg outline-none focus:border-brand-500" autoFocus />
      <ul className="divide-y divide-ink-100">
        {items.map((i) => (
          <li key={i.id} className="flex items-center gap-2 py-2">
            <span className="flex-1 font-semibold">{i.name}{i.soldOut && <span className="ml-2 rounded-full bg-red-600 px-2 text-xs text-white">Đang hết</span>}</span>
            {i.soldOut ? (
              <Button size="sm" variant="success" onClick={() => act.mutate({ itemId: i.id, mode: 'clear' })}>Mở bán lại</Button>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={() => act.mutate({ itemId: i.id, mode: 'today' })}>Hết hôm nay</Button>
                <Button size="sm" variant="danger" onClick={() => act.mutate({ itemId: i.id, mode: 'indefinite' })}>Hết hẳn</Button>
              </>
            )}
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
