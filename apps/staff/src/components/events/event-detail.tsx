'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CalendarX, Printer } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { EVENT_KIND_LABELS } from '@dalan/contracts';
import { errorMessage } from '@/lib/api';
import { useCan } from '@/lib/auth-store';
import { useAction } from '@/lib/queries';
import { eventApi, useEvent } from '@/lib/queries-ops';
import { dateLabel, phoneDisplay } from '@/lib/ops-utils';
import { money } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Badge, EmptyState, Loading, Textarea } from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';
import { MoneyInput, TabBar } from '@/components/ops/ui';
import { EVENT_STATUS, LAYOUT_LABELS, nextActions, type EventAction } from './labels';
import { evInvalidate, InfoTab, MenusTab, QuoteTab, ServicesTab, type TabProps } from './event-tabs-a';
import { AdjustTab, BeoTab, ConfirmTab, ContractTab, PaymentsTab, SettleTab } from './event-tabs-b';

type Tab = 'info' | 'menus' | 'services' | 'quote' | 'contract' | 'payments' | 'confirm' | 'beo' | 'adjust' | 'settle';

const printLinkCls = 'inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold text-ink-900 shadow-card ring-1 ring-ink-200 ring-inset transition hover:bg-ink-50';

const TABS: { value: Tab; label: string }[] = [
  { value: 'info', label: 'Thông tin' },
  { value: 'menus', label: 'Thực đơn' },
  { value: 'services', label: 'Dịch vụ' },
  { value: 'quote', label: 'Báo giá' },
  { value: 'contract', label: 'Hợp đồng' },
  { value: 'payments', label: 'Thanh toán' },
  { value: 'confirm', label: 'Chốt mâm' },
  { value: 'beo', label: 'BEO' },
  { value: 'adjust', label: 'Phát sinh' },
  { value: 'settle', label: 'Quyết toán' },
];

export function EventDetailScreen({ eventId }: { eventId: string }) {
  const q = useEvent(eventId);
  const canManage = useCan('event.manage');
  const canSettle = useCan('event.settle');
  const canBilling = useCan('billing.collect');
  const [tab, setTab] = useState<Tab>('info');
  const [direct, setDirect] = useState<EventAction['direct'] | null>(null);
  const [reason, setReason] = useState('');
  const [refund, setRefund] = useState<number | null>(null);
  const done = (msg: string) => () => {
    setDirect(null);
    toast.success(msg);
  };
  const start = useAction(() => eventApi.start(eventId), () => evInvalidate(eventId), done('Tiệc bắt đầu'));
  const close = useAction(() => eventApi.close(eventId), () => evInvalidate(eventId), done('Đã đóng hồ sơ tiệc'));
  const cancel = useAction(() => eventApi.cancel(eventId, reason.trim(), refund ?? undefined), () => evInvalidate(eventId), done('Đã hủy tiệc'));
  const reopen = useAction(
    () => eventApi.reopenLead(eventId, reason.trim() || undefined),
    () => evInvalidate(eventId),
    () => {
      setDirect(null);
      setTab('quote');
      toast.success('Đã mở lại tiệc, có thể lập báo giá mới');
    },
  );
  const onErr = (e: unknown) => toast.error(errorMessage(e));

  if (q.isLoading) return <Loading />;
  if (!q.data)
    return (
      <div className="flex min-h-full flex-col">
        <PageHeader back="/events" breadcrumb={[{ label: 'Tiệc', href: '/events' }]} title="Hồ sơ tiệc" className="border-b border-ink-100 bg-white" />
        <EmptyState
          icon={CalendarX}
          title="Không mở được hồ sơ tiệc"
          hint={errorMessage(q.error)}
          action={
            <Link href="/events" className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand-700 px-4 font-semibold text-white shadow-brand hover:bg-brand-800">
              Về danh sách tiệc
            </Link>
          }
        />
      </div>
    );
  const ev = q.data;
  const props: TabProps = { ev, canManage, canSettle, canCollect: canSettle || canBilling };
  const actions = nextActions(ev.status).filter((a) => (a.direct === 'start' || a.direct === 'close' || a.to === 'SETTLED' ? canSettle || canManage : canManage));
  const st = EVENT_STATUS[ev.status];

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-ink-100 bg-white pb-3">
        <PageHeader
          back="/events"
          breadcrumb={[{ label: 'Tiệc', href: '/events' }, { label: ev.code }]}
          title={
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate">{ev.companyName ?? ev.contactName}</span>
              <Badge tone={st.tone}>{st.label}</Badge>
              {ev.holdExpiresAt && ['LEAD', 'QUOTED'].includes(ev.status) && <Badge tone="warning">Giữ sảnh đến {new Date(ev.holdExpiresAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</Badge>}
            </span>
          }
          subtitle={`${EVENT_KIND_LABELS[ev.kind]} · ${dateLabel(ev.eventDate)} ${ev.startTime}–${ev.endTime} · ${ev.confirmedTables ?? ev.expectedTables} mâm`}
          actions={
            <>
              <a href={`/events/${ev.id}/print/quote`} target="_blank" rel="noreferrer" className={printLinkCls}>
                <Printer className="h-4 w-4" /> Báo giá
              </a>
              <a href={`/events/${ev.id}/print/beo`} target="_blank" rel="noreferrer" className={printLinkCls}>
                <Printer className="h-4 w-4" /> BEO
              </a>
            </>
          }
        />
        <div className="px-3 text-sm text-ink-500 md:px-5">
          {ev.halls.length ? `${ev.halls.map((h) => `${h.hall.name} (${LAYOUT_LABELS[h.layout] ?? h.layout})`).join(', ')} · ` : ''}
          {ev.contactName} {phoneDisplay(ev.contactPhone)}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 px-3 md:px-5">
          <span className="text-sm text-ink-700">
            Tổng <b className="tabular-nums">{money(ev.totals.total)}</b> · đã thu <b className="text-emerald-700 tabular-nums">{money(ev.totals.paid)}</b> · còn <b className="text-brand-800 tabular-nums">{money(ev.totals.due)}</b>
          </span>
          <span className="ml-auto flex flex-wrap gap-2">
            {actions.map((a) => (
              <Button
                key={a.to}
                size="sm"
                variant={a.direct === 'cancel' ? 'ghost' : a.direct === 'reopen' ? 'outline' : 'primary'}
                className={a.direct === 'cancel' ? 'text-red-700' : undefined}
                onClick={() => {
                  if (a.tab) setTab(a.tab as Tab);
                  else if (a.direct) {
                    setReason('');
                    setRefund(null);
                    setDirect(a.direct);
                  }
                }}
              >
                {a.label}
              </Button>
            ))}
          </span>
        </div>
      </div>
      <TabBar value={tab} onChange={setTab} tabs={TABS} />
      <div className="p-3 md:p-4" key={`${ev.id}-${tab}`}>
        {tab === 'info' && <InfoTab {...props} />}
        {tab === 'menus' && <MenusTab {...props} />}
        {tab === 'services' && <ServicesTab {...props} />}
        {tab === 'quote' && <QuoteTab {...props} />}
        {tab === 'contract' && <ContractTab {...props} />}
        {tab === 'payments' && <PaymentsTab {...props} />}
        {tab === 'confirm' && <ConfirmTab {...props} />}
        {tab === 'beo' && <BeoTab {...props} />}
        {tab === 'adjust' && <AdjustTab {...props} />}
        {tab === 'settle' && <SettleTab {...props} onGoPayments={() => setTab('payments')} />}
      </div>

      <ConfirmDialog open={direct === 'start'} onClose={() => setDirect(null)} title="Bắt đầu phục vụ tiệc?" message="Chuyển tiệc sang trạng thái đang diễn ra để ghi phát sinh và quyết toán." confirmLabel="Bắt đầu" loading={start.isPending} onConfirm={() => start.mutate(undefined, { onError: onErr })} />
      <ConfirmDialog open={direct === 'close'} onClose={() => setDirect(null)} title="Đóng hồ sơ tiệc?" message={ev.totals.due > 0 ? `Còn phải thu ${money(ev.totals.due)}, máy chủ sẽ từ chối đóng hồ sơ.` : 'Lưu hồ sơ, không chỉnh sửa thêm.'} confirmLabel="Đóng hồ sơ" loading={close.isPending} onConfirm={() => close.mutate(undefined, { onError: onErr })} />
      <Dialog
        open={direct === 'reopen'}
        onClose={() => setDirect(null)}
        title="Mở lại để báo giá lại?"
        size="sm"
        footer={
          <Button block loading={reopen.isPending} onClick={() => reopen.mutate(undefined, { onError: onErr })}>
            Mở lại tiệc
          </Button>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-ink-700">Tiệc quay về trạng thái “{EVENT_STATUS.LEAD.label}”. Các báo giá đang mở sẽ được đánh dấu bị từ chối để lập báo giá mới.</p>
          <Textarea label="Ghi chú (không bắt buộc)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Khách muốn đổi thực đơn, giảm số mâm..." maxLength={300} />
        </div>
      </Dialog>
      <Dialog
        open={direct === 'cancel'}
        onClose={() => setDirect(null)}
        title="Hủy tiệc"
        size="sm"
        footer={
          <Button variant="danger" block disabled={!reason.trim()} loading={cancel.isPending} onClick={() => cancel.mutate(undefined, { onError: onErr })}>
            Hủy tiệc
          </Button>
        }
      >
        <div className="space-y-3">
          <Textarea label="Lý do hủy (bắt buộc)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <MoneyInput label="Hoàn cọc cho khách" value={refund} onChange={setRefund} hint={`Đã cọc ${money(ev.totals.depositsPaid)}. Để trống nếu không hoàn.`} />
        </div>
      </Dialog>
    </div>
  );
}
