'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, Coins, GitMerge, Link2, Pencil, Ticket } from 'lucide-react';
import { RESERVATION_STATUS_LABELS } from '@dalan/contracts';
import { errorMessage } from '@/lib/api';
import { useAuth, useCan } from '@/lib/auth-store';
import { useCustomer, useCustomerPoints, useCustomerVouchers } from '@/lib/queries-ops';
import { bpsLabel, dateLabel, phoneDisplay, vnDate, vnDateTime } from '@/lib/ops-utils';
import { money, moneyPlain } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, Loading } from '@/components/ui/primitives';
import { Card, Stat, TabBar, Table } from '@/components/ops/ui';
import { AttachSessionDialog, EditCustomerDialog, MergeDialog, PointsDialog, VoucherDialog } from './customer-dialogs';

type Tab = 'visits' | 'reservations' | 'points' | 'vouchers' | 'feedback';
const GENDER: Record<string, string> = { M: 'Nam', F: 'Nữ', O: 'Khác' };
const POINT_KIND: Record<string, string> = { EARN: 'Tích điểm', REDEEM: 'Đổi điểm', ADJUST: 'Điều chỉnh', EXPIRE: 'Hết hạn', REVERSE: 'Hoàn điểm' };
const VOUCHER_STATUS: Record<string, { label: string; tone: 'success' | 'neutral' | 'danger' | 'warning' }> = {
  ACTIVE: { label: 'Còn hiệu lực', tone: 'success' },
  USED: { label: 'Đã dùng', tone: 'neutral' },
  EXPIRED: { label: 'Hết hạn', tone: 'warning' },
  REVOKED: { label: 'Đã thu hồi', tone: 'danger' },
};

export function CustomerDetailScreen({ customerId }: { customerId: string }) {
  const c = useCustomer(customerId);
  const points = useCustomerPoints(customerId);
  const activeVouchers = useCustomerVouchers(customerId);
  const branches = useAuth((s) => s.me?.branches ?? []);
  const canManage = useCan('customer.manage');
  const canOrder = useCan('dining.order');
  const canCollect = useCan('billing.collect');
  const canAttach = canOrder || canCollect;
  const [tab, setTab] = useState<Tab>('visits');
  const [dialog, setDialog] = useState<'none' | 'edit' | 'points' | 'voucher' | 'merge' | 'attach'>('none');
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? '';

  if (c.isLoading) return <Loading />;
  if (!c.data) return <div className="p-4 text-red-700">{errorMessage(c.error)}</div>;
  const d = c.data;

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 bg-white px-2 py-2">
        <Link href="/customers" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-ink-100" aria-label="Quay lại">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-bold">{d.fullName ?? 'Chưa có tên'}</h1>
            {d.tier && <Badge tone="brand">{d.tier.name}</Badge>}
            {d.isAnonymized && <Badge tone="danger">Đã ẩn danh</Badge>}
          </div>
          <div className="text-sm text-ink-500">
            {phoneDisplay(d.phone)}
            {d.phoneMasked && ' (đã che)'}
            {d.email ? ` · ${d.email}` : ''}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canAttach && (
            <Button variant="outline" onClick={() => setDialog('attach')}>
              <Link2 className="h-5 w-5" /> Gắn vào bàn
            </Button>
          )}
          {canManage && (
            <>
              <Button variant="outline" onClick={() => setDialog('points')}>
                <Coins className="h-5 w-5" /> Điểm
              </Button>
              <Button variant="outline" onClick={() => setDialog('voucher')}>
                <Ticket className="h-5 w-5" /> Tặng voucher
              </Button>
              <Button variant="outline" onClick={() => setDialog('merge')}>
                <GitMerge className="h-5 w-5" /> Gộp
              </Button>
              <Button onClick={() => setDialog('edit')}>
                <Pencil className="h-5 w-5" /> Sửa hồ sơ
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="space-y-3 p-3 md:p-4">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <Stat label="Điểm" value={moneyPlain(d.pointsBalance)} tone="brand" />
          <Stat label="Lần ghé" value={d.visitCount} hint={d.lastVisitAt ? `Gần nhất ${dateLabel(vnDate(d.lastVisitAt), false)}` : 'Chưa ghé'} />
          <Stat label="Chi tiêu 12 tháng" value={money(d.spend12m)} />
          <Stat label="Tổng chi tiêu" value={money(d.lifetimeSpend)} />
          <Stat label="Voucher còn dùng" value={activeVouchers.data?.length ?? '—'} />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Card title="Thông tin">
            <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-ink-500">Ngày sinh</dt>
              <dd>{d.birthday ? dateLabel(d.birthday.slice(0, 10), false) : '—'}</dd>
              <dt className="text-ink-500">Giới tính</dt>
              <dd>{d.gender ? GENDER[d.gender] : '—'}</dd>
              <dt className="text-ink-500">Công ty</dt>
              <dd>{d.companyName ?? '—'}</dd>
              <dt className="text-ink-500">Mã số thuế</dt>
              <dd>{d.taxCode ?? '—'}</dd>
              <dt className="text-ink-500">Địa chỉ công ty</dt>
              <dd>{d.companyAddress ?? '—'}</dd>
              <dt className="text-ink-500">Nhận tin ưu đãi</dt>
              <dd>{d.marketingConsent ? 'Đã đồng ý' : 'Chưa đồng ý'}</dd>
              <dt className="text-ink-500">Hạng</dt>
              <dd>{d.tier ? `${d.tier.name} · hệ số ${bpsLabel(d.tier.earnMultiplierBps)}` : 'Chưa xếp hạng'}</dd>
              <dt className="text-ink-500">Khách từ</dt>
              <dd>{d.firstVisitAt ? dateLabel(vnDate(d.firstVisitAt), false) : dateLabel(vnDate(d.createdAt), false)}</dd>
            </dl>
          </Card>
          <Card title="Lưu ý phục vụ">
            {d.tags.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1">
                {d.tags.map((t) => (
                  <Badge key={t} tone="brand">
                    {t}
                  </Badge>
                ))}
              </div>
            )}
            <div className="space-y-1.5 text-sm">
              <div>
                <span className="text-ink-500">Dị ứng: </span>
                <span className={d.allergies ? 'font-semibold text-red-800' : ''}>{d.allergies ?? 'Không ghi nhận'}</span>
              </div>
              <div>
                <span className="text-ink-500">Sở thích: </span>
                {d.preferences ?? '—'}
              </div>
              <div className="whitespace-pre-line">
                <span className="text-ink-500">Ghi chú: </span>
                {d.notes ?? '—'}
              </div>
            </div>
          </Card>
        </div>

        <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white">
          <TabBar
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'visits', label: `Lần ghé, hóa đơn (${d.bills.length})` },
              { value: 'reservations', label: `Đặt bàn (${d.reservations.length})` },
              { value: 'points', label: 'Lịch sử điểm' },
              { value: 'vouchers', label: `Voucher (${d.vouchers.length})` },
              { value: 'feedback', label: `Đánh giá (${d.feedback.length})` },
            ]}
          />
          <div className="p-3">
            {tab === 'visits' &&
              (d.bills.length === 0 ? (
                <EmptyState title="Chưa có hóa đơn đã thanh toán" />
              ) : (
                <Table head={['Thời gian', 'Hóa đơn', 'Phiên bàn', 'Cơ sở', 'Số khách', 'Tổng tiền']}>
                  {d.bills.map((b) => (
                    <tr key={b.id}>
                      <td className="px-3 py-2">{vnDateTime(b.closedAt)}</td>
                      <td className="px-3 py-2 font-semibold">{b.code}</td>
                      <td className="px-3 py-2 text-ink-500">{b.session?.code ?? '—'}</td>
                      <td className="px-3 py-2">{branchName(b.branchId)}</td>
                      <td className="px-3 py-2 tabular-nums">{b.session?.guestCount ?? '—'}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{money(b.total)}</td>
                    </tr>
                  ))}
                </Table>
              ))}
            {tab === 'reservations' &&
              (d.reservations.length === 0 ? (
                <EmptyState title="Chưa có đặt bàn" />
              ) : (
                <Table head={['Thời gian', 'Mã', 'Cơ sở', 'Số khách', 'Trạng thái']}>
                  {d.reservations.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2">{vnDateTime(r.reservedAt)}</td>
                      <td className="px-3 py-2 font-semibold">{r.code}</td>
                      <td className="px-3 py-2">{branchName(r.branchId)}</td>
                      <td className="px-3 py-2 tabular-nums">{r.partySize}</td>
                      <td className="px-3 py-2">
                        <Badge>{RESERVATION_STATUS_LABELS[r.status] ?? r.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </Table>
              ))}
            {tab === 'points' &&
              (points.isLoading ? (
                <Loading />
              ) : (points.data ?? d.pointsTx).length === 0 ? (
                <EmptyState title="Chưa có giao dịch điểm" />
              ) : (
                <Table head={['Thời gian', 'Loại', 'Điểm', 'Số dư', 'Lý do / Hóa đơn']}>
                  {(points.data ?? d.pointsTx).map((p) => (
                    <tr key={p.id}>
                      <td className="px-3 py-2">{vnDateTime(p.createdAt)}</td>
                      <td className="px-3 py-2">{POINT_KIND[p.kind] ?? p.kind}</td>
                      <td className={`px-3 py-2 font-semibold tabular-nums ${p.points >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {p.points > 0 ? '+' : ''}
                        {moneyPlain(p.points)}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{moneyPlain(p.balanceAfter)}</td>
                      <td className="px-3 py-2 text-ink-700">{p.bill ? `${p.bill.code} · ${money(p.bill.total)}` : (p.reason ?? '—')}</td>
                    </tr>
                  ))}
                </Table>
              ))}
            {tab === 'vouchers' &&
              (d.vouchers.length === 0 ? (
                <EmptyState title="Chưa có voucher" />
              ) : (
                <Table head={['Mã', 'Ưu đãi', 'Điều kiện', 'Hạn dùng', 'Trạng thái']}>
                  {d.vouchers.map((v) => (
                    <tr key={v.id}>
                      <td className="px-3 py-2 font-mono font-semibold">{v.code}</td>
                      <td className="px-3 py-2">{v.kind === 'PERCENT' ? `Giảm ${bpsLabel(v.value)}${v.maxDiscount ? ` (tối đa ${money(v.maxDiscount)})` : ''}` : `Giảm ${money(v.value)}`}</td>
                      <td className="px-3 py-2 text-ink-700">{v.minBill ? `Hóa đơn từ ${money(v.minBill)}` : 'Không'}</td>
                      <td className="px-3 py-2">{v.validTo ? dateLabel(vnDate(v.validTo), false) : 'Không giới hạn'}</td>
                      <td className="px-3 py-2">
                        <Badge tone={VOUCHER_STATUS[v.status]?.tone ?? 'neutral'}>{VOUCHER_STATUS[v.status]?.label ?? v.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </Table>
              ))}
            {tab === 'feedback' &&
              (d.feedback.length === 0 ? (
                <EmptyState title="Chưa có đánh giá" />
              ) : (
                <ul className="space-y-2">
                  {d.feedback.map((f) => (
                    <li key={f.id} className="rounded-xl border border-ink-100 p-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gold-700">{'★'.repeat(f.rating)}{'☆'.repeat(5 - f.rating)}</span>
                        <span className="text-ink-500">{vnDateTime(f.createdAt)}</span>
                      </div>
                      {f.comment && <p className="mt-1">{f.comment}</p>}
                      {f.response && <p className="mt-1 text-ink-500">Phản hồi: {f.response}</p>}
                    </li>
                  ))}
                </ul>
              ))}
          </div>
        </div>
      </div>

      {dialog === 'edit' && <EditCustomerDialog customer={d} onClose={() => setDialog('none')} />}
      {dialog === 'points' && <PointsDialog customer={d} onClose={() => setDialog('none')} />}
      {dialog === 'voucher' && <VoucherDialog customer={d} onClose={() => setDialog('none')} />}
      {dialog === 'merge' && <MergeDialog open onClose={() => setDialog('none')} target={d} />}
      {dialog === 'attach' && <AttachSessionDialog customer={d} onClose={() => setDialog('none')} />}
    </div>
  );
}
