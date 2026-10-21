'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Bell, Check, Eye } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { useBranchId } from '@/lib/auth-store';
import { keys, sessionApi, useAction, useRequests } from '@/lib/queries';
import { cn, elapsed } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, Loading } from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';

const LABEL: Record<string, string> = { CALL_STAFF: 'Gọi nhân viên', WATER: 'Xin nước / đá', UTENSILS: 'Xin chén đũa', BILL: 'Xin tính tiền', OTHER: 'Yêu cầu khác' };

export function RequestsScreen() {
  const branchId = useBranchId();
  const requests = useRequests();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  const onError = (e: unknown) => toast.error(errorMessage(e));
  const inv = () => [keys.requests(branchId), keys.floor(branchId)] as const;
  const ack = useAction((id: string) => sessionApi.ackRequest(id), inv);
  const done = useAction((id: string) => sessionApi.doneRequest(id), inv);

  if (requests.isLoading) return <Loading />;
  const list = requests.data ?? [];
  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="mb-3 flex items-center gap-2 text-xl font-bold"><Bell className="h-6 w-6" /> Yêu cầu từ khách ({list.length})</h1>
      {list.length === 0 ? (
        <EmptyState title="Không có yêu cầu nào" hint="Khách gọi nhân viên, xin nước hoặc xin tính tiền qua QR sẽ hiện ở đây." />
      ) : (
        <ul className="space-y-2">
          {list.map((r) => {
            const mins = Math.floor((now.getTime() - new Date(r.createdAt).getTime()) / 60_000);
            return (
              <li key={r.id} className={cn('flex items-center gap-3 rounded-2xl border bg-white p-3', mins >= 5 ? 'border-red-400' : 'border-ink-100')}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold">{r.table?.name ?? r.session?.code}</span>
                    <Badge tone={r.status === 'ACKED' ? 'info' : 'danger'}>{r.status === 'ACKED' ? 'Đang xử lý' : 'Mới'}</Badge>
                  </div>
                  <div className="font-semibold">{LABEL[r.kind] ?? r.kind}{r.note ? `: ${r.note}` : ''}</div>
                  <div className={cn('text-xs', mins >= 5 ? 'font-semibold text-red-700' : 'text-ink-500')}>{elapsed(r.createdAt, now)} trước</div>
                </div>
                <Link href={`/sessions/${r.sessionId}`} className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink-100" aria-label="Mở bàn"><Eye className="h-5 w-5" /></Link>
                {r.status === 'OPEN' && <Button variant="outline" onClick={() => ack.mutate(r.id, { onError })}>Đang tới</Button>}
                <Button variant="success" onClick={() => done.mutate(r.id, { onError })}><Check className="h-5 w-5" /> Xong</Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
