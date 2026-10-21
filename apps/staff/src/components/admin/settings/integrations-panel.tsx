'use client';

import { useQuery } from '@tanstack/react-query';
import { API_URL } from '@/lib/api';
import { useBranchId } from '@/lib/auth-store';
import { usePaymentMethods } from '@/lib/queries-admin';
import { Badge, Loading } from '@/components/ui/primitives';
import { Card, Table } from '../form';

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Tiền mặt',
  BANK_TRANSFER: 'Chuyển khoản VietQR',
  CARD_TERMINAL: 'Máy POS thẻ',
  VNPAY: 'VNPAY',
  MOMO: 'MoMo',
  ZALOPAY: 'ZaloPay',
  APPLE_PAY: 'Apple Pay',
  GOOGLE_PAY: 'Google Pay',
};

/** Các tích hợp cấu hình bằng biến môi trường của máy chủ API (chưa có API quản trị). */
const ENV_INTEGRATIONS: { name: string; env: string; values: string; note: string }[] = [
  { name: 'Cổng thanh toán', env: 'PAYMENT_PROVIDERS', values: 'vietqr, mock, vnpay, momo, zalopay…', note: 'Danh sách cổng bật cho toàn hệ thống; trạng thái thực tế từng cổng xem ở bảng trên.' },
  { name: 'Hóa đơn điện tử', env: 'EINVOICE_PROVIDER', values: 'mock | misa | viettel | vnpt', note: 'Nhà cung cấp hóa đơn điện tử khởi tạo từ máy tính tiền.' },
  { name: 'Tin nhắn Zalo ZNS', env: 'MESSAGING_PROVIDER, ZALO_APP_SECRET', values: 'mock | zalo', note: 'Gửi xác nhận đặt bàn, OTP, nhắc lịch.' },
  { name: 'Lưu trữ tệp (ảnh món, chứng từ)', env: 'STORAGE_PROVIDER, STORAGE_LOCAL_DIR', values: 'local | s3', note: 'Nơi lưu ảnh tải lên từ màn quản trị.' },
];

export function IntegrationsPanel() {
  const branchId = useBranchId();
  const methods = usePaymentMethods(branchId);
  const health = useQuery({
    queryKey: ['admin', 'health'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/health`);
      return (await res.json()) as { status: string; checks: Record<string, string>; time: string };
    },
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-3">
      <Card title="Tình trạng máy chủ">
        {health.isLoading ? (
          <Loading />
        ) : health.isError || !health.data ? (
          <Badge tone="danger">Không kết nối được máy chủ</Badge>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Badge tone={health.data.status === 'ok' ? 'success' : 'danger'}>API: {health.data.status === 'ok' ? 'hoạt động' : health.data.status}</Badge>
            {Object.entries(health.data.checks ?? {}).map(([k, v]) => (
              <Badge key={k} tone={v === 'ok' ? 'success' : 'danger'}>
                {k === 'db' ? 'Cơ sở dữ liệu' : k === 'redis' ? 'Redis' : k}: {v === 'ok' ? 'tốt' : v}
              </Badge>
            ))}
          </div>
        )}
      </Card>

      <Card title="Cổng thanh toán điện tử tại cơ sở">
        {methods.isLoading ? (
          <Loading />
        ) : (methods.data ?? []).length === 0 ? (
          <p className="text-sm text-ink-500">Chưa bật cổng thanh toán điện tử nào (tiền mặt, chuyển khoản VietQR và máy POS thẻ luôn dùng được).</p>
        ) : (
          <Table head={['Phương thức', 'Nhà cung cấp', 'Chế độ']}>
            {(methods.data ?? []).map((m) => (
              <tr key={m.method} className="border-b border-ink-100 last:border-0">
                <td className="px-2 py-2 font-semibold">{METHOD_LABELS[m.method] ?? m.method}</td>
                <td className="px-2 py-2">
                  {m.displayName} <span className="font-mono text-xs text-ink-500">({m.provider})</span>
                </td>
                <td className="px-2 py-2">{m.simulated ? <Badge tone="warning">Giả lập (chưa có khóa thật)</Badge> : <Badge tone="success">Đang chạy thật</Badge>}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title="Tích hợp khác">
        <p className="mb-2 rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-900">
          API hiện chưa có endpoint xem/sửa cấu hình tích hợp. Các tích hợp dưới đây được cấu hình bằng biến môi trường trên máy chủ (tệp <code>.env</code>) và chỉ hiển thị để tham khảo; khóa bí mật không bao giờ hiển thị ở ứng dụng.
        </p>
        <Table head={['Tích hợp', 'Biến môi trường', 'Giá trị hỗ trợ', 'Ghi chú']}>
          {ENV_INTEGRATIONS.map((i) => (
            <tr key={i.env} className="border-b border-ink-100 align-top last:border-0">
              <td className="px-2 py-2 font-semibold">{i.name}</td>
              <td className="px-2 py-2 font-mono text-xs">{i.env}</td>
              <td className="px-2 py-2 text-xs">{i.values}</td>
              <td className="px-2 py-2 text-xs text-ink-500">{i.note}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
