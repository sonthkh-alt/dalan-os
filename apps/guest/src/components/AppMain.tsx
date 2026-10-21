'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { hideBottomNav } from '@/lib/nav';
import { cn } from '@/lib/format';

/** Khung nội dung chính: chừa chỗ cho thanh điều hướng dưới (nếu có). */
export function AppMain({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <main className={cn('mx-auto w-full max-w-lg px-4 pt-2 md:max-w-2xl', hideBottomNav(pathname) ? 'page-pad-bare' : 'page-pad-nav')}>{children}</main>;
}
