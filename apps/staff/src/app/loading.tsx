/** Màn hình chờ khi chuyển trang (Suspense cấp gốc). */
export default function RootLoading() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas" role="status" aria-live="polite">
      <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-900 text-lg font-extrabold text-gold-100 shadow-brand">
        DL
        <span className="absolute -inset-1.5 animate-spin rounded-[1.1rem] border-2 border-transparent border-t-brand-500" aria-hidden />
      </span>
      <span className="text-sm font-medium text-ink-500">Đang tải DaLan OS...</span>
    </div>
  );
}
