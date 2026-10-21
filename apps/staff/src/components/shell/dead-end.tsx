'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { ArrowLeft, CalendarClock, ChefHat, LayoutGrid, RotateCcw, Bell } from 'lucide-react';

/** Trang “ngõ cụt” có thương hiệu (404, lỗi): luôn có đường về sơ đồ bàn, quay lại, thử lại. */
export function DeadEnd({ code, title, message, onRetry, detail }: { code: string; title: string; message: ReactNode; onRetry?: () => void; detail?: ReactNode }) {
  const router = useRouter();
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-canvas px-4 py-10">
      {/* Họa tiết nền mềm */}
      <div className="pointer-events-none absolute -top-40 -right-40 h-[28rem] w-[28rem] rounded-full bg-brand-100/60 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-40 -left-40 h-[24rem] w-[24rem] rounded-full bg-gold-100/80 blur-3xl" aria-hidden />
      <div className="animate-dialog-in relative w-full max-w-lg rounded-3xl bg-white p-6 text-center shadow-raised ring-1 ring-ink-900/[0.06] sm:p-8">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-900 text-lg font-extrabold text-gold-100 shadow-brand">DL</span>
        <p className="text-sm font-bold tracking-[0.2em] text-brand-700 uppercase">{code}</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-ink-900">{title}</h1>
        <div className="mx-auto mt-2 max-w-sm text-ink-500">{message}</div>
        {detail}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          {onRetry && (
            <button type="button" onClick={onRetry} className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-brand-700 px-5 font-semibold text-white shadow-brand transition hover:bg-brand-800 active:scale-[0.98]">
              <RotateCcw className="h-5 w-5" /> Thử lại
            </button>
          )}
          <Link href="/" className={onRetry ? secondaryCls : primaryCls}>
            <LayoutGrid className="h-5 w-5" /> Về sơ đồ bàn
          </Link>
          <button type="button" onClick={() => (window.history.length > 1 ? router.back() : router.push('/'))} className={secondaryCls}>
            <ArrowLeft className="h-5 w-5" /> Quay lại
          </button>
        </div>
        <div className="mt-6 border-t border-ink-100 pt-4">
          <p className="mb-2 text-xs font-semibold tracking-wider text-ink-500 uppercase">Đi nhanh tới</p>
          <div className="flex flex-wrap justify-center gap-2">
            <QuickLink href="/kds" icon={<ChefHat className="h-4 w-4" />}>
              Bếp
            </QuickLink>
            <QuickLink href="/reservations" icon={<CalendarClock className="h-4 w-4" />}>
              Đặt bàn
            </QuickLink>
            <QuickLink href="/requests" icon={<Bell className="h-4 w-4" />}>
              Yêu cầu
            </QuickLink>
          </div>
        </div>
      </div>
    </div>
  );
}

const primaryCls = 'inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-brand-700 px-5 font-semibold text-white shadow-brand transition hover:bg-brand-800 active:scale-[0.98]';
const secondaryCls = 'inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-white px-5 font-semibold text-ink-900 shadow-card ring-1 ring-ink-200 ring-inset transition hover:bg-ink-50 active:scale-[0.98]';
const chipCls = 'inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-ink-900/[0.04] px-3.5 text-sm font-semibold text-ink-700 ring-1 ring-ink-900/[0.06] ring-inset transition hover:bg-ink-900/[0.08]';

function QuickLink({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Link href={href} className={chipCls}>
      {icon} {children}
    </Link>
  );
}
