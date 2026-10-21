'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bell, ChefHat, LayoutGrid, RefreshCw, Search, Users, Wallet, X } from 'lucide-react';
import { useFloor, sessionApi, useAction, keys } from '@/lib/queries';
import { useAuth, useBranchId, useCan } from '@/lib/auth-store';
import type { FloorTable } from '@/lib/types';
import { cn, moneyShort, timeHM } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState, Loading } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page-header';
import { toast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api';
import { floorKpis, matchesFilter, matchesTableQuery, type FloorFilter } from './floor-logic';
import { TableCard } from './table-card';
import { OpenTableDialog, TableActionsSheet } from './floor-dialogs';

const AREA_KEY = 'dalan-floor-area';
const ALL = '__all__';

function readArea(): string {
  try {
    return window.localStorage.getItem(AREA_KEY) ?? ALL;
  } catch {
    return ALL;
  }
}

/** Sơ đồ bàn (trang chủ): KPI ca, lọc nhanh, khu vực, thẻ bàn theo SLA, mở/gộp bàn, thao tác nhanh. */
export function FloorScreen() {
  const router = useRouter();
  const branchId = useBranchId();
  const staffId = useAuth((s) => s.me?.staffId ?? null);
  const canOpen = useCan('dining.open');
  const canOrder = useCan('dining.order');
  const floor = useFloor();
  const [areaId, setAreaId] = useState<string>(ALL);
  const [filter, setFilter] = useState<FloorFilter>('all');
  const [query, setQuery] = useState('');
  const [selecting, setSelecting] = useState<FloorTable[]>([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [menuTable, setMenuTable] = useState<FloorTable | null>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    setAreaId(readArea());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const areas = useMemo(() => floor.data?.areas ?? [], [floor.data]);
  const allTables = useMemo(() => areas.flatMap((a) => a.tables), [areas]);
  const kpi = useMemo(() => floorKpis(allTables, now), [allTables, now]);
  const activeArea = areaId === ALL ? null : (areas.find((a) => a.id === areaId) ?? null);
  const searching = query.trim().length > 0;
  const hasMine = !!staffId && allTables.some((t) => t.session?.serverId === staffId);

  // Nhóm bàn hiển thị: theo khu đang chọn, hoặc tất cả khu (có tiêu đề); tìm kiếm luôn quét mọi khu
  const groups = useMemo(() => {
    const source = searching || !activeArea ? areas : [activeArea];
    return source
      .map((a) => ({ area: a, tables: a.tables.filter((t) => matchesFilter(t, filter, now, staffId) && matchesTableQuery(t, query)) }))
      .filter((g) => g.tables.length > 0);
  }, [areas, activeArea, searching, filter, now, staffId, query]);

  const filterCounts = useMemo(() => {
    const scope = activeArea && !searching ? activeArea.tables : allTables;
    return {
      all: scope.length,
      empty: scope.filter((t) => !t.session).length,
      busy: scope.filter((t) => !!t.session).length,
      attention: scope.filter((t) => matchesFilter(t, 'attention', now)).length,
      mine: scope.filter((t) => matchesFilter(t, 'mine', now, staffId)).length,
    };
  }, [activeArea, searching, allTables, now, staffId]);

  const open = useAction(
    (input: { tableIds: string[]; guestCount: number }) => sessionApi.open(branchId, input),
    () => [keys.floor(branchId)],
    (session) => {
      setSelecting([]);
      setOpenDialog(false);
      router.push(`/sessions/${session.id}`);
    },
  );

  const chooseArea = (id: string) => {
    setAreaId(id);
    try {
      window.localStorage.setItem(AREA_KEY, id);
    } catch {
      /* trình duyệt chặn lưu trữ: bỏ qua */
    }
  };

  const onTap = (t: FloorTable) => {
    if (t.session) {
      if (selecting.length > 0) return toast.info('Đang chọn bàn trống để mở – bỏ chọn trước khi vào bàn có khách');
      router.push(`/sessions/${t.session.id}`);
      return;
    }
    if (!canOpen && !canOrder) return toast.warning('Bạn không có quyền mở bàn');
    setSelecting((cur) => (cur.some((x) => x.id === t.id) ? cur.filter((x) => x.id !== t.id) : [...cur, t]));
  };

  if (floor.isLoading) return <Loading label="Đang tải sơ đồ bàn..." />;
  if (floor.isError) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader title="Sơ đồ bàn" />
        <EmptyState title="Không tải được sơ đồ bàn" hint={errorMessage(floor.error)} action={<Button onClick={() => floor.refetch()} loading={floor.isFetching}><RefreshCw className="h-5 w-5" /> Thử lại</Button>} />
      </div>
    );
  }

  const filters: { value: FloorFilter; label: string; count: number; danger?: boolean }[] = [
    { value: 'all', label: 'Tất cả', count: filterCounts.all },
    { value: 'empty', label: 'Trống', count: filterCounts.empty },
    { value: 'busy', label: 'Đang phục vụ', count: filterCounts.busy },
    { value: 'attention', label: 'Cần chú ý', count: filterCounts.attention, danger: filterCounts.attention > 0 },
    ...(hasMine ? [{ value: 'mine' as const, label: 'Bàn của tôi', count: filterCounts.mine }] : []),
  ];

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Sơ đồ bàn"
        subtitle={floor.data ? `${floor.data.branch.name} · cập nhật ${timeHM(floor.data.generatedAt)}` : undefined}
        actions={
          <>
            <div className="relative hidden md:block">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-ink-300" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm bàn, mã phiên..." aria-label="Tìm bàn" className="min-h-[44px] w-56 rounded-full border border-ink-100 bg-white pr-9 pl-10 text-base outline-none focus:border-brand-500 lg:w-72" />
              {query && (
                <button type="button" onClick={() => setQuery('')} className="absolute top-1/2 right-1 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-ink-500" aria-label="Xóa tìm kiếm">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <button type="button" onClick={() => floor.refetch()} className="flex h-11 w-11 items-center justify-center rounded-full border border-ink-100 bg-white text-ink-700 shadow-sm hover:bg-ink-100" aria-label="Làm mới">
              <RefreshCw className={cn('h-5 w-5', floor.isFetching && 'animate-spin')} />
            </button>
          </>
        }
      />

      {/* Chỉ số nhanh của ca */}
      <div className="grid grid-cols-2 gap-2 px-3 md:grid-cols-4 md:px-4">
        <Kpi icon={LayoutGrid} label="Bàn đang phục vụ" value={`${kpi.busy}/${kpi.tables}`} hint={kpi.tables ? `${Math.round((kpi.busy / kpi.tables) * 100)}% công suất` : undefined} tone="brand" />
        <Kpi icon={Users} label="Khách đang ngồi" value={String(kpi.guests)} tone="sky" />
        <Kpi icon={Wallet} label="Doanh thu đang mở" value={moneyShort(kpi.openRevenue)} tone="gold" />
        <Kpi icon={Bell} label="Yêu cầu chờ" value={String(kpi.requests)} hint={kpi.ready > 0 ? `${kpi.ready} món chờ mang ra` : undefined} tone={kpi.requests > 0 ? 'red' : 'ink'} href="/requests" />
      </div>

      {/* Tìm kiếm (điện thoại) + bộ lọc */}
      <div className="flex flex-col gap-2 px-3 pt-3 md:px-4">
        <div className="relative md:hidden">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-ink-300" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm bàn, mã phiên..." aria-label="Tìm bàn" className="min-h-[44px] w-full rounded-full border border-ink-100 bg-white pr-10 pl-10 text-base outline-none focus:border-brand-500" />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="absolute top-1/2 right-1 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-ink-500" aria-label="Xóa tìm kiếm">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar" role="tablist" aria-label="Lọc bàn">
          {filters.map((f) => (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                'flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition',
                filter === f.value ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-100 bg-white text-ink-700 hover:bg-ink-100',
              )}
            >
              {f.value === 'attention' && <AlertTriangle className={cn('h-4 w-4', f.danger && filter !== f.value && 'text-red-600')} />}
              {f.label}
              <span className={cn('min-w-6 rounded-full px-1.5 text-center text-xs tabular-nums', filter === f.value ? 'bg-white/20' : f.danger ? 'bg-red-600 text-white' : 'bg-ink-100')}>{f.count}</span>
            </button>
          ))}
        </div>
        {areas.length > 1 && !searching && (
          <div className="flex gap-1 overflow-x-auto border-b border-ink-100 no-scrollbar" role="tablist" aria-label="Khu vực">
            {[{ id: ALL, name: 'Tất cả khu', tables: allTables }, ...areas].map((a) => {
              const busy = a.tables.filter((t) => t.session).length;
              const active = (areaId === ALL && a.id === ALL) || activeArea?.id === a.id;
              return (
                <button key={a.id} type="button" role="tab" aria-selected={active} onClick={() => chooseArea(a.id)} className={cn('-mb-px flex min-h-[44px] shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition', active ? 'border-brand-700 text-brand-800' : 'border-transparent text-ink-500 hover:text-ink-900')}>
                  {a.name}
                  <span className="text-xs text-ink-500 tabular-nums">
                    {busy}/{a.tables.length}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-6 md:px-4">
        {areas.length === 0 ? (
          <EmptyState title="Chưa có khu vực và bàn" hint="Quản trị viên cần tạo khu vực, bàn trong mục Quản trị → Sơ đồ bàn." action={<Link href="/admin/floor" className="font-semibold text-brand-700 underline">Mở cấu hình sơ đồ bàn</Link>} />
        ) : groups.length === 0 ? (
          <EmptyState
            title={searching ? `Không tìm thấy bàn "${query}"` : 'Không có bàn phù hợp bộ lọc'}
            action={
              <Button variant="outline" onClick={() => { setQuery(''); setFilter('all'); }}>
                Xem tất cả bàn
              </Button>
            }
          />
        ) : (
          <div className="space-y-5">
            {groups.map((g) => (
              <section key={g.area.id} aria-label={g.area.name}>
                {(groups.length > 1 || !activeArea || searching) && (
                  <h2 className="mb-2 flex items-center gap-2 text-sm font-bold tracking-wide text-ink-500 uppercase">
                    {g.area.name}
                    <span className="font-semibold normal-case">· {g.area.tables.filter((t) => t.session).length}/{g.area.tables.length} bàn có khách</span>
                  </h2>
                )}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
                  {g.tables.map((t) => (
                    <TableCard key={t.id} table={t} now={now} selected={selecting.some((x) => x.id === t.id)} onTap={() => onTap(t)} onMenu={t.session ? () => setMenuTable(t) : undefined} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
        {kpi.ready > 0 && filter !== 'attention' && (
          <button type="button" onClick={() => setFilter('attention')} className="mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-50 text-sm font-semibold text-emerald-800">
            <ChefHat className="h-4 w-4" /> {kpi.ready} món đã xong đang chờ mang ra – xem bàn cần chú ý
          </button>
        )}
      </div>

      {/* Thanh mở bàn: nằm trong luồng bố cục (không fixed) để không đè điều hướng của khung ứng dụng */}
      {selecting.length > 0 && (
        <div className="safe-bottom flex items-center gap-2 border-t border-ink-100 bg-white px-3 py-2 shadow-[0_-6px_20px_rgba(0,0,0,0.06)] md:px-4">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-ink-500">{selecting.length > 1 ? `Gộp ${selecting.length} bàn` : 'Bàn đã chọn'}</div>
            <div className="truncate font-bold">{selecting.map((t) => t.name).join(' + ')}</div>
          </div>
          <Button variant="ghost" onClick={() => setSelecting([])}>
            Bỏ chọn
          </Button>
          <Button size="lg" onClick={() => setOpenDialog(true)}>
            Mở bàn{selecting.length > 1 ? ` (${selecting.length})` : ''}
          </Button>
        </div>
      )}

      <OpenTableDialog open={openDialog} tables={selecting} loading={open.isPending} onClose={() => setOpenDialog(false)} onConfirm={(guestCount) => open.mutate({ tableIds: selecting.map((t) => t.id), guestCount }, { onError: (e) => toast.error(errorMessage(e)) })} />
      <TableActionsSheet table={menuTable} now={now} onClose={() => setMenuTable(null)} />
    </div>
  );
}

const KPI_TONE = {
  brand: 'bg-brand-50 text-brand-700',
  sky: 'bg-sky-50 text-sky-700',
  gold: 'bg-gold-100 text-gold-700',
  red: 'bg-red-50 text-red-700',
  ink: 'bg-ink-100 text-ink-500',
} as const;

function Kpi({ icon: Icon, label, value, hint, tone, href }: { icon: typeof Users; label: string; value: string; hint?: string; tone: keyof typeof KPI_TONE; href?: string }) {
  const body = (
    <>
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', KPI_TONE[tone])}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold text-ink-500">{label}</span>
        <span className="block text-xl leading-tight font-extrabold text-ink-900 tabular-nums">{value}</span>
        {hint && <span className="block truncate text-[11px] text-ink-500">{hint}</span>}
      </span>
    </>
  );
  const cls = 'flex min-h-[64px] items-center gap-3 rounded-2xl border border-ink-100 bg-white px-3 py-2 shadow-sm';
  return href ? (
    <Link href={href} className={cn(cls, 'hover:bg-ink-100/40')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
