import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Icon, useNavigate } from 'zmp-ui';
import type { CustomerLoginResult } from '@dalan/contracts';
import { PageShell } from '../components/PageShell';
import { ReservationStatusBadge } from '../components/StatusBadge';
import { Card, Field, Loading, Notice, SectionTitle, inputClass, useToast } from '../components/ui';
import { api, ApiError, errorMessage, isMissingEndpoint } from '../lib/api';
import { useCustomer } from '../lib/customer-store';
import { formatDate, formatDateTime, formatVnd } from '../lib/format';
import { useCustomerMe, useMyReservations, type CustomerMe } from '../lib/queries';
import { isInZalo, zaloAuthorize } from '../lib/zalo';

export function AccountPage() {
  const loggedIn = useCustomer((s) => !!s.accessToken);
  return <PageShell title="Tài khoản">{loggedIn ? <Profile /> : <Login />}</PageShell>;
}

function Login() {
  const toast = useToast((s) => s.show);
  const signIn = useCustomer((s) => s.signIn);
  const inZalo = isInZalo();
  const [devPhone, setDevPhone] = useState('0912000009');
  const [devName, setDevName] = useState('Khách thử Zalo');
  const [needPhone, setNeedPhone] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const login = useMutation({
    mutationFn: async () => {
      const auth = await zaloAuthorize({ askPhone: true, devPhone, devName });
      return api<CustomerLoginResult>('/auth/customer/zalo', {
        body: { accessToken: auth.accessToken, phoneToken: auth.phoneToken },
      });
    },
    onSuccess: (r) => {
      signIn({
        accessToken: r.accessToken,
        refreshToken: r.refreshToken,
        profile: {
          id: r.customer.id,
          phone: r.customer.phone,
          fullName: r.customer.fullName,
          avatarUrl: r.customer.avatarUrl ?? null,
          zaloUserId: r.customer.zaloUserId ?? null,
        },
      });
      toast(r.customer.isNew ? 'Chào mừng thành viên mới của Dạ Lan!' : 'Đăng nhập thành công');
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'ZALO_PHONE_REQUIRED') setNeedPhone(true);
      else if (isMissingEndpoint(err)) setUnavailable(true);
      else toast(errorMessage(err, 'Đăng nhập Zalo chưa thành công'), 'error');
    },
  });

  return (
    <div className="space-y-4">
      <Card className="border-0 bg-maroon text-cream">
        <h2 className="text-xl font-bold">Thành viên Dạ Lan</h2>
        <p className="mt-1 text-sm text-cream/85">
          Tích điểm mỗi lần dùng bữa, nhận voucher sinh nhật, xem lịch sử hóa đơn và đặt bàn nhanh
          hơn.
        </p>
      </Card>

      {needPhone ? (
        <Notice tone="warn">
          Lần đầu đăng nhập, Dạ Lan cần số điện thoại Zalo để tạo thẻ thành viên. Vui lòng bấm “Cho
          phép” khi Zalo hỏi chia sẻ số điện thoại.
        </Notice>
      ) : null}
      {unavailable ? (
        <Notice tone="warn">
          Đăng nhập bằng Zalo đang được hoàn thiện. Bạn vẫn có thể xem thực đơn, đặt bàn và gọi món
          tại bàn.
        </Notice>
      ) : null}

      {!inZalo ? (
        <Card>
          <p className="mb-3 text-sm font-semibold text-warn">
            Chế độ thử trên trình duyệt (API chạy MESSAGING_PROVIDER=mock)
          </p>
          <div className="space-y-3">
            <Field label="Số điện thoại giả lập">
              <input
                type="tel"
                value={devPhone}
                onChange={(e) => setDevPhone(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Tên Zalo giả lập">
              <input
                value={devName}
                onChange={(e) => setDevName(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
        </Card>
      ) : null}

      <Button
        fullWidth
        onClick={() => login.mutate()}
        loading={login.isPending}
        prefixIcon={<Icon icon="zi-user-circle" />}
      >
        Đăng nhập bằng Zalo
      </Button>
      <p className="text-center text-xs text-ink-muted">
        Bằng việc đăng nhập, bạn đồng ý cho Dạ Lan sử dụng tên, ảnh đại diện và số điện thoại Zalo
        để quản lý thẻ thành viên theo Nghị định 13/2023/NĐ-CP.
      </p>
    </div>
  );
}

function voucherLabel(v: CustomerMe['vouchers'][number]): string {
  const value = Number(v.value);
  if (v.kind === 'PERCENT')
    return `Giảm ${value}%${v.maxDiscount ? ` (tối đa ${formatVnd(Number(v.maxDiscount))})` : ''}`;
  if (v.kind === 'AMOUNT') return `Giảm ${formatVnd(value)}`;
  return 'Tặng món';
}

function Profile() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile, refreshToken, signOut } = useCustomer();
  const me = useCustomerMe();
  const reservations = useMyReservations();

  const logout = () => {
    if (refreshToken) void api('/auth/logout', { body: { refreshToken } }).catch(() => undefined);
    signOut();
    queryClient.removeQueries({ queryKey: ['customer-me'] });
    queryClient.removeQueries({ queryKey: ['my-reservations'] });
  };

  const data = me.data;
  const name = data?.fullName ?? profile?.fullName ?? 'Quý khách';
  const phone = (data?.phone ?? profile?.phone ?? '').replace(/^\+84/, '0');

  return (
    <div className="space-y-4">
      <Card className="flex items-center gap-3 border-0 bg-maroon text-cream">
        {profile?.avatarUrl ? (
          <img
            src={profile.avatarUrl}
            alt=""
            className="h-14 w-14 rounded-full border-2 border-cream/40 object-cover"
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-cream/15 text-2xl font-bold">
            {name.slice(0, 1)}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-lg font-bold">{name}</p>
          <p className="text-sm text-cream/80">{phone}</p>
        </div>
      </Card>

      {me.isPending ? (
        <Loading />
      ) : me.isError ? (
        <Notice tone="error">
          {errorMessage(me.error, 'Không tải được thông tin thành viên')}
        </Notice>
      ) : data === null ? (
        <Notice tone="warn">Thông tin điểm và voucher đang được hoàn thiện.</Notice>
      ) : data ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Điểm" value={data.pointsBalance.toLocaleString('vi-VN')} />
            <Stat label="Hạng" value={data.tier?.name ?? 'Thành viên'} />
            <Stat label="Lần ghé" value={String(data.visitCount)} />
          </div>

          <Card>
            <SectionTitle>Voucher của tôi</SectionTitle>
            {data.vouchers.length === 0 ? (
              <p className="text-sm text-ink-muted">
                Chưa có voucher. Dạ Lan sẽ gửi tặng vào dịp sinh nhật và các chương trình ưu đãi.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.vouchers.map((v) => (
                  <li
                    key={v.id}
                    className="flex items-center justify-between rounded-xl border border-dashed border-maroon/40 bg-maroon-soft/50 px-3 py-2"
                  >
                    <div>
                      <p className="font-semibold text-maroon">{voucherLabel(v)}</p>
                      <p className="text-xs text-ink-soft">
                        {v.minBill ? `Hóa đơn từ ${formatVnd(Number(v.minBill))} · ` : ''}
                        {v.validTo ? `HSD ${formatDate(v.validTo)}` : 'Không thời hạn'}
                      </p>
                    </div>
                    <span className="font-mono text-sm font-bold">{v.code}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <SectionTitle>Lịch sử dùng bữa</SectionTitle>
            {data.bills.length === 0 ? (
              <p className="text-sm text-ink-muted">Chưa có hóa đơn nào gắn với tài khoản.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {data.bills.map((b) => (
                  <li key={b.id} className="flex items-center justify-between py-2">
                    <span>
                      <span className="font-medium">{b.branch.name}</span>
                      <span className="block text-xs text-ink-muted">
                        {b.code}
                        {b.closedAt ? ` · ${formatDate(b.closedAt)}` : ''}
                      </span>
                    </span>
                    <span className="font-semibold text-maroon">{formatVnd(Number(b.total))}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {data.pointsTx.length > 0 ? (
            <Card>
              <SectionTitle>Biến động điểm</SectionTitle>
              <ul className="divide-y divide-line text-sm">
                {data.pointsTx.slice(0, 10).map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2">
                    <span>
                      {p.reason ?? (p.points >= 0 ? 'Tích điểm' : 'Dùng điểm')}
                      <span className="block text-xs text-ink-muted">
                        {formatDate(p.createdAt)}
                      </span>
                    </span>
                    <span
                      className={
                        p.points >= 0 ? 'font-semibold text-success' : 'font-semibold text-danger'
                      }
                    >
                      {p.points >= 0 ? '+' : ''}
                      {p.points.toLocaleString('vi-VN')}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      ) : null}

      <Card>
        <SectionTitle
          action={
            <button
              type="button"
              className="text-sm font-semibold text-maroon"
              onClick={() => navigate('/reserve')}
            >
              Đặt bàn mới
            </button>
          }
        >
          Đặt bàn của tôi
        </SectionTitle>
        {reservations.isPending ? (
          <p className="text-sm text-ink-muted">Đang tải...</p>
        ) : reservations.data === null ? (
          <p className="text-sm text-ink-muted">Đang được hoàn thiện.</p>
        ) : !reservations.data || reservations.data.length === 0 ? (
          <p className="text-sm text-ink-muted">Chưa có đặt bàn nào.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {reservations.data.slice(0, 10).map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="font-medium">{r.branch?.name ?? 'Dạ Lan'}</span>
                  <span className="block text-xs text-ink-muted">
                    {formatDateTime(r.reservedAt)} · {r.partySize} khách · {r.code}
                  </span>
                </span>
                <ReservationStatusBadge status={r.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card onClick={() => navigate('/banquet')} className="flex items-center justify-between">
        <span>
          <span className="block font-semibold">Đặt tiệc cưới, sự kiện</span>
          <span className="text-sm text-ink-soft">
            Gửi yêu cầu, nhân viên kinh doanh sẽ gọi lại tư vấn
          </span>
        </span>
        <Icon icon="zi-chevron-right" />
      </Card>

      <Button variant="tertiary" fullWidth onClick={logout}>
        Đăng xuất
      </Button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-3 text-center">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="mt-0.5 truncate text-lg font-bold text-maroon">{value}</p>
    </Card>
  );
}
