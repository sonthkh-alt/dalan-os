import { useState } from 'react';
import { Button, useNavigate, useParams } from 'zmp-ui';
import type { BranchMenuItemView } from '@dalan/contracts';
import { ItemSheet } from '../components/ItemSheet';
import { MenuBrowser } from '../components/MenuBrowser';
import { PageShell } from '../components/PageShell';
import { Card, Chip, EmptyState, Loading, Notice } from '../components/ui';
import { isMissingEndpoint } from '../lib/api';
import { BRANCHES, findBranch } from '../lib/branches';
import { usePublicMenu } from '../lib/queries';

/** Chọn cơ sở để xem thực đơn. */
export function MenuIndexPage() {
  const navigate = useNavigate();
  return (
    <PageShell title="Thực đơn">
      <p className="mb-3 text-sm text-ink-soft">Chọn cơ sở để xem thực đơn và giá hôm nay.</p>
      <div className="space-y-3">
        {BRANCHES.map((b) => (
          <Card key={b.code} onClick={() => navigate(`/menu/${b.code}`)}>
            <h3 className="text-base font-bold text-ink">{b.name}</h3>
            <p className="mt-0.5 text-sm text-ink-soft">{b.address}</p>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}

/** Thực đơn công khai của một cơ sở (chỉ xem; gọi món cần quét QR tại bàn). */
export function MenuPage() {
  const { branchCode = 'CENTER' } = useParams();
  const navigate = useNavigate();
  const code = branchCode.toUpperCase();
  const branch = findBranch(code);
  const menu = usePublicMenu(code);
  const [selected, setSelected] = useState<BranchMenuItemView | null>(null);

  return (
    <PageShell title={branch?.name ?? 'Thực đơn'} back>
      <div className="no-scrollbar -mx-4 -mt-1 mb-2 flex gap-2 overflow-x-auto px-4">
        {BRANCHES.map((b) => (
          <Chip
            key={b.code}
            active={b.code === code}
            onClick={() => navigate(`/menu/${b.code}`, { replace: true, animate: false })}
          >
            {b.name.replace('Dạ Lan ', '')}
          </Chip>
        ))}
      </div>
      {menu.isPending ? (
        <Loading label="Đang tải thực đơn..." />
      ) : menu.isError ? (
        isMissingEndpoint(menu.error) ? (
          <EmptyState
            title="Chưa có thực đơn online cho cơ sở này"
            description="Vui lòng xem thực đơn tại nhà hàng hoặc gọi điện để được tư vấn."
          />
        ) : (
          <EmptyState
            title="Không tải được thực đơn"
            description="Vui lòng kiểm tra kết nối mạng."
            action={
              <Button size="small" variant="secondary" onClick={() => void menu.refetch()}>
                Thử lại
              </Button>
            }
          />
        )
      ) : (
        <>
          <Notice className="mb-1">
            Giá đã gồm VAT, có thể thay đổi theo mùa. Quét mã QR trên bàn để gọi món.
          </Notice>
          <MenuBrowser view={menu.data} onSelect={(item) => setSelected(item)} />
        </>
      )}
      <ItemSheet item={selected} onClose={() => setSelected(null)} viewOnly />
    </PageShell>
  );
}
