'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery } from '@tanstack/react-query';
import { UserRound } from 'lucide-react';
import { formatVnPhone, normalizeVnPhone } from '@dalan/domain';
import { api, ApiError, isNotFound } from '@/lib/api';
import { useCustomer } from '@/lib/customer-store';
import { useHydrated } from '@/lib/hydrated';
import { formatVnd } from '@/lib/format';
import { Button, Card, Field, Spinner, inputClass, useToast } from '@/components/ui';

interface OtpRequestResult {
  sent: boolean;
  devCode?: string;
  expiresInSeconds: number;
}
interface OtpVerifyResult {
  accessToken: string;
  refreshToken: string;
  customer: { id: string; phone: string; fullName: string | null; isNew: boolean };
}
interface CustomerMe {
  fullName: string | null;
  phone: string;
  pointsBalance: number;
  tier: { code: string; name: string } | null;
  visitCount: number;
  lifetimeSpend: number;
  bills: { id: string; code: string; total: number; closedAt: string | null; branch: { name: string } }[];
  vouchers: { id: string; code: string; kind: string; value: number; validTo: string | null }[];
}

export default function AccountPage() {
  const t = useTranslations('account');
  const tc = useTranslations('common');
  const hydrated = useHydrated();
  const customer = useCustomer();
  const toast = useToast((s) => s.show);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [devCode, setDevCode] = useState<string | null>(null);

  const request = useMutation({
    mutationFn: () => {
      const normalized = normalizeVnPhone(phone);
      if (!normalized) throw new ApiError(400, 'INVALID_PHONE', t('invalidPhone'));
      return api<OtpRequestResult>('/auth/customer/otp/request', { body: { phone: normalized, purpose: 'login' } });
    },
    onSuccess: (r) => {
      setStep('otp');
      setDevCode(r.devCode ?? null);
      toast(t('otpSent', { phone: formatVnPhone(normalizeVnPhone(phone) ?? phone) }));
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : tc('errorGeneric'), 'error'),
  });

  const verify = useMutation({
    mutationFn: () => api<OtpVerifyResult>('/auth/customer/otp/verify', { body: { phone: normalizeVnPhone(phone), code, purpose: 'login', fullName: name.trim() || undefined } }),
    onSuccess: (r) => {
      customer.signIn({ accessToken: r.accessToken, refreshToken: r.refreshToken, customerId: r.customer.id, phone: r.customer.phone, fullName: r.customer.fullName });
      setStep('phone');
      setCode('');
    },
    onError: () => toast(t('invalidOtp'), 'error'),
  });

  const me = useQuery({
    queryKey: ['customer-me', customer.customerId],
    queryFn: async () => {
      try {
        return await api<CustomerMe>('/me', { accessToken: customer.accessToken });
      } catch (err) {
        if (isNotFound(err)) return null; // mô-đun khách hàng chưa có endpoint
        throw err;
      }
    },
    enabled: hydrated && !!customer.accessToken,
  });

  if (!hydrated) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (customer.accessToken) {
    return (
      <div className="space-y-4">
        <Card className="bg-maroon text-cream">
          <p className="flex items-center gap-2 text-lg font-bold">
            <UserRound className="h-5 w-5" /> {t('welcome', { name: customer.fullName ?? formatVnPhone(customer.phone ?? '') })}
          </p>
          <p className="text-sm text-cream/80">{formatVnPhone(customer.phone ?? '')}</p>
        </Card>
        <div className="grid grid-cols-2 gap-3">
          <Card className="text-center">
            <p className="text-xs text-ink-muted">{t('points')}</p>
            <p className="text-2xl font-bold text-maroon">{me.data ? me.data.pointsBalance.toLocaleString('vi-VN') : '—'}</p>
          </Card>
          <Card className="text-center">
            <p className="text-xs text-ink-muted">{t('tier')}</p>
            <p className="text-2xl font-bold text-maroon">{me.data?.tier?.name ?? '—'}</p>
          </Card>
        </div>
        <Card>
          <p className="text-sm font-semibold">{t('history')}</p>
          {me.data === null ? (
            <p className="mt-1 text-sm text-ink-muted">{t('comingSoon')}</p>
          ) : !me.data ? (
            <p className="mt-1 text-sm text-ink-muted">{tc('loading')}</p>
          ) : me.data.bills.length === 0 ? (
            <p className="mt-1 text-sm text-ink-muted">—</p>
          ) : (
            <ul className="mt-2 divide-y divide-line text-sm">
              {me.data.bills.map((b) => (
                <li key={b.id} className="flex items-center justify-between py-2">
                  <span>
                    <span className="font-medium">{b.branch.name}</span>
                    <span className="block text-xs text-ink-muted">{b.code}{b.closedAt ? ` · ${new Date(b.closedAt).toLocaleDateString('vi-VN')}` : ''}</span>
                  </span>
                  <span className="font-semibold text-maroon">{formatVnd(b.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Button variant="ghost" className="w-full" onClick={() => customer.signOut()}>
          {t('logout')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t('title')}</h1>
      <p className="text-sm text-ink-soft">{t('intro')}</p>
      <Card>
        {step === 'phone' ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              request.mutate();
            }}
          >
            <Field label={t('phone')}>
              <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0912 345 678" className={inputClass} required />
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={request.isPending}>
              {t('sendOtp')}
            </Button>
          </form>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              verify.mutate();
            }}
          >
            <Field label={t('otp')}>
              <input inputMode="numeric" pattern="\d{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className={`${inputClass} text-center text-2xl tracking-[0.4em]`} required autoFocus />
            </Field>
            {devCode ? <p className="text-xs text-warn">{t('devOtp', { code: devCode })}</p> : null}
            <Field label={t('name')}>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className={inputClass} />
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={verify.isPending}>
              {t('verify')}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => setStep('phone')}>
              {tc('back')}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
