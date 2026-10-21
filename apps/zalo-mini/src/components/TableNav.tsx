import { useNavigate } from 'zmp-ui';
import { cn } from '../lib/format';
import { useGuestSession } from '../lib/session-store';

const TABS = [
  { path: '/table', label: 'Gọi món' },
  { path: '/table/orders', label: 'Món đã gọi' },
  { path: '/table/bill', label: 'Hóa đơn' },
] as const;

/** Thẻ bàn + tab con của luồng gọi món tại bàn. */
export function TableNav({ current }: { current: (typeof TABS)[number]['path'] }) {
  const navigate = useNavigate();
  const { table, branch, joinPin } = useGuestSession();
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between rounded-2xl bg-maroon px-4 py-3 text-cream">
        <div className="min-w-0">
          <p className="truncate text-xs text-cream/75">{branch?.name}</p>
          <p className="truncate text-lg font-bold">
            {table?.name}
            {table?.area ? (
              <span className="text-sm font-normal text-cream/80"> · {table.area}</span>
            ) : null}
          </p>
        </div>
        {joinPin ? (
          <div className="shrink-0 text-right">
            <p className="text-[11px] text-cream/75">PIN mời bạn</p>
            <p className="font-mono text-lg font-bold tracking-widest">{joinPin}</p>
          </div>
        ) : null}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-cream-dark p-1">
        {TABS.map((t) => (
          <button
            key={t.path}
            type="button"
            onClick={() =>
              t.path !== current && navigate(t.path, { replace: true, animate: false })
            }
            className={cn(
              'rounded-lg py-2 text-sm font-semibold',
              t.path === current ? 'bg-paper text-maroon shadow-sm' : 'text-ink-soft',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
