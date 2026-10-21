/** Khung xương khi đang tải (thay cho vòng quay trơn). */
export function MenuSkeleton() {
  return (
    <div aria-hidden className="pt-2">
      <div className="skeleton h-12 rounded-full" />
      <div className="mt-3 flex gap-2">
        {[64, 88, 72, 96].map((w) => (
          <div key={w} className="skeleton h-9 rounded-full" style={{ width: w }} />
        ))}
      </div>
      <div className="mt-5 flex gap-3 overflow-hidden">
        {[0, 1, 2].map((i) => (
          <div key={i} className="w-40 shrink-0">
            <div className="skeleton aspect-[4/3] rounded-3xl" />
            <div className="skeleton mt-2 h-4 w-3/4 rounded" />
          </div>
        ))}
      </div>
      <ListSkeleton rows={4} />
    </div>
  );
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-hidden className="mt-5 space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-3 rounded-3xl bg-paper p-3 ring-1 ring-line-soft">
          <div className="flex-1 space-y-2 py-1">
            <div className="skeleton h-4 w-2/3 rounded" />
            <div className="skeleton h-3 w-full rounded" />
            <div className="skeleton h-3 w-1/2 rounded" />
          </div>
          <div className="skeleton h-24 w-24 rounded-2xl" />
        </div>
      ))}
    </div>
  );
}
