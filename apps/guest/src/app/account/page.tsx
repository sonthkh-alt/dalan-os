'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CalendarDays, Gift, LogOut, ReceiptText, ShieldCheck, Sparkles, Star, Ticket, UtensilsCrossed, Zap } from 'lucide-react';
import { formatVnPhone, normalizeVnPhone } from '@dalan/domain';
import { api, ApiError, isNotFound } from '@/lib/api';
import { useCustomer } from '@/lib/customer-store';
import { useHydrated } from '@/lib/hydrated';
import { cn, formatVnd } from '@/lib/format';
import { BrandMark } from '@/components/Header';
import { Button, Field, LinkButton, PageSpinner, PageTitle, SectionTitle, inputClass, useToast } from '@/components/ui';

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
  const hydrated = useHydrated();
  const accessToken = useCustomer((s) => s.accessToken);
  if (!hydrated) return <PageSpinner />;
  return accessToken ? <Member /> : <SignIn />;
}

function Member() {
  const t = useTranslations('account');
  const tc = useTranslations('common');
  const locale = useLocale();
  const customer = useCustomer();
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
    enabled: !!customer.accessToken,
  });
  const data = me.data;
  const displayName = data?.fullName ?? customer.fullName ?? formatVnPhone(customer.phone ?? '');
  const dateFmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div>
      <PageTitle eyebrow={t('memberEyebrow')} title={t('welcome', { name: displayName })} />

      {/* Thẻ thành viên */}
      <div className="brand-pattern relative aspect-[1.6/1] overflow-hidden rounded-[28px] p-5 text-cream shadow-lift">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <BrandMark className="h-10 w-10" />
            <div className="leading-tight">
              <p className="font-serif text-lg font-bold">Dạ Lan</p>
              <p className="text-[11px] tracking-[0.2em] text-gold-light uppercase">{t('memberCard')}</p>
            </div>
          </div>
          <span className="rounded-full bg-linear-to-r from-[#f3d488] to-gold px-3 py-1 text-xs font-bold text-maroon-deep shadow">{data?.tier?.name ?? t('tierDefault')}</span>
        </div>
        <div className="absolute inset-x-5 bottom-5 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] tracking-wider text-cream/70 uppercase">{t('points')}</p>
            <p className="tabular font-serif text-4xl leading-none font-bold">
              <span className="gold-text">{data ? data.pointsBalance.toLocaleString('vi-VN') : '—'}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="truncate text-sm font-semibold">{displayName}</p>
            <p className="tabular text-xs tracking-widest text-cream/75">{formatVnPhone(customer.phone ?? '')}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Stat label={t('visits')} value={data ? data.visitCount.toLocaleString('vi-VN') : '—'} />
        <Stat label={t('lifetime')} value={data ? formatVnd(data.lifetimeSpend) : '—'} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2.5">
        {[
          { href: '/reserve', icon: CalendarDays, label: tc('reserve') },
          { href: '/menu', icon: UtensilsCrossed, label: tc('viewMenu') },
          { href: '#vouchers', icon: Ticket, label: t('vouchers') },
        ].map(({ href, icon: Icon, label }) => (
          <a key={href} href={href} className="flex min-h-22 flex-col items-center justify-center gap-2 rounded-3xl bg-paper p-3 text-center text-[13px] font-semibold text-ink shadow-card ring-1 ring-line-soft transition active:scale-[0.97]">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-maroon-soft text-maroon">
              <Icon className="h-5 w-5" />
            </span>
            {label}
          </a>
        ))}
      </div>

      <section id="vouchers" className="mt-7 scroll-mt-20">
        <SectionTitle>{t('vouchers')}</SectionTitle>
        {data && data.vouchers.length > 0 ? (
          <ul className="space-y-2.5">
            {data.vouchers.map((v) => (
              <li key={v.id} className="flex items-stretch overflow-hidden rounded-3xl bg-paper shadow-card ring-1 ring-line-soft">
                <span className="flex w-20 shrink-0 items-center justify-center bg-linear-to-br from-gold-light to-gold text-maroon-deep">
                  <Gift className="h-7 w-7" />
                </span>
                <span className="min-w-0 flex-1 border-l-2 border-dashed border-line p-3.5">
                  <span className="tabular block font-bold text-ink">{v.kind === 'PERCENT' ? `${v.value}%` : formatVnd(v.value)}</span>
                  <span className="block font-mono text-xs tracking-wider text-maroon">{v.code}</span>
                  {v.validTo ? <span className="block text-xs text-ink-muted">{t('validTo', { date: dateFmt.format(new Date(v.validTo)) })}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-3xl bg-paper p-4 text-sm text-ink-muted ring-1 ring-line-soft">{me.isPending ? tc('loading') : data === null ? t('comingSoon') : t('noVouchers')}</p>
        )}
      </section>

      <section className="mt-7">
        <SectionTitle>{t('history')}</SectionTitle>
        {me.isPending ? (
          <p className="text-sm text-ink-muted">{tc('loading')}</p>
        ) : data === null || !data ? (
          <p className="rounded-3xl bg-paper p-4 text-sm text-ink-muted ring-1 ring-line-soft">{t('comingSoon')}</p>
        ) : data.bills.length === 0 ? (
          <p className="rounded-3xl bg-paper p-4 text-sm text-ink-muted ring-1 ring-line-soft">{t('noHistory')}</p>
        ) : (
          <ul className="overflow-hidden rounded-3xl bg-paper shadow-card ring-1 ring-line-soft">
            {data.bills.map((b, i) => (
              <li key={b.id} className={cn('flex items-center gap-3 px-4 py-3', i > 0 && 'border-t border-line-soft')}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cream text-maroon">
                  <ReceiptText className="h-4.5 w-4.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink">{b.branch.name}</span>
                  <span className="tabular block text-xs text-ink-muted">
                    {b.code}
                    {b.closedAt ? ` · ${dateFmt.format(new Date(b.closedAt))}` : ''}
                  </span>
                </span>
                <span className="tabular font-semibold text-maroon">{formatVnd(b.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Button variant="ghost" className="mt-6 w-full" onClick={() => customer.signOut()}>
        <LogOut className="h-4 w-4" />
        {t('logout')}
      </Button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-paper p-4 shadow-card ring-1 ring-line-soft">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="tabular mt-1 truncate font-serif text-xl font-bold text-ink">{value}</p>
    </div>
  );
}

function SignIn() {
  const t = useTranslations('account');
  const tc = useTranslations('common');
  const signIn = useCustomer((s) => s.signIn);
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
      signIn({ accessToken: r.accessToken, refreshToken: r.refreshToken, customerId: r.customer.id, phone: r.customer.phone, fullName: r.customer.fullName });
      setStep('phone');
      setCode('');
    },
    onError: () => toast(t('invalidOtp'), 'error'),
  });

  const perks = [
    { icon: Star, text: t('perkPoints') },
    { icon: Gift, text: t('perkBirthday') },
    { icon: Zap, text: t('perkFast') },
    { icon: ReceiptText, text: t('perkHistory') },
  ];

  return (
    <div>
      <div className="brand-pattern relative overflow-hidden rounded-[28px] p-6 text-cream shadow-lift">
        <Sparkles className="absolute top-5 right-5 h-6 w-6 text-gold-light/70" />
        <p className="text-[11px] font-semibold tracking-[0.18em] text-gold-light uppercase">{t('memberEyebrow')}</p>
        <h1 className="mt-1 font-serif text-[28px] leading-tight font-bold">{t('title')}</h1>
        <p className="mt-2 text-sm text-cream/85">{t('intro')}</p>
        <ul className="mt-5 grid grid-cols-2 gap-2.5">
          {perks.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-2 rounded-2xl bg-white/10 px-3 py-2.5 text-[13px] leading-tight font-medium">
              <Icon className="h-4 w-4 shrink-0 text-gold-light" />
              {text}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-5 rounded-[28px] bg-paper p-5 shadow-card ring-1 ring-line-soft">
        {step === 'phone' ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              request.mutate();
            }}
          >
            <Field label={t('phone')}>
              <input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0912 345 678" className={cn(inputClass, 'tabular text-lg')} required />
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={request.isPending}>
              {t('sendOtp')}
            </Button>
          </form>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              verify.mutate();
            }}
          >
            <p className="text-sm text-ink-soft">{t('otpSent', { phone: formatVnPhone(normalizeVnPhone(phone) ?? phone) })}</p>
            <Field label={t('otp')}>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className={cn(inputClass, 'tabular text-center text-3xl font-bold tracking-[0.5em]')}
                required
                autoFocus
              />
            </Field>
            {devCode ? <p className="rounded-xl bg-warn-soft px-3 py-2 text-xs text-warn">{t('devOtp', { code: devCode })}</p> : null}
            <Field label={t('name')}>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoComplete="name" className={inputClass} />
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={verify.isPending} disabled={code.length !== 6}>
              {t('verify')}
            </Button>
            <div className="flex justify-between">
              <Button variant="ghost" size="sm" onClick={() => setStep('phone')}>
                {t('changePhone')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => request.mutate()} loading={request.isPending}>
                {t('resend')}
              </Button>
            </div>
          </form>
        )}
        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-ink-muted">
          <ShieldCheck className="h-4 w-4 text-success" />
          {t('privacy')}
        </p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2.5">
        <LinkButton href="/reserve" variant="secondary">
          <CalendarDays className="h-4 w-4" />
          {tc('reserve')}
        </LinkButton>
        <LinkButton href="/menu" variant="secondary">
          <UtensilsCrossed className="h-4 w-4" />
          {tc('viewMenu')}
        </LinkButton>
      </div>
    </div>
  );
}
