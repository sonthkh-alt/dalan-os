'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Crumb {
  label: ReactNode;
  href?: string;
}

export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Đường dẫn quay lại; `true` = trang trước trong lịch sử (về '/' nếu mở trực tiếp). */
  back?: string | true;
  actions?: ReactNode;
  className?: string;
  /** Đường dẫn phân cấp phía trên tiêu đề, ví dụ Quản trị / Thực đơn (tùy chọn). */
  breadcrumb?: Crumb[];
}

const backClass =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-ink-700 shadow-card ring-1 ring-ink-900/[0.08] transition hover:bg-ink-50 hover:text-ink-900 active:scale-95';

/** Tiêu đề trang thống nhất: nút quay lại, đường dẫn phân cấp, tiêu đề, phụ đề, thao tác bên phải. */
export function PageHeader({ title, subtitle, back, actions, className, breadcrumb }: PageHeaderProps) {
  const router = useRouter();
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3 md:px-5 md:py-4', className)}>
      {typeof back === 'string' && (
        <Link href={back} className={backClass} aria-label="Quay lại">
          <ChevronLeft className="h-6 w-6" />
        </Link>
      )}
      {back === true && (
        <button type="button" onClick={() => (window.history.length > 1 ? router.back() : router.push('/'))} className={backClass} aria-label="Quay lại">
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      <div className="min-w-0 flex-1 basis-48">
        {breadcrumb && breadcrumb.length > 0 && (
          <nav aria-label="Đường dẫn" className="mb-0.5 flex min-w-0 items-center gap-1 text-xs font-medium text-ink-500">
            {breadcrumb.map((c, i) => (
              <Fragment key={i}>
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-300" aria-hidden />}
                {c.href ? (
                  <Link href={c.href} className="truncate rounded hover:text-brand-700 hover:underline">
                    {c.label}
                  </Link>
                ) : (
                  <span className="truncate">{c.label}</span>
                )}
              </Fragment>
            ))}
          </nav>
        )}
        <h1 className="truncate text-xl font-bold tracking-tight text-ink-900 md:text-2xl">{title}</h1>
        {subtitle && <div className="truncate text-sm text-ink-500">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
