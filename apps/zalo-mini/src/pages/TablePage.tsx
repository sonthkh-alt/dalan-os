import { useEffect, useState } from 'react';
import { Button, Icon, useNavigate } from 'zmp-ui';
import type { BranchMenuItemView } from '@dalan/contracts';
import { CartBar } from '../components/Cart';
import { ItemSheet } from '../components/ItemSheet';
import { MenuBrowser } from '../components/MenuBrowser';
import { PageShell } from '../components/PageShell';
import { TableNav } from '../components/TableNav';
import { Card, EmptyState, Field, Loading, Notice, inputClass, useToast } from '../components/ui';
import { api, ApiError, errorMessage } from '../lib/api';
import { useCart } from '../lib/cart-store';
import { useGuestMenu, useGuestSessionView } from '../lib/queries';
import { useGuestSession, useGuestToken } from '../lib/session-store';
import { extractTableToken } from '../lib/table-token';
import { isInZalo, scanQr } from '../lib/zalo';

/** Gọi món tại bàn. Chưa vào bàn → quét QR / nhập mã; đã vào bàn → thực đơn của bàn + giỏ. */
export function TablePage() {
  const token = useGuestToken();
  return token ? <TableMenu /> : <ScanTable />;
}

function ScanTable() {
  const navigate = useNavigate();
  const toast = useToast((s) => s.show);
  const [manual, setManual] = useState('');

  const go = (content: string | null) => {
    if (!content) return;
    const token = extractTableToken(content);
    if (!token) {
      toast('Mã QR không phải mã bàn của Dạ Lan', 'error');
      return;
    }
    navigate(`/table/join/${encodeURIComponent(token)}`);
  };

  const scan = async () => {
    try {
      go(await scanQr());
    } catch (err) {
      toast(errorMessage(err, 'Không quét được mã QR'), 'error');
    }
  };

  return (
    <PageShell title="Gọi món tại bàn">
      <div className="space-y-4">
        <Card className="text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-maroon-soft text-maroon">
            <Icon icon="zi-qrline" size={32} />
          </div>
          <h2 className="text-lg font-bold">Quét mã QR trên bàn</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Mỗi bàn có một mã QR riêng. Quét để xem thực đơn của cơ sở, gọi món, gọi nhân viên và
            xem hóa đơn.
          </p>
          <Button
            className="mt-4"
            fullWidth
            onClick={() => void scan()}
            prefixIcon={<Icon icon="zi-camera" />}
          >
            Mở camera quét QR
          </Button>
        </Card>
        <Card>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              go(manual);
            }}
          >
            <Field
              label="Hoặc nhập mã bàn / dán đường dẫn"
              hint="Mã in dưới QR, ví dụ: https://…/q/abc123"
            >
              <input
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                className={inputClass}
                autoCapitalize="off"
                autoCorrect="off"
              />
            </Field>
            <Button htmlType="submit" variant="secondary" fullWidth disabled={!manual.trim()}>
              Vào bàn
            </Button>
          </form>
        </Card>
        {!isInZalo() ? (
          <Notice tone="warn">
            Đang chạy trên trình duyệt: camera Zalo không khả dụng, hãy dán mã bàn để thử.
          </Notice>
        ) : null}
      </div>
    </PageShell>
  );
}

function TableMenu() {
  const navigate = useNavigate();
  const toast = useToast((s) => s.show);
  const token = useGuestToken();
  const sessionId = useGuestSession((s) => s.sessionId);
  const clearSession = useGuestSession((s) => s.clear);
  const bindCart = useCart((s) => s.bindSession);
  const menu = useGuestMenu();
  const view = useGuestSessionView();
  const [selected, setSelected] = useState<BranchMenuItemView | null>(null);

  useEffect(() => bindCart(sessionId), [bindCart, sessionId]);

  // Phiên bàn hết hạn hoặc đã đóng → quay lại màn quét
  const expired =
    (menu.error instanceof ApiError && menu.error.status === 401) ||
    (view.error instanceof ApiError && view.error.status === 401) ||
    view.data?.status === 'CLOSED' ||
    view.data?.status === 'CANCELLED';
  useEffect(() => {
    if (expired) {
      clearSession();
      toast('Phiên gọi món đã kết thúc. Cảm ơn quý khách!');
    }
  }, [expired, clearSession, toast]);

  const askStaff = async (item: BranchMenuItemView) => {
    try {
      await api('/guest/service-requests', {
        guestToken: token,
        body: { kind: 'OTHER', note: `Hỏi giá món: ${item.name}`.slice(0, 200) },
      });
    } catch (err) {
      toast(errorMessage(err), 'error');
      throw err;
    }
  };

  return (
    <PageShell title="Gọi món tại bàn">
      <TableNav current="/table" />
      {view.data?.branch.qrOrderMode === 'STAFF_CONFIRM' ? (
        <Notice className="mb-2">
          Món gửi đi sẽ được nhân viên xác nhận trước khi chuyển xuống bếp.
        </Notice>
      ) : null}
      {view.data?.status === 'BILL_REQUESTED' ? (
        <Notice tone="warn" className="mb-2">
          Bàn đã xin tính tiền. Gọi thêm món sẽ được cộng vào hóa đơn.
        </Notice>
      ) : null}
      {menu.isPending ? (
        <Loading label="Đang tải thực đơn..." />
      ) : menu.isError ? (
        <EmptyState
          title="Không tải được thực đơn"
          description={errorMessage(menu.error)}
          action={
            <Button size="small" variant="secondary" onClick={() => void menu.refetch()}>
              Thử lại
            </Button>
          }
        />
      ) : (
        <MenuBrowser view={menu.data} onSelect={(item) => setSelected(item)} />
      )}
      <div className="mt-6 text-center">
        <button
          type="button"
          className="text-sm text-ink-muted underline"
          onClick={() => navigate('/table/orders')}
        >
          Cần hỗ trợ? Gọi nhân viên
        </button>
      </div>
      <ItemSheet item={selected} onClose={() => setSelected(null)} onAskStaff={askStaff} />
      <CartBar />
    </PageShell>
  );
}
