'use client';

import { useState } from 'react';
import { Check, CheckCheck, ChefHat, ChevronDown, Flame, PauseCircle, Plus, Scale, Send, Trash2, UserRound, XCircle } from 'lucide-react';
import type { LineStatus, Order, OrderLine, SessionDetail } from '@/lib/types';
import { cn, moneyPlain, qty, timeHM } from '@/lib/utils';
import { Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { BUCKET_LABEL, BUCKET_ORDER, minutesFrom, type GroupedLines, type TicketBucket, type TicketEntry } from './order-logic';

export const LINE_STATUS: Record<LineStatus, { label: string; tone: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' }> = {
  DRAFT: { label: 'Nháp', tone: 'neutral' },
  HOLD: { label: 'Đang giữ', tone: 'warning' },
  SENT: { label: 'Đã gửi bếp', tone: 'info' },
  PREPARING: { label: 'Đang nấu', tone: 'warning' },
  READY: { label: 'Sẵn sàng', tone: 'success' },
  SERVED: { label: 'Đã lên món', tone: 'neutral' },
  VOIDED: { label: 'Đã hủy', tone: 'danger' },
  CANCELLED: { label: 'Đã bỏ', tone: 'danger' },
};

const BUCKET_STYLE: Record<TicketBucket, { head: string; icon: typeof Check }> = {
  ready: { head: 'bg-emerald-600 text-white', icon: ChefHat },
  hold: { head: 'bg-sky-100 text-sky-900', icon: PauseCircle },
  cooking: { head: 'bg-orange-100 text-orange-900', icon: Flame },
  sent: { head: 'bg-ink-100 text-ink-700', icon: Send },
  served: { head: 'bg-ink-100 text-ink-500', icon: CheckCheck },
  dead: { head: 'bg-red-50 text-red-700', icon: XCircle },
};

export interface SessionLinesProps {
  session: SessionDetail;
  grouped: GroupedLines;
  now: Date;
  busy?: boolean;
  closed?: boolean;
  onVoid: (line: OrderLine) => void;
  onServed: (line: OrderLine) => void;
  onServeAll: (lines: OrderLine[]) => void;
  onEditWeight: (line: OrderLine) => void;
  onConfirmOrder: (order: Order) => void;
  onRejectOrder: (order: Order) => void;
  onFire: (course: number) => void;
  firing?: boolean;
  /** Gọi thêm đúng món này (cùng tùy chọn). */
  onRepeat?: (line: OrderLine) => void;
}

/** Các món đã gọi, nhóm theo trạng thái bếp (sẵn sàng, đang giữ, đang nấu, đã gửi, đã lên, đã hủy). */
export function SessionLines({ session, grouped, now, busy, closed, onVoid, onServed, onServeAll, onEditWeight, onConfirmOrder, onRejectOrder, onFire, firing, onRepeat }: SessionLinesProps) {
  const [open, setOpen] = useState<Record<string, boolean>>({ served: false, dead: false });
  const participant = (id: string | null) => session.participants.find((p) => p.id === id)?.nickname ?? null;
  const empty = grouped.activeCount === 0 && grouped.pendingOrders.length === 0 && grouped.buckets.dead.length === 0;
  if (empty) return null;

  return (
    <div className="space-y-3">
      {grouped.pendingOrders.map((o) => (
        <div key={o.id} className="overflow-hidden rounded-2xl border-2 border-amber-400 bg-white">
          <div className="flex items-center gap-2 bg-amber-50 px-3 py-2 text-sm">
            <span className="font-bold text-amber-900">Khách gọi qua QR · vòng {o.seq}</span>
            <span className="text-xs text-ink-500">{timeHM(o.createdAt)}</span>
            {o.notes && <span className="truncate text-xs italic text-ink-700">“{o.notes}”</span>}
          </div>
          <ul className="divide-y divide-ink-100">
            {o.lines.map((l) => (
              <li key={l.id} className="flex items-start gap-2 px-3 py-2 text-sm">
                <span className="w-10 shrink-0 text-right font-bold tabular-nums">{qty(l.quantity)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{l.nameSnapshot}</span>
                  {l.modifiersSnapshot.length > 0 && <span className="block text-xs text-ink-500">{l.modifiersSnapshot.map((m) => m.optionName).join(', ')}</span>}
                  {l.note && <span className="block text-xs font-semibold text-amber-800">{l.note}</span>}
                </span>
                <span className="tabular-nums">{moneyPlain(l.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <div className="flex gap-2 p-2">
            <Button variant="success" className="flex-1" onClick={() => onConfirmOrder(o)} disabled={busy || closed}>
              <Check className="h-5 w-5" /> Xác nhận, gửi bếp
            </Button>
            <Button variant="outline" onClick={() => onRejectOrder(o)} disabled={busy || closed}>
              Từ chối
            </Button>
          </div>
        </div>
      ))}

      {BUCKET_ORDER.map((bucket) => {
        const entries = grouped.buckets[bucket];
        if (entries.length === 0) return null;
        const style = BUCKET_STYLE[bucket];
        const collapsible = bucket === 'served' || bucket === 'dead';
        const expanded = !collapsible || open[bucket];
        const total = entries.reduce((s, e) => s + (bucket === 'dead' ? 0 : e.line.lineTotal), 0);
        return (
          <section key={bucket} className={cn('overflow-hidden rounded-2xl border bg-white', bucket === 'ready' ? 'border-emerald-500' : 'border-ink-100')}>
            <div className={cn('flex min-h-13 items-center gap-2 px-3 py-1', style.head)}>
              <style.icon className="h-4 w-4 shrink-0" />
              <button type="button" disabled={!collapsible} onClick={() => setOpen((s) => ({ ...s, [bucket]: !s[bucket] }))} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left text-sm font-bold">
                <span className="truncate">{BUCKET_LABEL[bucket]}</span>
                <span className="rounded-full bg-black/10 px-2 text-xs tabular-nums">{entries.length}</span>
                {collapsible && <ChevronDown className={cn('h-4 w-4 transition', expanded && 'rotate-180')} />}
              </button>
              {bucket === 'ready' && !closed && (
                <button type="button" disabled={busy} onClick={() => onServeAll(entries.map((e) => e.line))} className="min-h-11 rounded-lg bg-white/20 px-3 text-xs font-bold hover:bg-white/30">
                  Đã mang ra hết
                </button>
              )}
              {bucket === 'hold' && !closed && (
                <span className="flex gap-1">
                  {grouped.heldCourses.map((c) => (
                    <button key={c} type="button" disabled={firing} onClick={() => onFire(c)} className="flex min-h-11 items-center gap-1 rounded-lg bg-sky-700 px-3 text-xs font-bold text-white hover:bg-sky-800 disabled:opacity-60">
                      <Flame className="h-3.5 w-3.5" /> Gọi đợt {c}
                    </button>
                  ))}
                </span>
              )}
              {bucket !== 'hold' && bucket !== 'ready' && bucket !== 'dead' && <span className="text-xs font-semibold tabular-nums opacity-80">{moneyPlain(total)}</span>}
            </div>
            {expanded && (
              <ul className="divide-y divide-ink-100">
                {entries.map((e) => (
                  <LineRow key={e.line.id} entry={e} now={now} who={participant(e.line.participantId)} busy={busy} closed={closed} onVoid={onVoid} onServed={onServed} onEditWeight={onEditWeight} onRepeat={onRepeat} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function LineRow({ entry, now, who, busy, closed, onVoid, onServed, onEditWeight, onRepeat }: { entry: TicketEntry; now: Date; who: string | null; busy?: boolean; closed?: boolean; onVoid: (l: OrderLine) => void; onServed: (l: OrderLine) => void; onEditWeight: (l: OrderLine) => void; onRepeat?: (l: OrderLine) => void }) {
  const { line: l, order: o } = entry;
  const dead = l.status === 'VOIDED' || l.status === 'CANCELLED';
  const waiting = l.status === 'SENT' || l.status === 'PREPARING' ? minutesFrom(l.sentAt, now) : l.status === 'READY' ? minutesFrom(l.readyAt, now) : null;
  const canServe = !closed && (l.status === 'READY' || l.status === 'SENT' || l.status === 'PREPARING');
  return (
    <li className={cn('flex items-start gap-2 px-3 py-2.5', dead && 'opacity-55')}>
      <span className="w-10 shrink-0 text-right text-base font-extrabold tabular-nums">
        {qty(l.quantity)}
        {l.unitSnapshot === 'kg' ? <span className="text-xs">kg</span> : ''}
      </span>
      <div className="min-w-0 flex-1">
        <div className={cn('leading-snug font-semibold', dead && 'line-through')}>{l.nameSnapshot}</div>
        {l.modifiersSnapshot.length > 0 && <div className="text-xs text-ink-500">{l.modifiersSnapshot.map((m) => m.optionName).join(', ')}</div>}
        {l.note && <div className="text-xs font-semibold text-amber-800">⚑ {l.note}</div>}
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-ink-500">Vòng {o.seq}</span>
          {o.source === 'GUEST' && <Badge tone="brand">QR</Badge>}
          {l.course > 1 && <Badge tone="info">Đợt {l.course}</Badge>}
          {l.seatNo && <Badge>Ghế {l.seatNo}</Badge>}
          {who && (
            <span className="flex items-center gap-0.5 text-ink-500">
              <UserRound className="h-3 w-3" />
              {who}
            </span>
          )}
          {waiting !== null && <span className={cn('rounded-full px-1.5 font-bold tabular-nums', waiting >= 20 ? 'bg-red-100 text-red-800' : waiting >= 10 ? 'bg-amber-100 text-amber-900' : 'bg-ink-100 text-ink-700')}>{waiting}′</span>}
          {l.voidReason && <span className="text-red-700">{l.voidReason}</span>}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-sm font-semibold tabular-nums">{moneyPlain(l.lineTotal)}</span>
        {!dead && !closed && (
          <div className="flex gap-1">
            {l.unitSnapshot === 'kg' && !l.isAdjustment && (
              <IconBtn label="Sửa cân thực tế" onClick={() => onEditWeight(l)} disabled={busy} className="bg-gold-100 text-ink-900">
                <Scale className="h-5 w-5" />
              </IconBtn>
            )}
            {onRepeat && l.itemId && !l.isAdjustment && (
              <IconBtn label="Gọi thêm món này" onClick={() => onRepeat(l)} disabled={busy} className="bg-brand-50 text-brand-800">
                <Plus className="h-5 w-5" />
              </IconBtn>
            )}
            {canServe && (
              <IconBtn label="Đã mang ra bàn" onClick={() => onServed(l)} disabled={busy} className="bg-emerald-100 text-emerald-800">
                <Check className="h-5 w-5" />
              </IconBtn>
            )}
            {!l.isAdjustment && (
              <IconBtn label="Hủy món" onClick={() => onVoid(l)} disabled={busy} className="bg-red-50 text-red-700">
                <Trash2 className="h-5 w-5" />
              </IconBtn>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function IconBtn({ label, onClick, disabled, className, children }: { label: string; onClick: () => void; disabled?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className={cn('flex h-11 w-11 items-center justify-center rounded-xl transition active:scale-95 disabled:opacity-50', className)}>
      {children}
    </button>
  );
}
