'use client';

import { Fragment, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { useAuth, useCan } from '@/lib/auth-store';
import { useAdminStaff, useAuditLogs, type AuditFilter, type AuditLogRow } from '@/lib/queries-admin';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, Input, Loading, Select } from '@/components/ui/primitives';
import { Card } from '../form';

const ENTITY_TYPES = ['Bill', 'Payment', 'OrderLine', 'TableSession', 'Staff', 'Branch', 'Customer', 'Reservation', 'EInvoice', 'Stocktake', 'PaymentIntent'];
const ACTION_PREFIXES: [string, string][] = [
  ['bill.discount', 'Giảm giá bill'],
  ['bill.void', 'Hủy bill'],
  ['order.line', 'Hủy món'],
  ['payment.refund', 'Hoàn tiền'],
  ['payment.webhook', 'Cổng thanh toán từ chối'],
  ['session.empties', 'Chốt vỏ'],
  ['staff', 'Nhân sự'],
  ['branch', 'Cấu hình cơ sở'],
  ['customer', 'Khách hàng'],
  ['reservation', 'Đặt bàn'],
  ['einvoice', 'Hóa đơn điện tử'],
  ['stocktake', 'Kiểm kê kho'],
];

const EMPTY: AuditFilter = { page: 1, pageSize: 50 };

function toneOf(action: string): 'danger' | 'warning' | 'info' | 'neutral' {
  if (/void|refund|cancel|delete|revoke/.test(action)) return 'danger';
  if (/discount|price|role|permission|merge|adjust/.test(action)) return 'warning';
  if (/create|open|issue/.test(action)) return 'info';
  return 'neutral';
}

export function AuditAdmin() {
  const branches = useAuth((s) => s.me?.branches ?? []);
  const canStaffRead = useCan('staff.read');
  const canStaffManage = useCan('staff.manage');
  const canStaff = canStaffRead || canStaffManage;
  const staff = useAdminStaff(canStaff);
  const [draft, setDraft] = useState<AuditFilter>(EMPTY);
  const [filter, setFilter] = useState<AuditFilter>(EMPTY);
  const [open, setOpen] = useState<string | null>(null);
  const logs = useAuditLogs(filter);
  const set = <K extends keyof AuditFilter>(k: K, v: AuditFilter[K]) => setDraft((d) => ({ ...d, [k]: v || undefined }));
  const apply = () => setFilter({ ...draft, page: 1 });
  const totalPages = logs.data ? Math.max(1, Math.ceil(logs.data.total / logs.data.pageSize)) : 1;

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold text-ink-900">Nhật ký thao tác</h1>
      <Card>
        <form
          className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
        >
          <Select label="Cơ sở" value={draft.branchId ?? ''} onChange={(e) => set('branchId', e.target.value)}>
            <option value="">Tất cả</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
          {canStaff ? (
            <Select label="Người thực hiện" value={draft.actorStaffId ?? ''} onChange={(e) => set('actorStaffId', e.target.value)}>
              <option value="">Tất cả</option>
              {(staff.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName} ({s.code})
                </option>
              ))}
            </Select>
          ) : (
            <Input label="Mã người thực hiện (ID)" value={draft.actorStaffId ?? ''} onChange={(e) => set('actorStaffId', e.target.value.trim())} />
          )}
          <Select label="Nhóm thao tác" value={draft.action ?? ''} onChange={(e) => set('action', e.target.value)}>
            <option value="">Tất cả</option>
            {ACTION_PREFIXES.map(([v, l]) => (
              <option key={v} value={v}>
                {l} ({v}…)
              </option>
            ))}
          </Select>
          <Select label="Loại đối tượng" value={draft.entityType ?? ''} onChange={(e) => set('entityType', e.target.value)}>
            <option value="">Tất cả</option>
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
          <Input label="ID đối tượng (bàn, bill, món...)" value={draft.entityId ?? ''} onChange={(e) => set('entityId', e.target.value.trim())} />
          <Input label="Từ lúc" type="datetime-local" value={draft.from ?? ''} onChange={(e) => set('from', e.target.value)} />
          <Input label="Đến lúc" type="datetime-local" value={draft.to ?? ''} onChange={(e) => set('to', e.target.value)} />
          <div className="flex items-end gap-2">
            <Button type="submit" className="flex-1">
              Lọc
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(EMPTY);
                setFilter(EMPTY);
              }}
            >
              Xóa lọc
            </Button>
          </div>
        </form>
      </Card>

      <Card
        title={logs.data ? `${logs.data.total.toLocaleString('vi-VN')} bản ghi` : 'Nhật ký'}
        actions={
          <button type="button" onClick={() => void logs.refetch()} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-ink-100" aria-label="Làm mới">
            <RefreshCw className={cn('h-4 w-4', logs.isFetching && 'animate-spin')} />
          </button>
        }
      >
        {logs.isLoading ? (
          <Loading />
        ) : logs.isError ? (
          <p className="text-red-700">{errorMessage(logs.error)}</p>
        ) : (logs.data?.items ?? []).length === 0 ? (
          <EmptyState title="Không có bản ghi phù hợp" />
        ) : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-left text-xs font-semibold tracking-wide text-ink-500 uppercase">
                  <th className="px-2 py-2">Thời điểm</th>
                  <th className="px-2 py-2">Người thực hiện</th>
                  <th className="px-2 py-2">Thao tác</th>
                  <th className="px-2 py-2">Đối tượng</th>
                  <th className="px-2 py-2">Lý do</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {logs.data!.items.map((r) => (
                  <Fragment key={r.id}>
                    <tr className="cursor-pointer border-b border-ink-100 hover:bg-ink-100/40" onClick={() => setOpen(open === r.id ? null : r.id)}>
                      <td className="px-2 py-2 whitespace-nowrap tabular-nums">{new Date(r.createdAt).toLocaleString('vi-VN')}</td>
                      <td className="px-2 py-2">{r.actor ? `${r.actor.fullName} (${r.actor.code})` : r.actorStaffId ? r.actorStaffId.slice(0, 8) : 'Hệ thống / khách'}</td>
                      <td className="px-2 py-2">
                        <Badge tone={toneOf(r.action)}>{r.action}</Badge>
                      </td>
                      <td className="px-2 py-2">
                        {r.entityType}
                        {r.entityId && <span className="block font-mono text-[11px] text-ink-500">{r.entityId}</span>}
                      </td>
                      <td className="px-2 py-2 text-ink-700">{r.reason ?? ''}</td>
                      <td className="px-2 py-2">
                        <ChevronDown className={cn('h-4 w-4 text-ink-500 transition', open === r.id && 'rotate-180')} />
                      </td>
                    </tr>
                    {open === r.id && (
                      <tr className="border-b border-ink-100 bg-paper">
                        <td colSpan={6} className="px-2 py-2">
                          <AuditDetail row={r} branchName={branches.find((b) => b.id === r.branchId)?.name} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {logs.data && totalPages > 1 && (
          <div className="mt-3 flex items-center justify-center gap-2">
            <Button size="sm" variant="outline" disabled={filter.page <= 1} onClick={() => setFilter((f) => ({ ...f, page: f.page - 1 }))}>
              <ChevronLeft className="h-4 w-4" /> Trước
            </Button>
            <span className="text-sm">
              Trang {filter.page}/{totalPages}
            </span>
            <Button size="sm" variant="outline" disabled={filter.page >= totalPages} onClick={() => setFilter((f) => ({ ...f, page: f.page + 1 }))}>
              Sau <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

function AuditDetail({ row, branchName }: { row: AuditLogRow; branchName?: string }) {
  const pretty = (v: unknown) => (v === null || v === undefined ? '—' : JSON.stringify(v, null, 2));
  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-500">
        Cơ sở: {branchName ?? (row.branchId ? row.branchId : 'Toàn công ty')} · Thiết bị: {row.deviceId ?? '—'} · IP: {row.ip ?? '—'}
      </p>
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-semibold text-ink-700">Trước</p>
          <pre className="max-h-64 overflow-auto rounded-lg border border-ink-100 bg-white p-2 text-xs">{pretty(row.before)}</pre>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold text-ink-700">Sau</p>
          <pre className="max-h-64 overflow-auto rounded-lg border border-ink-100 bg-white p-2 text-xs">{pretty(row.after)}</pre>
        </div>
      </div>
    </div>
  );
}
