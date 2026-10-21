'use client';

import { useEffect } from 'react';
import { DeadEnd } from '@/components/shell/dead-end';

/** Ranh giới lỗi cấp ứng dụng: luôn cho thử lại hoặc về sơ đồ bàn, không để màn hình trắng. */
export default function AppError({ error, retry, reset }: { error: unknown; retry?: () => void; reset?: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
  const message = error instanceof Error && process.env.NODE_ENV !== 'production' ? error.message : null;
  return (
    <DeadEnd
      code="Đã xảy ra lỗi"
      title="Màn hình này gặp sự cố"
      message="Dữ liệu đã nhập và lệnh chờ gửi vẫn được giữ trên máy. Hãy thử lại; nếu vẫn lỗi, quay về sơ đồ bàn và báo quản lý."
      onRetry={retry ?? reset}
      detail={
        message || digest ? (
          <p className="mx-auto mt-3 max-w-sm rounded-xl bg-ink-50 px-3 py-2 font-mono text-xs break-words text-ink-500">
            {message}
            {digest ? ` · Mã lỗi: ${digest}` : ''}
          </p>
        ) : null
      }
    />
  );
}
