'use client';

/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { hasPermissionIn, useAuth } from '@/lib/auth-store';
import { tableQrUrl, useAdminAreas, type AdminTable } from '@/lib/queries-admin';
import { renderQr } from '@/components/pay/qr-canvas';
import { Button } from '@/components/ui/button';
import { EmptyState, Loading } from '@/components/ui/primitives';

/** Trang in mã QR: mỗi bàn một thẻ, QR trỏ tới https://menu.dalan.com.vn/q/<qrToken> kèm URL ngắn. */
export function QrSheet() {
  const router = useRouter();
  const { hydrated, accessToken, me, activeBranchId } = useAuth();
  const branchId = activeBranchId ?? '';
  const allowed = hasPermissionIn(me?.permissions, 'branch.update');
  const areas = useAdminAreas(allowed ? branchId : '');
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [qrs, setQrs] = useState<Record<string, string>>({});
  const attempted = useRef(new Set<string>());

  useEffect(() => {
    if (hydrated && !accessToken) router.replace(`/login?next=${encodeURIComponent('/admin/floor/qr')}`);
  }, [hydrated, accessToken, router]);

  const tables = useMemo(
    () => (areas.data ?? []).filter((a) => !hidden.has(a.id)).flatMap((a) => a.tables.filter((t) => t.isActive).map((t) => ({ ...t, areaName: a.name }))),
    [areas.data, hidden],
  );

  useEffect(() => {
    // Mỗi mã chỉ dựng một lần; không hủy kết quả khi effect chạy lại (StrictMode).
    const missing = tables.filter((t) => !attempted.current.has(t.qrToken));
    if (missing.length === 0) return;
    for (const t of missing) attempted.current.add(t.qrToken);
    void Promise.all(missing.map(async (t) => [t.qrToken, await renderQr(tableQrUrl(t.qrToken))] as const)).then((pairs) => {
      setQrs((cur) => {
        const next = { ...cur };
        for (const [k, v] of pairs) if (v) next[k] = v;
        return next;
      });
    });
  }, [tables]);

  if (!hydrated || !accessToken || !me) return <Loading />;
  if (!allowed) return <EmptyState title="Bạn không có quyền in mã QR bàn" />;
  if (areas.isLoading) return <Loading label="Đang tải danh sách bàn..." />;
  if (areas.isError) return <p className="p-4 text-red-700">{errorMessage(areas.error)}</p>;

  const branch = me.branches.find((b) => b.id === branchId);
  const ready = tables.every((t) => qrs[t.qrToken]);

  return (
    <div className="min-h-dvh bg-white">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-ink-100 bg-white px-4 py-3 print:hidden">
        <Link href="/admin/floor" className="flex min-h-[40px] items-center gap-1 rounded-lg px-2 font-semibold text-ink-700 hover:bg-ink-100">
          <ArrowLeft className="h-5 w-5" /> Sơ đồ bàn
        </Link>
        <h1 className="text-lg font-bold">In mã QR bàn · {branch?.name}</h1>
        <div className="flex flex-wrap gap-3 text-sm">
          {(areas.data ?? []).map((a) => (
            <label key={a.id} className="flex min-h-[40px] items-center gap-1.5">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={!hidden.has(a.id)}
                onChange={(e) =>
                  setHidden((cur) => {
                    const next = new Set(cur);
                    if (e.target.checked) next.delete(a.id);
                    else next.add(a.id);
                    return next;
                  })
                }
              />
              {a.name} ({a.tables.length})
            </label>
          ))}
        </div>
        <Button className="ml-auto" disabled={!ready || tables.length === 0} onClick={() => window.print()}>
          <Printer className="h-5 w-5" /> In {tables.length} thẻ
        </Button>
      </div>
      {tables.length === 0 ? (
        <EmptyState title="Không có bàn nào để in" />
      ) : (
        <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 print:grid-cols-3 print:gap-3 print:p-0">
          {tables.map((t) => (
            <QrCard key={t.id} table={t} areaName={t.areaName} branchName={branch?.name ?? ''} img={qrs[t.qrToken]} />
          ))}
        </div>
      )}
    </div>
  );
}

function QrCard({ table, areaName, branchName, img }: { table: AdminTable; areaName: string; branchName: string; img?: string }) {
  const short = tableQrUrl(table.qrToken).replace(/^https:\/\//, '');
  return (
    <div className="flex break-inside-avoid flex-col items-center rounded-2xl border-2 border-brand-700 p-4 text-center">
      <span className="text-xs font-semibold tracking-widest text-brand-700 uppercase">Nhà hàng Dạ Lan · {branchName}</span>
      <span className="mt-1 text-2xl font-black text-ink-900">{table.name}</span>
      <span className="text-xs text-ink-500">{areaName}</span>
      {img ? <img src={img} alt={`QR ${table.name}`} className="my-2 aspect-square w-full max-w-[220px]" /> : <div className="my-2 aspect-square w-full max-w-[220px] animate-pulse rounded bg-ink-100" />}
      <span className="text-sm font-semibold text-ink-900">Quét mã để xem thực đơn và gọi món</span>
      <span className="text-[11px] text-ink-500">Scan to view menu &amp; order</span>
      <span className="mt-1 font-mono text-xs break-all text-ink-700">{short}</span>
    </div>
  );
}
