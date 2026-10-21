'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, GitMerge, Plus, Search, UserSearch, X } from 'lucide-react';
import { TIER_LABELS } from '@dalan/contracts';
import { useCan } from '@/lib/auth-store';
import { useCustomers, useTiers } from '@/lib/queries-ops';
import { bpsLabel, dateLabel, phoneDisplay, vnDate } from '@/lib/ops-utils';
import { money, moneyPlain } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, Input, Loading, Select } from '@/components/ui/primitives';
import { ErrorBox, PageHeader, TabBar, Table, useDebounced } from '@/components/ops/ui';
import { CreateCustomerDialog, MergeDialog } from './customer-dialogs';

type Tab = 'list' | 'tiers';

export function CustomersScreen() {
  const [tab, setTab] = useState<Tab>('list');
  const [q, setQ] = useState('');
  const [tierId, setTierId] = useState('');
  const [tag, setTag] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const canManage = useCan('customer.manage');
  const canSeePhone = useCan('customer.phone.view_full');
  const dq = useDebounced(q, 300);
  const dtag = useDebounced(tag, 400);
  const res = useCustomers({ q: dq || undefined, tierId: tierId || undefined, tag: dtag || undefined, page, pageSize: 20 });
  const tiers = useTiers();
  const totalPages = res.data ? Math.max(1, Math.ceil(res.data.total / res.data.pageSize)) : 1;

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Khách hàng"
        subtitle={res.data ? `${moneyPlain(res.data.total)} hồ sơ` : undefined}
        actions={
          canManage && (
            <>
              <Button variant="outline" onClick={() => setMergeOpen(true)}>
                <GitMerge className="h-5 w-5" /> Gộp hồ sơ trùng
              </Button>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-5 w-5" /> Thêm khách
              </Button>
            </>
          )
        }
      />
      <TabBar
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'list', label: 'Danh sách khách' },
          { value: 'tiers', label: 'Hạng thành viên' },
        ]}
      />
      {tab === 'list' ? (
        <div className="space-y-3 p-3 md:p-4">
          <div className="grid gap-2 sm:grid-cols-[1fr_200px_200px]">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-ink-300" />
              <Input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                placeholder="Tên, số điện thoại, email, công ty"
                className="pl-10"
              />
            </div>
            <Select
              value={tierId}
              onChange={(e) => {
                setTierId(e.target.value);
                setPage(1);
              }}
              aria-label="Lọc theo hạng"
            >
              <option value="">Mọi hạng</option>
              {(tiers.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
            <Input
              value={tag}
              onChange={(e) => {
                setTag(e.target.value);
                setPage(1);
              }}
              placeholder="Nhãn, ví dụ VIP"
              aria-label="Lọc theo nhãn"
            />
          </div>
          {!canSeePhone && <p className="text-xs text-ink-500">Số điện thoại được che một phần theo phân quyền (Nghị định 13/2023).</p>}
          <ErrorBox error={res.error} />
          {res.isLoading ? (
            <Loading />
          ) : (res.data?.items.length ?? 0) === 0 ? (
            <EmptyState
              icon={UserSearch}
              title={q || tierId || tag ? 'Không tìm thấy khách' : 'Chưa có hồ sơ khách'}
              hint={q || tierId || tag ? 'Thử tìm bằng 4 số cuối điện thoại hoặc tên không dấu.' : 'Hồ sơ được tạo khi khách đặt bàn, gắn vào bàn hoặc khi bạn thêm thủ công.'}
              action={
                <>
                  {(q || tierId || tag) && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setQ('');
                        setTierId('');
                        setTag('');
                        setPage(1);
                      }}
                    >
                      <X className="h-5 w-5" /> Xóa bộ lọc
                    </Button>
                  )}
                  {canManage && (
                    <Button onClick={() => setCreateOpen(true)}>
                      <Plus className="h-5 w-5" /> Thêm khách
                    </Button>
                  )}
                </>
              }
            />
          ) : (
            <div className="divide-y divide-ink-100 overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-ink-900/[0.06]">
              {res.data!.items.map((c) => (
                <Link key={c.id} href={`/customers/${c.id}`} className="flex items-center gap-3 px-3 py-3 hover:bg-paper">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-800">{(c.fullName ?? '?').trim().split(/\s+/).pop()?.[0]?.toUpperCase() ?? '?'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate font-bold">{c.fullName ?? 'Chưa có tên'}</span>
                      {c.tier && <Badge tone="brand">{c.tier.name}</Badge>}
                      {c.tags.slice(0, 3).map((t) => (
                        <Badge key={t}>{t}</Badge>
                      ))}
                    </span>
                    <span className="block text-sm text-ink-500">
                      {phoneDisplay(c.phone)}
                      {c.companyName ? ` · ${c.companyName}` : ''}
                    </span>
                  </span>
                  <span className="hidden shrink-0 text-right text-sm sm:block">
                    <span className="block font-semibold tabular-nums">{moneyPlain(c.pointsBalance)} điểm</span>
                    <span className="block text-ink-500">
                      {c.visitCount} lần · {c.lastVisitAt ? dateLabel(vnDate(c.lastVisitAt), false) : 'chưa ghé'}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          )}
          {res.data && totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Trang trước">
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <span className="text-sm text-ink-700">
                Trang {page}/{totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Trang sau">
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3 p-3 md:p-4">
          {tiers.isLoading && <Loading />}
          <ErrorBox error={tiers.error} />
          <Table head={['Hạng', 'Mã', 'Chi tiêu 12 tháng từ', 'Hệ số tích điểm', 'Số khách']}>
            {(tiers.data ?? []).map((t) => (
              <tr key={t.id}>
                <td className="px-3 py-2 font-bold">{t.name || TIER_LABELS[t.code]}</td>
                <td className="px-3 py-2 text-ink-500">{t.code}</td>
                <td className="px-3 py-2 tabular-nums">{money(t.minSpend12m)}</td>
                <td className="px-3 py-2 tabular-nums">
                  ×{(t.earnMultiplierBps / 10_000).toLocaleString('vi-VN')} ({bpsLabel(t.earnMultiplierBps)})
                </td>
                <td className="px-3 py-2 tabular-nums">{t._count?.customers ?? '—'}</td>
              </tr>
            ))}
          </Table>
          <p className="text-sm text-ink-500">Hạng được tính theo tổng chi tiêu đã thanh toán trong 12 tháng gần nhất. Điều chỉnh hạng thủ công trong hồ sơ khách (Sửa hồ sơ).</p>
        </div>
      )}
      <CreateCustomerDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      {mergeOpen && <MergeDialog open onClose={() => setMergeOpen(false)} />}
    </div>
  );
}
