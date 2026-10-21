import type { ReactNode } from 'react';
import { href, type Route } from '../router';
import { COMPANY, EMAIL, HEAD_OFFICE, PRICE_DATE, REPO_URL, SLOGAN } from '../data/restaurant';
import { OrchidMark } from './Ornament';

const NAV: { key: Route['name']; label: string; to: string }[] = [
  { key: 'home', label: 'Trang chủ', to: href.home },
  { key: 'menu', label: 'Thực đơn', to: href.menu('center') },
  { key: 'system', label: 'DaLan OS', to: href.system },
];

export function Header({ active }: { active: Route['name'] }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-cream/95 backdrop-blur supports-[backdrop-filter]:bg-cream/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
        <a
          href={href.home}
          className="flex min-w-0 items-center gap-2 text-maroon"
          aria-label="Nhà hàng Dạ Lan, về trang chủ"
        >
          <OrchidMark className="h-7 w-7 shrink-0" />
          <span className="truncate font-display text-xl font-bold tracking-tight">Dạ Lan</span>
        </a>
        <nav aria-label="Điều hướng chính">
          <ul className="flex items-center gap-1 text-sm font-medium">
            {NAV.map((n) => {
              const isActive = active === n.key;
              return (
                <li key={n.key} className={n.key === 'home' ? 'hidden sm:block' : undefined}>
                  <a
                    href={n.to}
                    aria-current={isActive ? 'page' : undefined}
                    className={`rounded-full px-3 py-1.5 transition-colors ${
                      isActive
                        ? 'bg-maroon text-white'
                        : 'text-ink-soft hover:bg-maroon-soft hover:text-maroon'
                    }`}
                  >
                    {n.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-16 bg-maroon-dark text-cream">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
        <div>
          <div className="flex items-center gap-2">
            <OrchidMark className="h-8 w-8 text-gold-soft" />
            <span className="font-display text-2xl font-bold">Dạ Lan</span>
          </div>
          <p className="mt-2 font-display italic text-gold-soft">{SLOGAN}</p>
          <p className="mt-3 text-sm text-cream/80">{COMPANY}</p>
          <p className="text-sm text-cream/80">{HEAD_OFFICE}</p>
          <p className="text-sm">
            <a
              className="underline decoration-cream/40 underline-offset-2 hover:decoration-cream"
              href={`mailto:${EMAIL}`}
            >
              {EMAIL}
            </a>
          </p>
        </div>
        <div className="text-sm text-cream/85">
          <h2 className="mb-2 font-semibold text-cream">Về trang này</h2>
          <p>
            Đây là trang giới thiệu tĩnh, chạy hoàn toàn trên trình duyệt. Giá món được lấy từ ảnh
            thực đơn trên website nhà hàng ngày {PRICE_DATE} và có thể thay đổi; vui lòng gọi cơ sở
            để xác nhận.
          </p>
        </div>
        <div className="text-sm text-cream/85">
          <h2 className="mb-2 font-semibold text-cream">Mã nguồn</h2>
          <p>
            Hệ thống DaLan OS là mã nguồn mở trên GitHub, gồm API, ứng dụng nhân viên, ứng dụng
            khách, Zalo Mini App và cầu in.
          </p>
          <a
            href={REPO_URL}
            className="mt-2 inline-block font-medium text-gold-soft underline underline-offset-2"
            target="_blank"
            rel="noreferrer"
          >
            github.com/sonthkh-alt/dalan-os
          </a>
        </div>
      </div>
    </footer>
  );
}

export function Section({
  id,
  eyebrow,
  title,
  children,
  className = '',
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={`mx-auto max-w-6xl px-4 pt-14 ${className}`}
      aria-labelledby={id ? `${id}-title` : undefined}
    >
      {eyebrow && (
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-dark">{eyebrow}</p>
      )}
      <h2
        id={id ? `${id}-title` : undefined}
        className="mt-1 font-display text-3xl font-bold text-ink sm:text-4xl"
      >
        {title}
      </h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}
