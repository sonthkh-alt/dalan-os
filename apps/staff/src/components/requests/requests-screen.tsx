'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Bell, Check, ChevronRight, Clock, CreditCard, Droplets, Footprints, MessageSquare, RefreshCw, Utensils } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { useBranchId } from '@/lib/auth-store';
import { keys, sessionApi, useAction, useRequests } from '@/lib/queries';
import type { ServiceRequest } from '@/lib/types';
import { cn, elapsed } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState, Loading } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page-header';
import { toast } from '@/components/ui/toast';
import { REQUEST_SLA, requestMinutes, requestTone, sortRequests, type RequestTone } from './requests-logic';

const KIND: Record<ServiceRequest['kind'], { label: string; icon: typeof Bell; color: string }> = {
  CALL_STAFF: { label: 'Gọi nhân viên', icon: Bell, color: 'bg-brand-700 text-white' },
  BILL: { label: 'Xin tính tiền', icon: CreditCard, color: 'bg-violet-600 text-white' },
  WATER: { label: 'Xin nước / đá', icon: Droplets, color: 'bg-sky-600 text-white' },
  UTENSILS: { label: 'Xin chén đũa', icon: Utensils, color: 'bg-gold-500 text-white' },
  OTHER: { label: 'Yêu cầu khác', icon: MessageSquare, color: 'bg-ink-700 text-white' },
};

const TONE: Record<RequestTone, { card: string; chip: string }> = {
  ok: { card: 'border-ink-100', chip: 'bg-ink-100 text-ink-700' },
  warn: { card: 'border-amber-400', chip: 'bg-amber-100 text-amber-900' },
  late: { card: 'border-red-500 ring-2 ring-red-100', chip: 'bg-red-600 text-white' },
};

type Filter = 'all' | 'OPEN' | 'ACKED';

/** Hàng đợi yêu cầu của khách: sắp theo mức khẩn, đồng hồ chờ, một chạm nhận việc / xong. */
export function RequestsScreen() {
  const branchId = useBranchId();
  const requests = useRequests();
  const [filter, setFilter] = useState<Filter>('all');
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  const onError = (e: unknown) => toast.error(errorMessage(e));
  const inv = () => [keys.requests(branchId), keys.floor(branchId)] as const;
  const ack = useAction((id: string) => sessionApi.ackRequest(id), inv, () => toast.success('Đã nhận – đang tới bàn'));
  const done = useAction((id: string) => sessionApi.doneRequest(id), inv, () => toast.success('Đã xử lý xong'));

  const sorted = useMemo(() => sortRequests(requests.data ?? [], now), [requests.data, now]);
  const list = sorted.filter((r) => filter === 'all' || r.status === filter);
  const openCount = sorted.filter((r) => r.status === 'OPEN').length;
  const ackedCount = sorted.filter((r) => r.status === 'ACKED').length;
  const late = sorted.filter((r) => requestMinutes(r, now) >= REQUEST_SLA.LATE_MIN).length;
  const oldest = sorted.reduce((m, r) => Math.max(m, requestMinutes(r, now)), 0);

  const header = (
    <PageHeader
      back="/"
      title="Yêu cầu của khách"
      subtitle={sorted.length ? `${openCount} mới · ${ackedCount} đang xử lý${late ? ` · ${late} quá ${REQUEST_SLA.LATE_MIN} phút` : ''}` : 'Không có yêu cầu đang chờ'}
      actions={
        <button type="button" onClick={() => requests.refetch()} className="flex h-11 w-11 items-center justify-center rounded-full border border-ink-100 bg-white text-ink-700 shadow-sm hover:bg-ink-100" aria-label="Làm mới">
          <RefreshCw className={cn('h-5 w-5', requests.isFetching && 'animate-spin')} />
        </button>
      }
    />
  );

  if (requests.isLoading) return <div>{header}<Loading label="Đang tải yêu cầu..." /></div>;
  if (requests.isError) {
    return (
      <div>
        {header}
        <EmptyState title="Không tải được yêu cầu" hint={errorMessage(requests.error)} action={<Button variant="outline" onClick={() => requests.refetch()}>Thử lại</Button>} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl pb-6">
      {header}
      {sorted.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-3 pb-3 md:px-4">
          {(
            [
              ['all', 'Tất cả', sorted.length],
              ['OPEN', 'Mới', openCount],
              ['ACKED', 'Đang xử lý', ackedCount],
            ] as const
          ).map(([v, label, n]) => (
            <button key={v} type="button" onClick={() => setFilter(v)} aria-pressed={filter === v} className={cn('flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold', filter === v ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-100 bg-white text-ink-700')}>
              {label}
              <span className={cn('rounded-full px-1.5 text-xs tabular-nums', filter === v ? 'bg-white/20' : 'bg-ink-100')}>{n}</span>
            </button>
          ))}
          {oldest > 0 && (
            <span className={cn('ml-auto flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold', TONE[requestTone(oldest)].chip)}>
              <Clock className="h-4 w-4" /> Chờ lâu nhất {oldest} phút
            </span>
          )}
        </div>
      )}
      <div className="px-3 md:px-4">
        {list.length === 0 ? (
          <EmptyState
            title={sorted.length === 0 ? 'Không có yêu cầu nào' : 'Không có yêu cầu trong nhóm này'}
            hint="Khách gọi nhân viên, xin nước, chén đũa hoặc xin tính tiền qua mã QR trên bàn sẽ hiện ở đây theo thứ tự khẩn."
            action={<Link href="/" className="font-semibold text-brand-700 underline">Về sơ đồ bàn</Link>}
          />
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {list.map((r) => {
              const mins = requestMinutes(r, now);
              const tone = TONE[requestTone(mins)];
              const kind = KIND[r.kind] ?? KIND.OTHER;
              const ackBusy = ack.isPending && ack.variables === r.id;
              const doneBusy = done.isPending && done.variables === r.id;
              return (
                <li key={r.id} className={cn('flex flex-col gap-3 rounded-2xl border-2 bg-white p-3 shadow-sm', tone.card)}>
                  <div className="flex items-start gap-3">
                    <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl', kind.color)}>
                      <kind.icon className="h-6 w-6" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xl font-extrabold text-ink-900">{r.table?.name ?? r.session?.code ?? 'Bàn'}</span>
                        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', r.status === 'ACKED' ? 'bg-sky-100 text-sky-800' : 'bg-red-100 text-red-800')}>{r.status === 'ACKED' ? 'Đang tới' : 'Mới'}</span>
                      </div>
                      <div className="font-semibold text-ink-700">{kind.label}</div>
                      {r.note && <div className="mt-0.5 rounded-lg bg-paper px-2 py-1 text-sm text-ink-700">“{r.note}”</div>}
                    </div>
                    <span className={cn('flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold tabular-nums', tone.chip)} title={`Gửi lúc ${new Date(r.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`}>
                      <Clock className="h-4 w-4" /> {mins < 1 ? 'vừa xong' : elapsed(r.createdAt, now)}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Link href={r.kind === 'BILL' ? `/sessions/${r.sessionId}/pay` : `/sessions/${r.sessionId}`} className="flex min-h-12 items-center gap-1 rounded-xl border border-ink-100 bg-white px-3 text-sm font-semibold text-ink-700 hover:bg-ink-100">
                      {r.kind === 'BILL' ? 'Thanh toán' : 'Vào bàn'} <ChevronRight className="h-4 w-4" />
                    </Link>
                    {r.status === 'OPEN' && (
                      <Button size="lg" variant="outline" className="flex-1" loading={ackBusy} onClick={() => ack.mutate(r.id, { onError })}>
                        <Footprints className="h-5 w-5" /> Đang tới
                      </Button>
                    )}
                    <Button size="lg" variant="success" className="flex-1" loading={doneBusy} onClick={() => done.mutate(r.id, { onError })}>
                      <Check className="h-5 w-5" /> Xong
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
