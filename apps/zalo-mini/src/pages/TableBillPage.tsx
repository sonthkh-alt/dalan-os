import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from 'zmp-ui';
import type { PaymentIntentView } from '@dalan/contracts';
import { PageShell } from '../components/PageShell';
import { RequireTable } from '../components/RequireTable';
import { BillStatusBadge } from '../components/StatusBadge';
import { TableNav } from '../components/TableNav';
import { Card, Loading, Notice, SectionTitle, useToast } from '../components/ui';
import { api, ApiError, errorMessage, isMissingEndpoint, newIdempotencyKey } from '../lib/api';
import { formatVnd } from '../lib/format';
import { useGuestSessionView } from '../lib/queries';
import { useGuestToken } from '../lib/session-store';
import { openUrl } from '../lib/zalo';

interface BillDetail {
  id: string;
  code: string;
  status: string;
  total: number;
  paidTotal: number;
  due: number;
  branch: {
    name: string;
    bankBin: string | null;
    bankAccountNo: string | null;
    bankAccountName: string | null;
    priceIncludesVat: boolean;
  };
}

export function TableBillPage() {
  return (
    <RequireTable>
      <Bill />
    </RequireTable>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between py-1 ${strong ? 'text-lg font-bold text-maroon' : 'text-sm'}`}
    >
      <span className={strong ? '' : 'text-ink-soft'}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Bill() {
  const token = useGuestToken();
  const toast = useToast((s) => s.show);
  const queryClient = useQueryClient();
  const view = useGuestSessionView();
  const openBill =
    view.data?.bills.find((b) => b.status === 'OPEN' || b.status === 'PARTIALLY_PAID') ?? null;

  const detail = useQuery({
    queryKey: ['bill', openBill?.id, token],
    queryFn: () => api<BillDetail>(`/bills/${openBill!.id}`, { guestToken: token }),
    enabled: !!openBill && !!token,
    refetchInterval: 15_000,
  });

  const requestBill = useMutation({
    mutationFn: () => api('/guest/service-requests', { guestToken: token, body: { kind: 'BILL' } }),
    onSuccess: () => {
      toast('Đã báo nhân viên tính tiền');
      void queryClient.invalidateQueries({ queryKey: ['guest-session'] });
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });

  const pay = useMutation({
    mutationFn: () =>
      api<PaymentIntentView>(`/bills/${openBill!.id}/payment-intents`, {
        guestToken: token,
        idempotencyKey: newIdempotencyKey(),
        body: { method: 'ZALOPAY', channel: 'mini_app' },
      }),
    onSuccess: (intent) => {
      const url = intent.redirectUrl ?? intent.deeplink;
      if (url) void openUrl(url);
      else toast('Đã tạo yêu cầu thanh toán, vui lòng làm theo hướng dẫn của nhân viên');
    },
    onError: (err) => {
      if (
        isMissingEndpoint(err) ||
        (err instanceof ApiError && (err.status === 503 || err.code === 'PROVIDER_NOT_CONFIGURED'))
      ) {
        toast('Thanh toán online chưa mở, vui lòng gọi nhân viên thanh toán', 'error');
      } else toast(errorMessage(err), 'error');
    },
  });

  if (view.isPending) {
    return (
      <PageShell title="Hóa đơn">
        <TableNav current="/table/bill" />
        <Loading />
      </PageShell>
    );
  }
  const data = view.data;
  const t = data?.totals;
  const vatIncluded = data?.branch.priceIncludesVat ?? true;

  return (
    <PageShell title="Hóa đơn">
      <TableNav current="/table/bill" />
      {data && t ? (
        <div className="space-y-4">
          <Card>
            <SectionTitle>{openBill ? `Bill ${openBill.code}` : 'Tạm tính'}</SectionTitle>
            <Row label="Tổng món" value={formatVnd(t.subtotal)} />
            {t.lineDiscountTotal + t.billDiscountTotal > 0 ? (
              <Row
                label="Giảm giá"
                value={`−${formatVnd(t.lineDiscountTotal + t.billDiscountTotal)}`}
              />
            ) : null}
            {t.minSpendSurcharge > 0 ? (
              <Row
                label="Phụ thu chi tiêu tối thiểu phòng"
                value={formatVnd(t.minSpendSurcharge)}
              />
            ) : null}
            {t.serviceChargeAmount > 0 ? (
              <Row
                label={`Phí phục vụ (${t.serviceChargeBps / 100}%)`}
                value={formatVnd(t.serviceChargeAmount)}
              />
            ) : null}
            {t.vatAmount > 0 ? (
              <Row label={vatIncluded ? 'VAT (đã gồm)' : 'VAT'} value={formatVnd(t.vatAmount)} />
            ) : null}
            <div className="mt-1 border-t border-line pt-1">
              <Row label="Tổng phải trả" value={formatVnd(detail.data?.total ?? t.total)} strong />
              {detail.data && detail.data.paidTotal > 0 ? (
                <>
                  <Row label="Đã trả" value={formatVnd(detail.data.paidTotal)} />
                  <Row label="Còn phải trả" value={formatVnd(detail.data.due)} />
                </>
              ) : null}
            </div>
            {openBill ? (
              <div className="mt-2">
                <BillStatusBadge status={openBill.status} />
              </div>
            ) : null}
          </Card>

          {data.bills.filter((b) => b.status === 'PAID').length > 0 && !openBill ? (
            <Notice tone="success">Bàn đã thanh toán xong. Cảm ơn quý khách, hẹn gặp lại!</Notice>
          ) : null}

          {openBill ? (
            <Card>
              <SectionTitle>Thanh toán</SectionTitle>
              {detail.data?.branch.bankAccountNo ? (
                <div className="mb-3 rounded-xl bg-cream-dark p-3 text-sm">
                  <p className="font-semibold">Chuyển khoản VietQR</p>
                  <p className="mt-1">
                    Số tài khoản:{' '}
                    <span className="font-mono font-semibold">
                      {detail.data.branch.bankAccountNo}
                    </span>
                  </p>
                  {detail.data.branch.bankAccountName ? (
                    <p>Chủ tài khoản: {detail.data.branch.bankAccountName}</p>
                  ) : null}
                  <p>
                    Nội dung: <span className="font-mono font-semibold">{openBill.code}</span>
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    Thu ngân sẽ đối soát tự động khi nhận được tiền.
                  </p>
                </div>
              ) : null}
              <div className="space-y-2">
                <Button fullWidth onClick={() => pay.mutate()} loading={pay.isPending}>
                  Thanh toán bằng ZaloPay
                </Button>
                <p className="text-center text-xs text-ink-muted">
                  Hoặc gọi nhân viên để trả tiền mặt, thẻ, Apple Pay.
                </p>
              </div>
            </Card>
          ) : (
            <Card>
              <p className="text-sm text-ink-soft">
                Khi dùng bữa xong, bấm nút dưới đây để nhân viên mang hóa đơn tới bàn.
              </p>
              <Button
                className="mt-3"
                fullWidth
                onClick={() => requestBill.mutate()}
                loading={requestBill.isPending}
                disabled={data.status === 'BILL_REQUESTED'}
              >
                {data.status === 'BILL_REQUESTED' ? 'Đã báo tính tiền' : 'Xin tính tiền'}
              </Button>
            </Card>
          )}
        </div>
      ) : (
        <Notice tone="warn">Chưa tải được hóa đơn. Vui lòng thử lại sau ít phút.</Notice>
      )}
    </PageShell>
  );
}
