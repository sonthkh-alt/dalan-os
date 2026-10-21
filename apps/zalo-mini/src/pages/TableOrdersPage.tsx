import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from 'zmp-ui';
import { PageShell } from '../components/PageShell';
import { LineStatusBadge } from '../components/StatusBadge';
import { RequireTable } from '../components/RequireTable';
import { TableNav } from '../components/TableNav';
import { Card, EmptyState, Loading, SectionTitle, inputClass, useToast } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { formatTime, formatVnd } from '../lib/format';
import { useGuestSessionView } from '../lib/queries';
import { useGuestToken } from '../lib/session-store';

type Kind = 'CALL_STAFF' | 'WATER' | 'UTENSILS' | 'BILL' | 'OTHER';
const KINDS: { kind: Kind; label: string }[] = [
  { kind: 'CALL_STAFF', label: 'Gọi nhân viên' },
  { kind: 'WATER', label: 'Thêm nước, đá' },
  { kind: 'UTENSILS', label: 'Chén, đũa, khăn' },
  { kind: 'BILL', label: 'Xin tính tiền' },
];
const KIND_LABEL: Record<string, string> = {
  CALL_STAFF: 'Gọi nhân viên',
  WATER: 'Thêm nước, đá',
  UTENSILS: 'Chén, đũa, khăn',
  BILL: 'Xin tính tiền',
  OTHER: 'Yêu cầu khác',
};

export function TableOrdersPage() {
  return (
    <RequireTable>
      <Orders />
    </RequireTable>
  );
}

function Orders() {
  const token = useGuestToken();
  const toast = useToast((s) => s.show);
  const queryClient = useQueryClient();
  const view = useGuestSessionView();
  const [note, setNote] = useState('');

  const send = useMutation({
    mutationFn: (kind: Kind) =>
      api('/guest/service-requests', {
        guestToken: token,
        body: { kind, note: note.trim() || undefined },
      }),
    onSuccess: () => {
      toast('Đã báo, nhân viên đang tới');
      setNote('');
      void queryClient.invalidateQueries({ queryKey: ['guest-session'] });
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });

  const orders = [...(view.data?.orders ?? [])].filter((o) => o.status !== 'CANCELLED').reverse();
  const nicknames = new Map((view.data?.participants ?? []).map((p) => [p.id, p.nickname]));
  const me = view.data?.me.participantId;

  return (
    <PageShell title="Món đã gọi">
      <TableNav current="/table/orders" />

      <section className="mb-5">
        <SectionTitle>Gọi phục vụ</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          {KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              disabled={send.isPending}
              onClick={() => send.mutate(k.kind)}
              className="min-h-14 rounded-2xl border border-line bg-paper px-3 text-sm font-semibold text-ink active:scale-[0.98] disabled:opacity-60"
            >
              {k.label}
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            placeholder="Yêu cầu khác (không bắt buộc)"
            className={inputClass}
          />
          <Button
            size="small"
            variant="secondary"
            disabled={!note.trim() || send.isPending}
            onClick={() => send.mutate('OTHER')}
          >
            Gửi
          </Button>
        </div>
        {view.data && view.data.requests.length > 0 ? (
          <ul className="mt-3 space-y-1.5 text-sm">
            {view.data.requests.slice(0, 5).map((r) => (
              <li key={r.id} className="flex items-center justify-between">
                <span>
                  {KIND_LABEL[r.kind] ?? r.kind}{' '}
                  <span className="text-ink-muted">· {formatTime(r.createdAt)}</span>
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.status === 'PENDING' ? 'bg-warn-soft text-warn' : 'bg-success-soft text-success'}`}
                >
                  {r.status === 'PENDING'
                    ? 'Đang chờ'
                    : r.status === 'ACKED'
                      ? 'Nhân viên đang tới'
                      : 'Đã xử lý'}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <SectionTitle>Trạng thái món</SectionTitle>
      {view.isPending ? (
        <Loading />
      ) : orders.length === 0 ? (
        <EmptyState
          title="Chưa có món nào được gọi"
          description="Chọn món ở tab Gọi món rồi bấm Gửi món."
        />
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <Card key={o.id} className="p-3">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-bold">Đợt {o.seq}</span>
                <span className="text-ink-muted">
                  {o.placedByParticipantId
                    ? o.placedByParticipantId === me
                      ? 'Bạn'
                      : (nicknames.get(o.placedByParticipantId) ?? 'Bạn cùng bàn')
                    : 'Nhân viên'}{' '}
                  · {formatTime(o.createdAt)}
                </span>
              </div>
              <ul className="divide-y divide-line">
                {o.lines.map((l) => (
                  <li key={l.id} className="flex items-start justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p
                        className={
                          l.status === 'VOIDED' || l.status === 'CANCELLED'
                            ? 'text-ink-muted line-through'
                            : 'font-medium'
                        }
                      >
                        {l.quantity} × {l.name}
                      </p>
                      {l.modifiers.length ? (
                        <p className="text-xs text-ink-soft">
                          {l.modifiers.map((m) => m.optionName).join(', ')}
                        </p>
                      ) : null}
                      {l.note ? <p className="text-xs text-ink-muted">“{l.note}”</p> : null}
                      <p className="text-xs text-maroon">{formatVnd(l.lineTotal)}</p>
                    </div>
                    <LineStatusBadge status={l.status} orderStatus={o.status} />
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  );
}
