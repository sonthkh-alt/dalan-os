'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AuthTokens, StaffMe } from '@dalan/contracts';
import { KeyRound, Smartphone, UserRound } from 'lucide-react';
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
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-brand-800 to-brand-900 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-5 text-center">
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-700 text-2xl font-black text-white">DL</div>
          <h1 className="text-xl font-bold text-ink-900">DaLan OS</h1>
          <p className="text-sm text-ink-500">Nhà hàng Dạ Lan · Tinh hoa ẩm thực xứ Thanh</p>
        </div>
        <Segmented
          className="mb-4 w-full [&>button]:flex-1"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'pin', label: <span className="flex items-center justify-center gap-1"><KeyRound className="h-4 w-4" /> Mã PIN</span> },
            { value: 'password', label: <span className="flex items-center justify-center gap-1"><UserRound className="h-4 w-4" /> Mật khẩu</span> },
          ]}
        />
        {mode === 'password' ? <PasswordForm onDone={done} /> : deviceToken ? <PinForm deviceToken={deviceToken} deviceName={deviceName} onDone={done} onResetDevice={() => setDevice(null)} /> : <DeviceSetup onSaved={(t, n) => setDevice(t, n)} />}
      </div>
    </div>
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
      <div className="flex items-start gap-2 rounded-xl bg-gold-100 p-3 text-sm text-ink-700">
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
            <button key={s.id} type="button" onClick={() => setStaffId(s.id)} className="flex min-h-[64px] items-center gap-2 rounded-xl border border-ink-100 bg-paper p-2 text-left hover:border-brand-300">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-800">{s.fullName.split(' ').slice(-1)[0]?.[0] ?? '?'}</span>
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
          <button type="button" onClick={() => { setStaffId(null); setPin(''); }} className="w-full rounded-xl bg-brand-50 px-3 py-2 text-left font-semibold text-brand-800">
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
