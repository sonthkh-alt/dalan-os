'use client';

import { Check, Trash2, UserRound } from 'lucide-react';
import type { LineStatus, Order, OrderLine, SessionDetail } from '@/lib/types';
import { cn, moneyPlain, qty, timeHM } from '@/lib/utils';
import { Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';

export const LINE_STATUS: Record<LineStatus, { label: string; tone: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' }> = {
  DRAFT: { label: 'Nháp', tone: 'neutral' },
  HOLD: { label: 'Giữ', tone: 'warning' },
  SENT: { label: 'Đã gửi bếp', tone: 'info' },
  PREPARING: { label: 'Đang làm', tone: 'warning' },
  READY: { label: 'Sẵn sàng', tone: 'success' },
  SERVED: { label: 'Đã ra bàn', tone: 'neutral' },
  VOIDED: { label: 'Đã hủy', tone: 'danger' },
  CANCELLED: { label: 'Đã bỏ', tone: 'danger' },
};

export interface SessionLinesProps {
  session: SessionDetail;
  onVoid: (line: OrderLine) => void;
  onServed: (line: OrderLine) => void;
  onEditWeight: (line: OrderLine) => void;
  onConfirmOrder: (order: Order) => void;
  onRejectOrder: (order: Order) => void;
  busy?: boolean;
}

/** Danh sách món theo đợt gọi với trạng thái bếp realtime và thao tác nhanh. */
export function SessionLines({ session, onVoid, onServed, onEditWeight, onConfirmOrder, onRejectOrder, busy }: SessionLinesProps) {
  const orders = session.orders.filter((o) => o.lines.length > 0);
  if (orders.length === 0) return <p className="py-10 text-center text-ink-500">Chưa gọi món nào</p>;
  const participant = (id: string | null) => session.participants.find((p) => p.id === id)?.nickname ?? null;
  return (
    <div className="space-y-3">
      {orders.map((o) => (
        <div key={o.id} className={cn('rounded-xl border bg-white', o.status === 'PENDING_CONFIRM' ? 'border-amber-400' : 'border-ink-100')}>
          <div className="flex items-center gap-2 border-b border-ink-100 px-3 py-2 text-xs text-ink-500">
            <span className="font-semibold text-ink-700">Đợt {o.seq}</span>
            <span>{timeHM(o.sentAt ?? o.createdAt)}</span>
            {o.source === 'GUEST' && <Badge tone="brand">Khách QR</Badge>}
            {o.source === 'SYSTEM' && <Badge>Hệ thống</Badge>}
            {o.status === 'PENDING_CONFIRM' && <Badge tone="warning">Chờ xác nhận</Badge>}
            {o.notes && <span className="truncate italic">“{o.notes}”</span>}
          </div>
          {o.status === 'PENDING_CONFIRM' && (
            <div className="flex gap-2 px-3 pt-2">
              <Button size="sm" variant="success" onClick={() => onConfirmOrder(o)} disabled={busy}>
                <Check className="h-4 w-4" /> Xác nhận gửi bếp
              </Button>
              <Button size="sm" variant="outline" onClick={() => onRejectOrder(o)} disabled={busy}>
                Từ chối
              </Button>
            </div>
          )}
          <ul className="divide-y divide-ink-100">
            {o.lines.map((l) => {
              const st = LINE_STATUS[l.status];
              const dead = l.status === 'VOIDED' || l.status === 'CANCELLED';
              const who = participant(l.participantId);
              return (
                <li key={l.id} className={cn('flex items-start gap-2 px-3 py-2', dead && 'opacity-50')}>
                  <span className="w-12 shrink-0 text-right text-base font-bold tabular-nums">{qty(l.quantity)}{l.unitSnapshot === 'kg' ? 'kg' : ''}</span>
                  <div className="min-w-0 flex-1">
                    <div className={cn('font-semibold leading-snug', dead && 'line-through')}>{l.nameSnapshot}</div>
                    {l.modifiersSnapshot.length > 0 && <div className="text-xs text-ink-500">{l.modifiersSnapshot.map((m) => m.optionName).join(', ')}</div>}
                    {l.note && <div className="text-xs italic text-amber-800">{l.note}</div>}
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                      <Badge tone={st.tone}>{st.label}</Badge>
                      {l.course > 1 && <Badge>Đợt {l.course}</Badge>}
                      {who && <span className="flex items-center gap-0.5 text-ink-500"><UserRound className="h-3 w-3" />{who}</span>}
                      {l.unitSnapshot === 'kg' && !dead && !l.isAdjustment && (
                        <button type="button" onClick={() => onEditWeight(l)} className="rounded-full bg-gold-100 px-2 py-0.5 font-semibold text-ink-900">Sửa cân</button>
                      )}
                      {l.voidReason && <span className="text-red-700">{l.voidReason}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-semibold tabular-nums">{moneyPlain(l.lineTotal)}</span>
                    {!dead && o.status !== 'PENDING_CONFIRM' && (
                      <div className="flex gap-1">
                        {(l.status === 'READY' || l.status === 'SENT' || l.status === 'PREPARING') && (
                          <button type="button" onClick={() => onServed(l)} disabled={busy} className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800" aria-label="Đã ra bàn" title="Đã ra bàn">
                            <Check className="h-5 w-5" />
                          </button>
                        )}
                        {!l.isAdjustment && (
                          <button type="button" onClick={() => onVoid(l)} disabled={busy} className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-red-700" aria-label="Hủy món" title="Hủy món">
                            <Trash2 className="h-5 w-5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
