'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useNavHistory } from '@/lib/nav';

/** Theo dõi điều hướng nội bộ (để nút Quay lại không thoát khỏi app). */
export function NavTracker() {
  const pathname = usePathname();
  const record = useNavHistory((s) => s.record);
  useEffect(() => {
    record(pathname);
  }, [pathname, record]);
  return null;
}
