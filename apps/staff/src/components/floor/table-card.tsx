'use client';

import { Bell, Check, ChefHat, Clock, DoorClosed, MoreVertical, UserRound, Users } from 'lucide-react';
import type { TableDisplayStatus } from '@dalan/contracts';
import type { FloorTable } from '@/lib/types';
import { cn, moneyShort } from '@/lib/utils';
import { sessionOf, shortTableName, tableSignal, type Tone } from './floor-logic';

export const STATUS_META: Record<TableDisplayStatus, { bar: string; pill: string; label: string }> = {
  EMPTY: { bar: 'bg-status-empty', pill: 'bg-ink-100 text-ink-500', label: 'Trống' },
  RESERVED: { bar: 'bg-gold-300', pill: 'bg-gold-100 text-gold-700', label: 'Đã đặt' },
  PENDING: { bar: 'bg-status-pending', pill: 'bg-status-pending text-amber-900', label: 'Khách QR chờ' },
  SEATED: { bar: 'bg-status-seated', pill: 'bg-status-seated text-sky-900', label: 'Đã ngồi' },
  COOKING: { bar: 'bg-status-cooking', pill: 'bg-status-cooking text-orange-900', label: 'Đang nấu' },
  READY: { bar: 'bg-status-ready', pill: 'bg-status-ready text-emerald-900', label: 'Món đã xong' },
  BILL: { bar: 'bg-status-bill', pill: 'bg-status-bill text-violet-900', label: 'Chờ thanh toán' },
  PAID: { bar: 'bg-status-paid', pill: 'bg-status-paid text-emerald-900', label: 'Đã trả' },
  CLEANING: { bar: 'bg-ink-300', pill: 'bg-ink-100 text-ink-700', label: 'Đang dọn' },
};

export const TONE_CHIP: Record<Tone, string> = {
  ok: 'bg-emerald-50 text-emerald-800',
  warn: 'bg-amber-100 text-amber-900',
  late: 'bg-red-100 text-red-800',
};

/** Đồng hồ gọn "45′" hoặc "2g05" để vừa thẻ bàn. */
export function compactMinutes(m: number): string {
  if (m < 60) return `${m}′`;
  return `${Math.floor(m / 60)}g${String(m % 60).padStart(2, '0')}`;
}

export interface TableCardProps {
  table: FloorTable;
  now: Date;
  selected: boolean;
  onTap: () => void;
  /** Mở menu thao tác nhanh (chỉ bàn đang có khách). */
  onMenu?: () => void;
}

/** Thẻ bàn kiểu POS hiện đại: dải màu trạng thái, đồng hồ theo SLA, khách, tiền, yêu cầu, món chờ ra. */
export function TableCard({ table, now, selected, onTap, onMenu }: TableCardProps) {
  const meta = STATUS_META[table.status];
  const s = sessionOf(table);
  const sig = tableSignal(table, now);
  const ring = sig?.requests ? 'border-red-400 ring-2 ring-red-200' : sig?.readyWaiting ? 'border-emerald-500 ring-2 ring-emerald-200' : sig?.tone === 'late' ? 'border-red-300' : sig?.noOrder ? 'border-amber-400' : '';
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onTap}
        onContextMenu={(e) => {
          if (!onMenu) return;
          e.preventDefault();
          onMenu();
        }}
        aria-pressed={selected}
        aria-label={`${table.name}, ${meta.label}`}
        className={cn(
          'flex min-h-[132px] w-full flex-col overflow-hidden rounded-2xl border text-left shadow-sm transition active:scale-[0.98]',
          s ? 'border-ink-100 bg-white' : 'border-dashed border-ink-300 bg-white/70 hover:bg-white',
          ring,
          selected && 'border-brand-700 bg-brand-50 ring-4 ring-brand-200',
        )}
      >
        <span className={cn('h-1.5 w-full shrink-0', meta.bar)} />
        <div className="flex flex-1 flex-col gap-1.5 p-3">
          <div className="flex items-start gap-2 pr-10">
            <span className="min-w-0 flex-1 truncate text-xl leading-tight font-extrabold text-ink-900">{shortTableName(table.name)}</span>
            {table.isPrivateRoom && <DoorClosed className="mt-0.5 h-4 w-4 shrink-0 text-gold-700" aria-label="Phòng riêng" />}
          </div>
          <span className={cn('w-fit rounded-full px-2 py-0.5 text-[11px] font-bold', meta.pill)}>{meta.label}</span>
          {s && sig ? (
            <>
              <div className="mt-auto flex flex-wrap items-center gap-1.5 text-xs font-semibold">
                <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 tabular-nums', TONE_CHIP[sig.tone])}>
                  <Clock className="h-3.5 w-3.5" /> {compactMinutes(sig.minutes)}
                </span>
                <span className="inline-flex items-center gap-1 text-ink-700">
                  <Users className="h-3.5 w-3.5" /> {s.guestCount}
                </span>
                <span className="ml-auto text-sm font-bold text-ink-900 tabular-nums">{moneyShort(s.total)}</span>
              </div>
              {s.serverName && (
                <span className="flex items-center gap-1 truncate text-[11px] text-ink-500">
                  <UserRound className="h-3 w-3 shrink-0" /> {s.serverName}
                </span>
              )}
              {sig.reason && (
                <span className={cn('flex items-center gap-1 truncate rounded-lg px-2 py-1 text-[11px] font-bold', sig.requests ? 'bg-red-600 text-white' : sig.readyWaiting ? 'bg-emerald-600 text-white' : sig.tone === 'late' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900')}>
                  {sig.requests ? <Bell className="h-3.5 w-3.5 shrink-0" /> : sig.readyWaiting ? <ChefHat className="h-3.5 w-3.5 shrink-0" /> : null}
                  <span className="truncate">{sig.reason}</span>
                  {(sig.requests > 0 || sig.readyWaiting > 0) && <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-white animate-pulse-dot" />}
                </span>
              )}
            </>
          ) : (
            <span className="mt-auto text-xs text-ink-500">
              {table.minSeats && table.minSeats !== table.maxSeats ? `${table.minSeats}–${table.maxSeats}` : table.maxSeats} chỗ{table.isPrivateRoom ? ' · phòng riêng' : ''}
            </span>
          )}
        </div>
      </button>
      {selected && (
        <span className="pointer-events-none absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-full bg-brand-700 text-white shadow">
          <Check className="h-4 w-4" />
        </span>
      )}
      {s && onMenu && (
        <button type="button" onClick={onMenu} className="absolute top-2 right-1 flex h-11 w-11 items-center justify-center rounded-full text-ink-500 hover:bg-ink-100" aria-label={`Thao tác nhanh ${table.name}`}>
          <MoreVertical className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
