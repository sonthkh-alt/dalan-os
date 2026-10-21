/** Màn chờ chung khi chuyển trang. */
export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-28" role="status" aria-live="polite">
      <span className="relative flex h-16 w-16 items-center justify-center">
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-gold-light/30 border-t-maroon" />
        <span className="font-serif text-lg font-bold text-maroon">DL</span>
      </span>
      <span className="sr-only">Đang tải…</span>
    </div>
  );
}
