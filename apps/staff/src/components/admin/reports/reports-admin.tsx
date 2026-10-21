'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PAYMENT_METHOD_LABELS, SALES_GROUP_LABELS, VOID_REASON_LABELS, type SalesGroupBy } from '@dalan/contracts';
import { errorMessage } from '@/lib/api';
import { useAuth, useBranchId, useCan } from '@/lib/auth-store';
import {
  downloadReportCsv,
  useDiscountsVoidsReport,
  useKitchenReport,
  useRealtimeReport,
  useSalesReport,
  useShiftsReport,
  type KeyAgg,
  type RangeParams,
} from '@/lib/queries-admin';
import { cn, dateTimeVi, money, moneyShort } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, Loading, Segmented, Select } from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';
import { Card, Table } from '../form';

type Tab = 'overview' | 'sales' | 'kitchen' | 'dv' | 'shifts';

const BRAND = 'var(--color-brand-600)';
const GRID_COLOR = 'var(--color-ink-100)';
const AXIS_COLOR = 'var(--color-ink-500)';

const methodLabel = (k: string) => (PAYMENT_METHOD_LABELS as Record<string, string>)[k] ?? k;
const reasonLabel = (k: string) => (VOID_REASON_LABELS as Record<string, string>)[k] ?? k;
const DISCOUNT_KIND: Record<string, string> = { PERCENT: 'Giảm theo %', AMOUNT: 'Giảm số tiền', VOUCHER: 'Voucher', POINTS: 'Đổi điểm', COMP: 'Mời (miễn phí)' };
const WEEKDAY_VI = ['', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function preset(kind: 'today' | '7d' | '30d' | 'month'): { from: string; to: string } {
  const now = new Date();
  const to = ymd(now);
  if (kind === 'today') return { from: to, to };
  if (kind === 'month') return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to };
  const d = new Date(now);
  d.setDate(d.getDate() - (kind === '7d' ? 6 : 29));
  return { from: ymd(d), to };
}

export function ReportsAdmin() {
  const activeBranch = useBranchId();
  const branches = useAuth((s) => s.me?.branches ?? []);
  const canAll = useCan('report.all');
  const canExport = useCan('report.export') || canAll;
  const [branchSel, setBranchSel] = useState<string>(activeBranch);
  const [range, setRange] = useState(() => preset('7d'));
  const [tab, setTab] = useState<Tab>('overview');
  const [exporting, setExporting] = useState(false);
  const branchId = branchSel || undefined;
  const params: RangeParams = { branchId, from: range.from, to: range.to };
  const [groupBy, setGroupBy] = useState<SalesGroupBy>('day');

  const exportCsv = async () => {
    setExporting(true);
    try {
      const report = tab === 'kitchen' ? 'kitchen' : tab === 'dv' ? 'discounts-voids' : tab === 'shifts' ? 'shifts' : 'sales';
      await downloadReportCsv({ branchId, from: range.from, to: range.to, groupBy, report });
      toast.success('Đã tải file CSV');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold text-ink-900">Báo cáo</h1>
        <Segmented
          className="ml-auto flex-wrap"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'overview', label: 'Hôm nay' },
            { value: 'sales', label: 'Doanh thu' },
            { value: 'kitchen', label: 'Bếp' },
            { value: 'dv', label: 'Giảm giá & hủy' },
            { value: 'shifts', label: 'Ca' },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-ink-100 bg-white p-3">
        <div className="w-full sm:w-56">
          <Select label="Cơ sở" value={branchSel} onChange={(e) => setBranchSel(e.target.value)}>
            {canAll && <option value="">Tất cả cơ sở</option>}
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </div>
        {tab !== 'overview' && (
          <>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-ink-700">Từ ngày</span>
              <input type="date" className="min-h-[48px] rounded-xl border border-ink-300 bg-white px-3" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange((r) => ({ ...r, from: e.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-ink-700">Đến ngày</span>
              <input type="date" className="min-h-[48px] rounded-xl border border-ink-300 bg-white px-3" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))} />
            </label>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ['today', 'Hôm nay'],
                  ['7d', '7 ngày'],
                  ['30d', '30 ngày'],
                  ['month', 'Tháng này'],
                ] as const
              ).map(([k, l]) => {
                const p = preset(k);
                const on = p.from === range.from && p.to === range.to;
                return (
                  <button key={k} type="button" onClick={() => setRange(p)} className={cn('min-h-[44px] rounded-lg px-3 text-sm font-semibold', on ? 'bg-brand-700 text-white' : 'bg-ink-100 text-ink-700')}>
                    {l}
                  </button>
                );
              })}
            </div>
            {canExport && (
              <Button variant="outline" className="ml-auto" loading={exporting} onClick={() => void exportCsv()}>
                <Download className="h-4 w-4" /> Xuất CSV
              </Button>
            )}
          </>
        )}
      </div>

      {tab === 'overview' && <Overview branchId={branchId} />}
      {tab === 'sales' && <Sales params={params} groupBy={groupBy} setGroupBy={setGroupBy} canAll={canAll} />}
      {tab === 'kitchen' && <Kitchen params={params} />}
      {tab === 'dv' && <DiscountsVoids params={params} />}
      {tab === 'shifts' && <Shifts params={params} />}
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'danger' | 'warning' }) {
  return (
    <div className={cn('rounded-2xl border bg-white p-3 shadow-sm', tone === 'danger' ? 'border-red-200' : tone === 'warning' ? 'border-amber-200' : 'border-ink-100')}>
      <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">{label}</p>
      <p className={cn('mt-1 text-2xl font-bold tabular-nums', tone === 'danger' ? 'text-red-700' : 'text-ink-900')}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-500">{sub}</p>}
    </div>
  );
}

function Overview({ branchId }: { branchId?: string }) {
  const rt = useRealtimeReport(branchId);
  if (rt.isLoading) return <Loading />;
  if (rt.isError || !rt.data) return <p className="text-red-700">{errorMessage(rt.error)}</p>;
  const d = rt.data;
  const perGuest = d.todayGuests > 0 ? Math.round(d.todayRevenue / d.todayGuests) : 0;
  const hourly = Array.from({ length: 24 }, (_, h) => ({ label: `${h}h`, revenue: d.hourly.find((x) => x.hour === h)?.revenue ?? 0 })).filter((_, h) => h >= 5 || d.hourly.some((x) => x.hour === h));
  const methods = Object.entries(d.byMethod)
    .map(([k, v]) => ({ label: methodLabel(k), revenue: v }))
    .sort((a, b) => b.revenue - a.revenue);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-ink-500">
        Ngày kinh doanh <b className="text-ink-900">{d.businessDate}</b> · tự cập nhật mỗi 30 giây
        <button type="button" onClick={() => void rt.refetch()} className="ml-1 flex h-9 w-9 items-center justify-center rounded-full hover:bg-ink-100" aria-label="Làm mới">
          <RefreshCw className={cn('h-4 w-4', rt.isFetching && 'animate-spin')} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
        <Tile
          label="Doanh thu hôm nay"
          value={moneyShort(d.todayRevenue)}
          sub={d.changePct === null ? `Cùng kỳ tuần trước: ${money(d.lastWeekSameDayRevenue)}` : `${d.changePct >= 0 ? '▲' : '▼'} ${Math.abs(d.changePct).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}% so với tuần trước`}
        />
        <Tile label="Số bill" value={d.todayBills} sub={d.todayBills ? `TB ${money(Math.round(d.todayRevenue / d.todayBills))}/bill` : undefined} />
        <Tile label="Số khách" value={d.todayGuests} sub={`TB ${money(perGuest)}/khách`} />
        <Tile label="Bàn đang phục vụ" value={d.openSessions} sub={`${d.seatedGuests} khách đang ngồi`} />
        <Tile label="Phiếu bếp quá hạn" value={d.overdueTickets} tone={d.overdueTickets > 0 ? 'danger' : undefined} />
        <Tile label="Yêu cầu chưa xử lý" value={d.openServiceRequests} tone={d.openServiceRequests > 0 ? 'warning' : undefined} />
        <Tile label="Đặt bàn sắp tới (2 giờ)" value={d.upcomingReservations} />
        <Tile label="Tiệc hôm nay" value={d.eventsToday} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Doanh thu theo giờ hôm nay">
          <RevenueBars data={hourly} height={240} />
        </Card>
        <Card title="Theo phương thức thanh toán">
          {methods.length === 0 ? <EmptyState title="Chưa có thanh toán hôm nay" /> : <RevenueBars data={methods} height={240} horizontal />}
        </Card>
      </div>
    </div>
  );
}

/** Biểu đồ cột một chuỗi (doanh thu): màu thương hiệu, lưới mờ, tooltip định dạng VND. */
function RevenueBars({ data, height = 280, horizontal }: { data: { label: string; revenue: number }[]; height?: number; horizontal?: boolean }) {
  const h = horizontal ? Math.max(height, data.length * 30 + 40) : height;
  return (
    <div style={{ width: '100%', height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 16, bottom: 4, left: horizontal ? 8 : 0 }} barCategoryGap={horizontal ? 6 : '20%'}>
          <CartesianGrid stroke={GRID_COLOR} vertical={!!horizontal} horizontal={!horizontal} />
          {horizontal ? (
            <>
              <XAxis type="number" tickFormatter={(v: number) => moneyShort(v)} tick={{ fill: AXIS_COLOR, fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="label" width={150} tick={{ fill: AXIS_COLOR, fontSize: 12 }} axisLine={false} tickLine={false} interval={0} />
            </>
          ) : (
            <>
              <XAxis dataKey="label" tick={{ fill: AXIS_COLOR, fontSize: 12 }} axisLine={{ stroke: GRID_COLOR }} tickLine={false} />
              <YAxis tickFormatter={(v: number) => moneyShort(v)} tick={{ fill: AXIS_COLOR, fontSize: 12 }} axisLine={false} tickLine={false} width={64} />
            </>
          )}
          <Tooltip cursor={{ fill: 'rgba(127,34,51,0.06)' }} formatter={(v) => [money(Number(v)), 'Doanh thu']} contentStyle={{ borderRadius: 12, borderColor: 'var(--color-ink-100)' }} />
          <Bar dataKey="revenue" fill={BRAND} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={horizontal ? 22 : 40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const SALES_GROUPS: SalesGroupBy[] = ['day', 'hour', 'weekday', 'category', 'item', 'staff', 'method', 'source', 'branch'];

function Sales({ params, groupBy, setGroupBy, canAll }: { params: RangeParams; groupBy: SalesGroupBy; setGroupBy: (g: SalesGroupBy) => void; canAll: boolean }) {
  const q = useSalesReport({ ...params, groupBy });
  const groups = SALES_GROUPS.filter((g) => g !== 'branch' || (canAll && !params.branchId));
  const rows = useMemo(() => {
    const list = (q.data?.rows ?? []).map((r) => ({
      ...r,
      label: groupBy === 'method' ? methodLabel(r.label) : groupBy === 'weekday' && /^\d$/.test(r.label) ? WEEKDAY_VI[Number(r.label)] ?? r.label : r.label,
    }));
    return list;
  }, [q.data, groupBy]);
  const horizontal = ['category', 'item', 'staff', 'method', 'source', 'branch'].includes(groupBy);
  const chartRows = horizontal ? [...rows].sort((a, b) => b.revenue - a.revenue).slice(0, 15) : rows;

  return (
    <div className="space-y-3">
      <div className="no-scrollbar flex gap-1 overflow-x-auto">
        {groups.map((g) => (
          <button key={g} type="button" onClick={() => setGroupBy(g)} className={cn('min-h-[40px] shrink-0 rounded-lg px-3 text-sm font-semibold', groupBy === g ? 'bg-brand-700 text-white' : 'bg-white text-ink-700 border border-ink-100')}>
            {SALES_GROUP_LABELS[g]}
          </button>
        ))}
      </div>
      {q.isLoading ? (
        <Loading />
      ) : q.isError || !q.data ? (
        <p className="text-red-700">{errorMessage(q.error)}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <Tile label="Doanh thu" value={moneyShort(q.data.total.revenue)} sub={money(q.data.total.revenue)} />
            <Tile label="Số bill" value={q.data.total.bills} />
            <Tile label="Số khách" value={q.data.total.guests} />
            <Tile label="TB mỗi bill" value={moneyShort(q.data.total.avgBill)} />
            <Tile label="Giảm giá" value={moneyShort(q.data.total.discounts)} />
          </div>
          <Card title={`Doanh thu ${SALES_GROUP_LABELS[groupBy].toLowerCase()}${horizontal && rows.length > 15 ? ' (15 dòng cao nhất)' : ''}`}>
            {rows.length === 0 ? <EmptyState title="Không có dữ liệu trong khoảng thời gian này" /> : <RevenueBars data={chartRows} horizontal={horizontal} />}
          </Card>
          <Card title="Bảng số liệu">
            <Table head={[SALES_GROUP_LABELS[groupBy].replace('Theo ', ''), 'Doanh thu', 'Bill', 'Khách', 'TB/bill', 'Giảm giá']}>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-ink-100 last:border-0">
                  <td className="px-2 py-1.5">{r.label}</td>
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{money(r.revenue)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.bills}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.guests}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{money(r.avgBill)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{money(r.discounts)}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}

function Kitchen({ params }: { params: RangeParams }) {
  const q = useKitchenReport(params);
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <p className="text-red-700">{errorMessage(q.error)}</p>;
  const d = q.data;
  const fmt = (m: number) => `${m.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} phút`;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card title={`Thời gian ra món theo trạm (${d.ticketCount} phiếu)`}>
        {d.stations.length === 0 ? (
          <EmptyState title="Chưa có phiếu bếp" />
        ) : (
          <Table head={['Trạm', 'Số phiếu', 'Trung bình', 'P90', 'Lâu nhất']}>
            {d.stations.map((s) => (
              <tr key={s.stationCode} className="border-b border-ink-100 last:border-0">
                <td className="px-2 py-1.5 font-semibold">{s.stationCode}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{s.tickets}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmt(s.avgMinutes)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmt(s.p90Minutes)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmt(s.maxMinutes)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Card title="Món ra chậm nhất">
        {d.slowestItems.length === 0 ? (
          <EmptyState title="Chưa có dữ liệu" />
        ) : (
          <Table head={['Món', 'Trạm', 'Số lần', 'Trung bình']}>
            {d.slowestItems.map((i) => (
              <tr key={`${i.name}-${i.stationCode}`} className="border-b border-ink-100 last:border-0">
                <td className="px-2 py-1.5">{i.name}</td>
                <td className="px-2 py-1.5">{i.stationCode}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{i.count}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmt(i.avgMinutes)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

function AggTable({ title, rows, labelOf = (k) => k }: { title: string; rows: KeyAgg[]; labelOf?: (k: string) => string }) {
  return (
    <Card title={title}>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-ink-500">Không có dữ liệu</p>
      ) : (
        <Table head={['', 'Số lần', 'Giá trị']} className="[&_table]:min-w-0">
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-ink-100 last:border-0">
              <td className="px-2 py-1.5">{labelOf(r.key)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.count}</td>
              <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{money(r.amount)}</td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}

function DiscountsVoids({ params }: { params: RangeParams }) {
  const q = useDiscountsVoidsReport(params);
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <p className="text-red-700">{errorMessage(q.error)}</p>;
  const { discounts, voids } = q.data;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Tile label="Tổng giảm giá" value={moneyShort(discounts.total)} sub={`${discounts.count} lần`} />
        <Tile label="Tổng hủy món" value={moneyShort(voids.total)} sub={`${voids.count} dòng`} tone={voids.count > 0 ? 'warning' : undefined} />
        <Tile label="Hủy món đã nấu (hao hụt)" value={moneyShort(voids.wasted)} tone={voids.wasted > 0 ? 'danger' : undefined} />
        <Tile label="TB mỗi dòng hủy" value={voids.count ? moneyShort(Math.round(voids.total / voids.count)) : "—"} />
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <AggTable title="Giảm giá theo loại" rows={discounts.byKind} labelOf={(k) => DISCOUNT_KIND[k] ?? k} />
        <AggTable title="Giảm giá theo nhân viên" rows={discounts.byStaff} />
        <AggTable title="Hủy món theo lý do" rows={voids.byReason} labelOf={reasonLabel} />
        <AggTable title="Hủy món theo nhân viên" rows={voids.byStaff} />
        <AggTable title="Món bị hủy nhiều" rows={voids.byItem} />
      </div>
    </div>
  );
}

function Shifts({ params }: { params: RangeParams }) {
  const q = useShiftsReport(params);
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <p className="text-red-700">{errorMessage(q.error)}</p>;
  return (
    <Card title={`Ca làm việc (${q.data.length})`}>
      {q.data.length === 0 ? (
        <EmptyState title="Không có ca nào" />
      ) : (
        <Table head={['Mở ca', 'Cơ sở', 'Người mở / kết', 'Tiền đầu ca', 'Dự kiến', 'Đếm thực tế', 'Chênh lệch', 'Bill', 'Trạng thái']}>
          {q.data.map((s) => (
            <tr key={s.id} className="border-b border-ink-100 last:border-0">
              <td className="px-2 py-1.5 whitespace-nowrap">
                {dateTimeVi(s.openedAt)}
                {s.closedAt && <span className="block text-xs text-ink-500">→ {dateTimeVi(s.closedAt)}</span>}
              </td>
              <td className="px-2 py-1.5">{s.branch}</td>
              <td className="px-2 py-1.5 text-xs">
                {s.openedBy ?? '—'}
                {s.closedBy && <span className="block text-ink-500">{s.closedBy}</span>}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{money(s.openingCash)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{s.expectedCash === null ? '—' : money(s.expectedCash)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{s.closingCashCounted === null ? '—' : money(s.closingCashCounted)}</td>
              <td className={cn('px-2 py-1.5 text-right font-semibold tabular-nums', s.variance && s.variance < 0 ? 'text-red-700' : s.variance && s.variance > 0 ? 'text-emerald-700' : '')}>{s.variance === null ? '—' : money(s.variance)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{s.bills}</td>
              <td className="px-2 py-1.5">{s.status === 'OPEN' ? <Badge tone="info">Đang mở</Badge> : <Badge>Đã kết</Badge>}</td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}
