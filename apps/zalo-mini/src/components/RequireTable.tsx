import type { ReactNode } from 'react';
import { Button, useNavigate } from 'zmp-ui';
import { useGuestToken } from '../lib/session-store';
import { PageShell } from './PageShell';
import { EmptyState } from './ui';

/** Trang chỉ dùng khi đã vào bàn (có token khách còn hạn). */
export function RequireTable({ children }: { children: ReactNode }) {
  const token = useGuestToken();
  const navigate = useNavigate();
  if (token) return <>{children}</>;
  return (
    <PageShell title="Gọi món tại bàn">
      <EmptyState
        title="Bạn chưa vào bàn"
        description="Quét mã QR trên bàn để gọi món, gọi nhân viên và xem hóa đơn."
        action={<Button onClick={() => navigate('/table', { replace: true })}>Quét mã QR</Button>}
      />
    </PageShell>
  );
}
