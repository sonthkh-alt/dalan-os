'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AuthTokens, StaffMe } from '@dalan/contracts';
import { ChefHat, KeyRound, LayoutGrid, ShieldCheck, Smartphone, UserRound, WifiOff } from 'lucide-react';
import { api, errorMessage, get } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import type { DeviceStaff } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input, Segmented } from '@/components/ui/primitives';
import { NumberPad } from '@/components/ui/number-pad';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

type Mode = 'pin' | 'password';

export function LoginScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/';
  const { accessToken, hydrated, deviceToken, deviceName, setDevice, setSession } = useAuth();
  const [mode, setMode] = useState<Mode>('pin');

  useEffect(() => {
    if (hydrated && accessToken) router.replace(next === '/login' ? '/' : next);
  }, [hydrated, accessToken, router, next]);
  useEffect(() => {
    if (hydrated && !deviceToken) setMode('password');
  }, [hydrated, deviceToken]);

  const done = (res: AuthTokens & { me: StaffMe }) => {
    setSession(res);
    toast.success(`Xin chào ${res.me.fullName}`);
    router.replace(next === '/login' ? '/' : next);
  };

  return (
    <div className="flex min-h-dvh bg-canvas">
      <BrandPanel />
      <main className="flex min-w-0 flex-1 flex-col items-center justify-center px-4 py-8 sm:px-8">
        {/* Điện thoại / tablet dọc: thương hiệu gọn phía trên biểu mẫu */}
        <div className="mb-6 flex items-center gap-3 lg:hidden">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-900 text-lg font-extrabold text-gold-100 shadow-brand">DL</span>
          <div className="leading-tight">
            <div className="text-lg font-extrabold tracking-tight text-ink-900">DaLan OS</div>
            <div className="text-sm text-ink-500">Nhà hàng Dạ Lan · Tinh hoa ẩm thực xứ Thanh</div>
          </div>
        </div>
        <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-raised ring-1 ring-ink-900/[0.06] sm:p-8">
          <div className="mb-5">
            <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">Đăng nhập ca làm việc</h1>
            <p className="mt-1 text-sm text-ink-500">{mode === 'pin' ? 'Chọn tên của bạn và nhập mã PIN cá nhân.' : 'Dùng mã nhân viên hoặc email và mật khẩu.'}</p>
          </div>
          <Segmented
            className="mb-5 w-full [&>button]:flex-1"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'pin', label: <span className="flex items-center justify-center gap-1.5"><KeyRound className="h-4 w-4" /> Mã PIN</span> },
              { value: 'password', label: <span className="flex items-center justify-center gap-1.5"><UserRound className="h-4 w-4" /> Mật khẩu</span> },
            ]}
          />
          {mode === 'password' ? <PasswordForm onDone={done} /> : deviceToken ? <PinForm deviceToken={deviceToken} deviceName={deviceName} onDone={done} onResetDevice={() => setDevice(null)} /> : <DeviceSetup onSaved={(t, n) => setDevice(t, n)} />}
        </div>
        <p className="mt-6 flex items-center gap-1.5 text-xs text-ink-500">
          <ShieldCheck className="h-4 w-4" /> Phiên đăng nhập được mã hóa · dữ liệu khách bảo vệ theo Nghị định 13/2023
        </p>
      </main>
    </div>
  );
}

/** Bảng thương hiệu bên trái (màn hình rộng): đỏ đô Dạ Lan, điểm vàng, các cơ sở. */
function BrandPanel() {
  const venues = ['Center', 'Star', 'Event'];
  const features = [
    { icon: LayoutGrid, text: 'Sơ đồ bàn, gọi món, thanh toán VietQR trong vài chạm' },
    { icon: ChefHat, text: 'Bếp nhận phiếu tức thì, cảnh báo món trễ' },
    { icon: WifiOff, text: 'Mất mạng vẫn bán hàng, tự gửi lại khi có mạng' },
  ];
  return (
    <aside className="relative hidden w-[46%] max-w-[640px] flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 p-10 text-white lg:flex xl:p-14">
      {/* Họa tiết vầng sáng vàng nhẹ */}
      <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-gold-500/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-40 -left-24 h-[28rem] w-[28rem] rounded-full bg-brand-400/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:22px_22px]" aria-hidden />

      <div className="relative flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-lg font-extrabold text-gold-100 ring-1 ring-white/20 backdrop-blur">DL</span>
        <div className="leading-tight">
          <div className="text-lg font-extrabold tracking-tight">DaLan OS</div>
          <div className="text-sm text-white/70">Hệ điều hành nhà hàng</div>
        </div>
      </div>

      <div className="relative">
        <p className="text-sm font-semibold tracking-[0.2em] text-gold-300 uppercase">Nhà hàng Dạ Lan · Thanh Hóa</p>
        <h2 className="mt-3 text-4xl leading-tight font-extrabold tracking-tight xl:text-5xl">
          Tinh hoa ẩm thực
          <br />
          xứ Thanh
        </h2>
        <ul className="mt-8 space-y-3">
          {features.map((f) => (
            <li key={f.text} className="flex items-center gap-3 text-white/85">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
                <f.icon className="h-5 w-5 text-gold-300" />
              </span>
              {f.text}
            </li>
          ))}
        </ul>
      </div>

      <div className="relative grid grid-cols-3 gap-3">
        {venues.map((v) => (
          <div key={v} className="rounded-2xl bg-white/[0.07] px-3 py-3 text-center ring-1 ring-white/10">
            <div className="text-xs text-white/60">Dạ Lan</div>
            <div className="font-bold text-gold-100">{v}</div>
          </div>
        ))}
      </div>
    </aside>
  );
}

function PasswordForm({ onDone }: { onDone: (r: AuthTokens & { me: StaffMe }) => void }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      onDone(await api<AuthTokens & { me: StaffMe }>('POST', '/auth/staff/login', { login: login.trim(), password }, { anonymous: true, idempotencyKey: false }));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <Input label="Mã nhân viên hoặc email" value={login} onChange={(e) => setLogin(e.target.value)} autoCapitalize="characters" autoComplete="username" required />
      <Input label="Mật khẩu" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
      <Button type="submit" size="lg" block loading={loading}>
        Đăng nhập
      </Button>
      {process.env.NEXT_PUBLIC_DEMO === '1' && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200 ring-inset">
          Bản dùng thử: đăng nhập bằng mã <b>ADMIN</b> (quản trị), <b>QL-C</b> (quản lý Center), <b>GD01</b> (giám đốc) hoặc{' '}
          <b>KDT01</b> (kinh doanh tiệc), với mật khẩu bạn đã đặt khi triển khai.
        </p>
      )}
    </form>
  );
}

function DeviceSetup({ onSaved }: { onSaved: (token: string, name: string) => void }) {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const verify = async () => {
    setLoading(true);
    try {
      const info = await get<DeviceStaff>('/auth/staff/device', { anonymous: true, headers: { 'x-device-token': token.trim() } });
      onSaved(token.trim(), info.device.name);
      toast.success(`Thiết bị "${info.device.name}" đã sẵn sàng`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-xl bg-gold-50 p-3 text-sm text-ink-700 ring-1 ring-gold-200 ring-inset">
        <Smartphone className="mt-0.5 h-5 w-5 shrink-0" />
        <p>Đăng nhập bằng PIN cần thiết bị đã được quản lý đăng ký. Dán token thiết bị (chỉ nhập một lần trên máy này).</p>
      </div>
      <Input label="Token thiết bị" value={token} onChange={(e) => setToken(e.target.value)} placeholder="dev_..." />
      <Button size="lg" block onClick={verify} loading={loading} disabled={!token.trim()}>
        Lưu thiết bị
      </Button>
    </div>
  );
}

function PinForm({ deviceToken, deviceName, onDone, onResetDevice }: { deviceToken: string; deviceName: string | null; onDone: (r: AuthTokens & { me: StaffMe }) => void; onResetDevice: () => void }) {
  const [staffId, setStaffId] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const staff = useQuery({ queryKey: ['device-staff', deviceToken], queryFn: () => get<DeviceStaff>('/auth/staff/device', { anonymous: true, headers: { 'x-device-token': deviceToken } }), retry: false });

  const submit = async () => {
    if (!staffId || pin.length < 4) return;
    setLoading(true);
    try {
      onDone(await api<AuthTokens & { me: StaffMe }>('POST', '/auth/staff/pin', { staffId, pin }, { anonymous: true, idempotencyKey: false, headers: { 'x-device-token': deviceToken } }));
    } catch (err) {
      toast.error(errorMessage(err));
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  if (staff.isError) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-red-700">{errorMessage(staff.error)}</p>
        <Button variant="outline" onClick={onResetDevice}>Nhập lại token thiết bị</Button>
      </div>
    );
  }
  const selected = staff.data?.staff.find((s) => s.id === staffId);
  return (
    <div className="space-y-3">
      <p className="text-center text-xs text-ink-500">Thiết bị: {deviceName ?? staff.data?.device.name ?? '...'}</p>
      {!staffId ? (
        <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto">
          {staff.data?.staff.map((s) => (
            <button key={s.id} type="button" onClick={() => setStaffId(s.id)} className="flex min-h-[64px] items-center gap-2.5 rounded-2xl bg-white p-2.5 text-left shadow-card ring-1 ring-ink-900/[0.07] transition hover:ring-brand-300 active:scale-[0.98]">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-600 to-brand-800 font-bold text-white">{s.fullName.split(' ').slice(-1)[0]?.[0] ?? '?'}</span>
              <span className="min-w-0">
                <span className="block truncate font-semibold">{s.fullName}</span>
                <span className="block text-xs text-ink-500">{s.role.name}</span>
              </span>
            </button>
          ))}
          {staff.data && staff.data.staff.length === 0 && <p className="col-span-2 text-center text-ink-500">Chưa có nhân viên nào gắn với cơ sở của thiết bị.</p>}
        </div>
      ) : (
        <>
          <button type="button" onClick={() => { setStaffId(null); setPin(''); }} className="min-h-[48px] w-full rounded-xl bg-brand-50 px-3 py-2 text-left font-semibold text-brand-800 ring-1 ring-brand-200 ring-inset">
            {selected?.fullName} <span className="text-xs font-normal text-ink-500">· đổi người</span>
          </button>
          <div className="flex justify-center gap-3 py-1">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span key={i} className={cn('h-4 w-4 rounded-full', i < pin.length ? 'bg-brand-700' : 'bg-ink-100', i >= 4 && 'opacity-50')} />
            ))}
          </div>
          <NumberPad value={pin} onChange={(v) => setPin(v.replace(/\D/g, '').slice(0, 6))} maxLength={6} onSubmit={submit} submitLabel={loading ? 'Đang kiểm tra...' : 'Đăng nhập'} />
        </>
      )}
      <button type="button" onClick={onResetDevice} className="w-full py-2 text-center text-xs text-ink-500 underline">
        Đổi thiết bị
      </button>
    </div>
  );
}
