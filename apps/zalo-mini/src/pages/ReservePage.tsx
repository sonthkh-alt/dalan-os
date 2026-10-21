import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, useNavigate, useSearchParams } from 'zmp-ui';
import { normalizeVnPhone } from '@dalan/domain';
import { PageShell } from '../components/PageShell';
import { ReservationStatusBadge } from '../components/StatusBadge';
import { Card, Chip, Field, Notice, inputClass, useToast } from '../components/ui';
import { api, ApiError, errorMessage, isMissingEndpoint } from '../lib/api';
import { BRANCHES, findBranch, formatPhone } from '../lib/branches';
import { useCustomer } from '../lib/customer-store';
import { cn, formatDateTime, formatVnd, todayIso } from '../lib/format';
import { useAvailability, usePublicBranches } from '../lib/queries';
import { callPhone } from '../lib/zalo';

const SEATING = [
  { key: 'HALL', label: 'Sảnh chung' },
  { key: 'VIP_ROOM', label: 'Phòng riêng' },
  { key: 'OUTDOOR', label: 'Ngoài trời' },
] as const;

interface ReservationResult {
  code: string;
  status: string;
  reservedAt: string;
  partySize: number;
  depositRequired?: number | string | null;
}

export function ReservePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast((s) => s.show);
  const queryClient = useQueryClient();
  const profile = useCustomer((s) => s.profile);
  const loggedIn = useCustomer((s) => !!s.accessToken);
  const initialBranch = findBranch(params.get('branch') ?? undefined)?.code ?? 'CENTER';

  const [branchCode, setBranchCode] = useState(initialBranch);
  const [date, setDate] = useState(todayIso());
  const [time, setTime] = useState('');
  const [partySize, setPartySize] = useState(4);
  const [seating, setSeating] = useState<(typeof SEATING)[number]['key']>('HALL');
  const [name, setName] = useState(profile?.fullName ?? '');
  const [phone, setPhone] = useState(profile?.phone ? profile.phone.replace(/^\+84/, '0') : '');
  const [requests, setRequests] = useState('');
  const [result, setResult] = useState<ReservationResult | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const branch = findBranch(branchCode) ?? BRANCHES[0]!;
  const publicBranches = usePublicBranches();
  const availability = useAvailability(branchCode, date, partySize);
  const availabilityMissing = availability.isError && isMissingEndpoint(availability.error);
  const slots = useMemo(() => {
    const all = availability.data?.slots ?? [];
    if (date !== todayIso()) return all;
    // bỏ khung giờ đã qua (giờ Việt Nam) trong ngày hôm nay
    const now = new Date();
    return all.filter((s) => new Date(s.startsAt).getTime() > now.getTime() + 30 * 60_000);
  }, [availability.data, date]);

  const submit = useMutation({
    mutationFn: async () => {
      const normalized = normalizeVnPhone(phone);
      if (!normalized) throw new ApiError(400, 'INVALID_PHONE', 'Số điện thoại không hợp lệ');
      if (!time) throw new ApiError(400, 'TIME_REQUIRED', 'Vui lòng chọn giờ đến');
      const target = publicBranches.data?.find((b) => b.code === branchCode);
      if (!target) throw new ApiError(404, 'NOT_FOUND', 'Chưa có dịch vụ đặt bàn online');
      const seatingLabel = SEATING.find((s) => s.key === seating)?.label ?? '';
      return api<ReservationResult>('/public/reservations', {
        auth: loggedIn,
        body: {
          branchId: target.id,
          reservedAt: `${date}T${time}:00+07:00`,
          partySize,
          customerName: name.trim(),
          customerPhone: normalized,
          specialRequests: [`Loại chỗ: ${seatingLabel}`, requests.trim()]
            .filter(Boolean)
            .join('. ')
            .slice(0, 500),
          source: 'MINI_APP',
        },
      });
    },
    onSuccess: (r) => {
      setResult(r);
      void queryClient.invalidateQueries({ queryKey: ['my-reservations'] });
      void queryClient.invalidateQueries({ queryKey: ['availability'] });
    },
    onError: (err) => {
      if (isMissingEndpoint(err)) setUnavailable(true);
      else toast(errorMessage(err), 'error');
    },
  });

  if (result) {
    const deposit = Number(result.depositRequired ?? 0);
    return (
      <PageShell title="Đặt bàn">
        <Card className="text-center">
          <p className="text-lg font-bold text-success">Đã nhận yêu cầu đặt bàn</p>
          <p className="mt-1 text-sm text-ink-soft">Mã đặt bàn</p>
          <p className="font-mono text-2xl font-bold tracking-widest text-maroon">{result.code}</p>
          <div className="mt-2">
            <ReservationStatusBadge status={result.status} />
          </div>
          <p className="mt-3 text-sm">
            {branch.name} · {formatDateTime(result.reservedAt)} · {result.partySize} khách
          </p>
          {deposit > 0 ? (
            <Notice tone="warn" className="mt-3">
              Cần đặt cọc {formatVnd(deposit)}. Nhà hàng sẽ liên hệ hướng dẫn thanh toán cọc.
            </Notice>
          ) : null}
          <p className="mt-3 text-sm text-ink-soft">
            Nhà hàng sẽ xác nhận qua Zalo hoặc điện thoại.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setResult(null)}>
              Đặt thêm
            </Button>
            <Button onClick={() => navigate('/account')}>Xem đặt bàn</Button>
          </div>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell title="Đặt bàn">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
      >
        {unavailable ? (
          <Notice tone="warn">
            Đặt bàn online đang được hoàn thiện. Vui lòng gọi {formatPhone(branch.phone)} để đặt
            bàn.
            <button
              type="button"
              onClick={() => void callPhone(branch.phone)}
              className="mt-2 block rounded-lg bg-maroon px-3 py-1.5 font-semibold text-white"
            >
              Gọi ngay
            </button>
          </Notice>
        ) : null}
        {!loggedIn ? (
          <Notice>
            <button
              type="button"
              className="font-semibold text-maroon underline"
              onClick={() => navigate('/account')}
            >
              Đăng nhập Zalo
            </button>{' '}
            để điền nhanh tên, số điện thoại và tích điểm thành viên.
          </Notice>
        ) : null}

        <Field label="Cơ sở">
          <div className="grid grid-cols-3 gap-2">
            {BRANCHES.map((b) => (
              <Chip
                key={b.code}
                active={b.code === branchCode}
                onClick={() => {
                  setBranchCode(b.code);
                  setTime('');
                }}
              >
                {b.name.replace('Dạ Lan ', '')}
              </Chip>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Ngày">
            <input
              type="date"
              min={todayIso()}
              max={todayIso(90)}
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setTime('');
              }}
              className={inputClass}
              required
            />
          </Field>
          <Field label="Số khách">
            <div className="flex items-center rounded-xl border border-line bg-paper">
              <button
                type="button"
                aria-label="Giảm"
                className="h-11 w-11 text-xl text-ink-soft"
                onClick={() => setPartySize((n) => Math.max(1, n - 1))}
              >
                −
              </button>
              <input
                type="number"
                min={1}
                max={500}
                value={partySize}
                onChange={(e) =>
                  setPartySize(Math.max(1, Math.min(500, Number(e.target.value) || 1)))
                }
                className="w-full min-w-0 bg-transparent text-center text-lg font-bold focus:outline-none"
              />
              <button
                type="button"
                aria-label="Tăng"
                className="h-11 w-11 text-xl text-ink-soft"
                onClick={() => setPartySize((n) => Math.min(500, n + 1))}
              >
                +
              </button>
            </div>
          </Field>
        </div>

        <Field
          label="Giờ đến"
          hint={
            availabilityMissing
              ? 'Chưa xem được chỗ trống online, nhà hàng sẽ xác nhận lại.'
              : 'Khung 15 phút; màu xám là đã kín chỗ.'
          }
        >
          {availabilityMissing || availability.isError ? (
            <input
              type="time"
              step={900}
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={inputClass}
              required
            />
          ) : availability.isPending ? (
            <p className="py-3 text-sm text-ink-muted">Đang kiểm tra chỗ trống...</p>
          ) : slots.length === 0 ? (
            <p className="py-3 text-sm text-warn">
              Không còn khung giờ trong ngày này, vui lòng chọn ngày khác.
            </p>
          ) : (
            <div className="no-scrollbar grid max-h-56 grid-cols-4 gap-2 overflow-y-auto">
              {slots.map((s) => (
                <button
                  key={s.time}
                  type="button"
                  disabled={!s.available}
                  onClick={() => setTime(s.time)}
                  aria-pressed={time === s.time}
                  className={cn(
                    'rounded-lg border py-2 text-sm font-semibold',
                    time === s.time
                      ? 'border-maroon bg-maroon text-white'
                      : s.available
                        ? 'border-line bg-paper text-ink'
                        : 'border-line bg-cream-dark text-ink-muted line-through',
                  )}
                >
                  {s.time}
                </button>
              ))}
            </div>
          )}
        </Field>
        {availability.data?.depositRequired ? (
          <Notice tone="warn">
            Nhóm {partySize} khách cần đặt cọc {formatVnd(availability.data.depositRequired)}.
          </Notice>
        ) : null}

        <Field label="Loại chỗ">
          <div className="grid grid-cols-3 gap-2">
            {SEATING.map((s) => (
              <Chip key={s.key} active={seating === s.key} onClick={() => setSeating(s.key)}>
                {s.label}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="Tên người đặt">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            className={inputClass}
            required
          />
        </Field>
        <Field label="Số điện thoại">
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0912 345 678"
            className={inputClass}
            required
          />
        </Field>
        <Field label="Yêu cầu đặc biệt">
          <textarea
            value={requests}
            onChange={(e) => setRequests(e.target.value)}
            placeholder="Sinh nhật, ghế trẻ em, dị ứng..."
            rows={3}
            maxLength={400}
            className={inputClass}
          />
        </Field>
        <Button htmlType="submit" fullWidth loading={submit.isPending} disabled={!time}>
          Gửi yêu cầu đặt bàn
        </Button>
      </form>
    </PageShell>
  );
}
