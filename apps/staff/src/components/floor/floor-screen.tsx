'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Users } from 'lucide-react';
import type { TableDisplayStatus } from '@dalan/contracts';
import { useFloor, sessionApi, useAction, keys } from '@/lib/queries';
import { useBranchId } from '@/lib/auth-store';
import type { FloorTable } from '@/lib/types';
import { cn, elapsed, moneyShort } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { NumberPad } from '@/components/ui/number-pad';
import { Loading } from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api';

const STATUS_STYLE: Record<TableDisplayStatus, { bg: string; label: string }> = {
  EMPTY: { bg: 'bg-status-empty text-ink-700', label: 'Trống' },
  RESERVED: { bg: 'bg-gold-100 text-ink-900', label: 'Đã đặt' },
  PENDING: { bg: 'bg-status-pending text-ink-900 border-dashed', label: 'Khách QR chờ' },
  SEATED: { bg: 'bg-status-seated text-ink-900', label: 'Đang ngồi' },
  COOKING: { bg: 'bg-status-cooking text-ink-900', label: 'Đang nấu' },
  READY: { bg: 'bg-status-ready text-ink-900', label: 'Món sẵn sàng' },
  BILL: { bg: 'bg-status-bill text-ink-900', label: 'Chờ thanh toán' },
  PAID: { bg: 'bg-status-paid text-ink-900', label: 'Đã trả' },
  CLEANING: { bg: 'bg-ink-100 text-ink-700', label: 'Đang dọn' },
};

export function FloorScreen() {
  const router = useRouter();
  const branchId = useBranchId();
  const floor = useFloor();
  const [areaId, setAreaId] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<FloorTable[]>([]);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const areas = floor.data?.areas ?? [];
  const area = areas.find((a) => a.id === areaId) ?? areas[0];
  const counts = useMemo(() => {
    const all = areas.flatMap((a) => a.tables);
    return { total: all.length, busy: all.filter((t) => t.status !== 'EMPTY').length, requests: all.reduce((s, t) => s + (t.session?.openRequests ?? 0), 0) };
  }, [areas]);

  const open = useAction((input: { tableIds: string[]; guestCount: number }) => sessionApi.open(branchId, input), () => [keys.floor(branchId)], (session) => {
    setSelecting([]);
    router.push(`/sessions/${session.id}`);
  });

  const onTap = (t: FloorTable) => {
    if (t.session) {
      if (selecting.length > 0) return toast.info('Bỏ chọn bàn trống trước khi mở bàn đang có khách');
      router.push(`/sessions/${t.session.id}`);
      return;
    }
    setSelecting((cur) => (cur.some((x) => x.id === t.id) ? cur.filter((x) => x.id !== t.id) : [...cur, t]));
  };

  if (floor.isLoading) return <Loading label="Đang tải sơ đồ bàn..." />;
  if (floor.isError) return <div className="p-4 text-red-700">{errorMessage(floor.error)}</div>;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 overflow-x-auto px-3 py-2 no-scrollbar">
        {areas.map((a) => {
          const busy = a.tables.filter((t) => t.status !== 'EMPTY').length;
          return (
            <button key={a.id} type="button" onClick={() => setAreaId(a.id)} className={cn('flex min-h-[44px] shrink-0 items-center gap-2 rounded-full px-4 font-semibold', area?.id === a.id ? 'bg-brand-700 text-white' : 'bg-white text-ink-700 border border-ink-100')}>
              {a.name}
              <span className={cn('rounded-full px-2 text-xs', area?.id === a.id ? 'bg-white/20' : 'bg-ink-100')}>
                {busy}/{a.tables.length}
              </span>
            </button>
          );
        })}
        <button type="button" onClick={() => floor.refetch()} className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-500 hover:bg-ink-100" aria-label="Làm mới">
          <RefreshCw className={cn('h-5 w-5', floor.isFetching && 'animate-spin')} />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-2 text-xs text-ink-500">
        <span>
          Đang phục vụ <b className="text-ink-900">{counts.busy}</b>/{counts.total} bàn
        </span>
        {counts.requests > 0 && <span className="font-semibold text-red-700">{counts.requests} yêu cầu khách chưa xử lý</span>}
        <span className="ml-auto flex gap-2">
          {(['EMPTY', 'SEATED', 'COOKING', 'READY', 'BILL', 'PENDING'] as TableDisplayStatus[]).map((s) => (
            <span key={s} className="flex items-center gap-1">
              <span className={cn('h-3 w-3 rounded-sm', STATUS_STYLE[s].bg.split(' ')[0])} /> {STATUS_STYLE[s].label}
            </span>
          ))}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-24">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
          {area?.tables.map((t) => (
            <TableCard key={t.id} table={t} now={now} selected={selecting.some((x) => x.id === t.id)} onTap={() => onTap(t)} />
          ))}
        </div>
      </div>
      {selecting.length > 0 && (
        <div className="safe-bottom fixed inset-x-0 bottom-14 z-30 flex items-center gap-2 bg-white/95 px-3 py-2 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur md:bottom-0 md:left-20 lg:left-24">
          <span className="flex-1 truncate text-sm">
            Đã chọn: <b>{selecting.map((t) => t.name).join(', ')}</b>
          </span>
          <Button variant="ghost" onClick={() => setSelecting([])}>Bỏ chọn</Button>
          <OpenTableDialog tables={selecting} loading={open.isPending} onConfirm={(guestCount) => open.mutate({ tableIds: selecting.map((t) => t.id), guestCount }, { onError: (e) => toast.error(errorMessage(e)) })} />
        </div>
      )}
    </div>
  );
}

function TableCard({ table, now, selected, onTap }: { table: FloorTable; now: Date; selected: boolean; onTap: () => void }) {
  const style = STATUS_STYLE[table.status];
  const s = table.session;
  return (
    <button type="button" onClick={onTap} className={cn('relative flex min-h-[96px] flex-col rounded-2xl border-2 p-2 text-left transition active:scale-[0.98]', style.bg, selected ? 'border-brand-700 ring-2 ring-brand-300' : 'border-transparent', table.status === 'PENDING' && 'border-amber-500')}>
      <div className="flex items-start justify-between gap-1">
        <span className="text-base font-bold leading-tight">{table.name.replace(/^Bàn /, '')}</span>
        {s && s.openRequests > 0 && <span className="h-3 w-3 rounded-full bg-red-600 animate-pulse-dot" title="Khách yêu cầu" />}
      </div>
      {s ? (
        <>
          <span className="mt-auto flex items-center gap-1 text-xs">
            <Users className="h-3.5 w-3.5" /> {s.guestCount} · {elapsed(s.openedAt, now)}
          </span>
          <span className="text-sm font-semibold tabular-nums">{moneyShort(s.total)}</span>
          {s.linesReady > 0 && <span className="absolute right-2 bottom-2 rounded-full bg-emerald-700 px-1.5 text-[11px] font-bold text-white">{s.linesReady} món xong</span>}
        </>
      ) : (
        <span className="mt-auto text-xs opacity-70">
          {table.isPrivateRoom ? 'Phòng riêng · ' : ''}{table.maxSeats} chỗ
        </span>
      )}
    </button>
  );
}

function OpenTableDialog({ tables, onConfirm, loading }: { tables: FloorTable[]; onConfirm: (guestCount: number) => void; loading: boolean }) {
  const [open, setOpen] = useState(false);
  const [guests, setGuests] = useState('');
  const maxSeats = tables.reduce((s, t) => s + t.maxSeats, 0);
  return (
    <>
      <Button size="lg" onClick={() => { setGuests(String(Math.min(tables.length * 4, maxSeats))); setOpen(true); }}>
        Mở bàn ({tables.length})
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Mở ${tables.map((t) => t.name).join(' + ')}`} size="sm" mode="center">
        <p className="mb-2 text-sm text-ink-500">Số khách (tối đa {maxSeats} chỗ)</p>
        <div className="mb-3 rounded-xl bg-paper px-4 py-3 text-center text-4xl font-bold tabular-nums">{guests || '0'}</div>
        <NumberPad value={guests} onChange={(v) => setGuests(v.slice(0, 3))} maxLength={3} quick={[2, 4, 6, 8, 10].map((n) => ({ label: `${n}`, value: `${n}` }))} onSubmit={() => { if (!loading) { onConfirm(Number(guests) || 0); setOpen(false); } }} submitLabel={loading ? 'Đang mở...' : 'Mở bàn'} />
      </Dialog>
    </>
  );
}
