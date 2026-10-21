import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, useNavigate, useParams } from 'zmp-ui';
import { PageShell } from '../components/PageShell';
import { Card, EmptyState, Field, Loading, inputClass, useToast } from '../components/ui';
import { api, ApiError, errorMessage } from '../lib/api';
import { useCart } from '../lib/cart-store';
import { useCustomer } from '../lib/customer-store';
import { useGuestSession, type GuestBranch, type GuestTable } from '../lib/session-store';

interface LandingData {
  branch: GuestBranch;
  table: GuestTable;
  session: {
    id: string;
    code: string;
    status: string;
    guestCount: number;
    participants: number;
    requiresPin: boolean;
  } | null;
}

interface JoinResult {
  guestToken: string;
  session: { id: string; code: string; status: string; guestCount: number; joinPin: string | null };
  participant: { id: string; nickname: string | null };
  branch: GuestBranch;
  table: GuestTable;
}

/** Vào bàn từ mã QR (deep link hoặc quét trong app): xem bàn, nhập tên gọi, số khách, mã PIN nếu cần. */
export function JoinTablePage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast((s) => s.show);
  const setSession = useGuestSession((s) => s.setSession);
  const bindCart = useCart((s) => s.bindSession);
  const profileName = useCustomer((s) => s.profile?.fullName);
  const [nickname, setNickname] = useState(profileName ?? '');
  const [pin, setPin] = useState('');
  const [guestCount, setGuestCount] = useState(2);

  const landing = useQuery({
    queryKey: ['qr-landing', token],
    queryFn: () => api<LandingData>(`/q/${encodeURIComponent(token)}`, { absolute: true }),
    enabled: !!token,
    retry: false,
  });

  const join = useMutation({
    mutationFn: () =>
      api<JoinResult>(`/q/${encodeURIComponent(token)}/join`, {
        absolute: true,
        body: {
          nickname: nickname.trim() || undefined,
          joinPin: pin || undefined,
          guestCount: landing.data?.session ? undefined : guestCount,
          locale: 'vi',
        },
      }),
    onSuccess: (r) => {
      setSession({
        qrToken: token,
        guestToken: r.guestToken,
        sessionId: r.session.id,
        sessionCode: r.session.code,
        participantId: r.participant.id,
        nickname: r.participant.nickname,
        joinPin: r.session.joinPin,
        branch: r.branch,
        table: r.table,
      });
      bindCart(r.session.id);
      toast(
        r.session.joinPin
          ? `Đã vào bàn. Mã PIN mời bạn cùng bàn: ${r.session.joinPin}`
          : 'Đã vào bàn, mời quý khách gọi món',
      );
      navigate('/table', { replace: true });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 403)
        toast('Mã PIN chưa đúng, hỏi người đã vào bàn trước', 'error');
      else toast(errorMessage(err), 'error');
    },
  });

  if (landing.isPending) {
    return (
      <PageShell title="Vào bàn" back>
        <Loading label="Đang đọc mã bàn..." />
      </PageShell>
    );
  }
  if (landing.isError || !landing.data) {
    return (
      <PageShell title="Vào bàn" back>
        <EmptyState
          title="Không tìm thấy bàn"
          description="Mã QR không hợp lệ hoặc đã được thay. Vui lòng quét lại mã trên bàn hoặc gọi nhân viên."
          action={
            <Button
              size="small"
              variant="secondary"
              onClick={() => navigate('/table', { replace: true })}
            >
              Quét lại
            </Button>
          }
        />
      </PageShell>
    );
  }

  const { branch, table, session } = landing.data;
  const needPin = !!session && branch.guestJoinMode === 'PIN' && session.participants > 0;

  return (
    <PageShell title="Vào bàn" back>
      <div className="space-y-4">
        <Card className="border-0 bg-maroon text-cream">
          <p className="text-xs font-semibold tracking-widest text-cream/70 uppercase">
            {branch.name}
          </p>
          <h2 className="mt-1 text-2xl font-bold">
            {table.name} · {table.area}
          </h2>
          {session ? (
            <p className="mt-2 text-sm text-cream/90">
              Bàn đang mở · {session.participants} người đã tham gia
            </p>
          ) : null}
        </Card>

        <Card>
          <h3 className="mb-3 text-lg font-bold">Chào mừng quý khách tới {branch.name}</h3>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              join.mutate();
            }}
          >
            <Field label="Tên gọi của bạn (không bắt buộc)">
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Ví dụ: Anh Nam"
                maxLength={40}
                className={inputClass}
              />
            </Field>
            {!session ? (
              <Field label="Số khách">
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setGuestCount(n)}
                      aria-pressed={guestCount === n}
                      className={`h-11 rounded-xl border text-base font-semibold ${guestCount === n ? 'border-maroon bg-maroon text-white' : 'border-line bg-paper text-ink-soft'}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </Field>
            ) : null}
            {needPin ? (
              <Field
                label="Mã PIN của bàn"
                hint="Hỏi người đã vào bàn trước (hiện ở trang Gọi món của họ)"
              >
                <input
                  inputMode="numeric"
                  pattern="\d{4}"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  className={`${inputClass} text-center text-2xl tracking-[0.5em]`}
                  required
                />
              </Field>
            ) : null}
            <Button htmlType="submit" fullWidth loading={join.isPending}>
              {join.isPending ? 'Đang vào bàn...' : session ? 'Tham gia bàn' : 'Bắt đầu gọi món'}
            </Button>
          </form>
        </Card>
      </div>
    </PageShell>
  );
}
