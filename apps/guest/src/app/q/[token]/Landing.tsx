'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQuery } from '@tanstack/react-query';
import { BellRing, ChevronRight, House, KeyRound, ListChecks, QrCode, ReceiptText, UtensilsCrossed, Users } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useCart } from '@/lib/cart-store';
import { useGuestSession, type GuestBranch, type GuestTable } from '@/lib/session-store';
import { cn } from '@/lib/format';
import { BrandMark } from '@/components/Header';
import { Button, EmptyState, Field, LinkButton, PageSpinner, inputClass, useToast } from '@/components/ui';

interface LandingData {
  branch: GuestBranch;
  table: GuestTable;
  session: { id: string; code: string; status: string; guestCount: number; participants: number; requiresPin: boolean } | null;
}

interface JoinResult {
  guestToken: string;
  session: { id: string; code: string; status: string; guestCount: number; joinPin: string | null };
  participant: { id: string; nickname: string | null };
  branch: GuestBranch;
  table: GuestTable;
}

const GUEST_COUNTS = [1, 2, 3, 4, 5, 6, 8, 10, 12];

/** Màn hình check-in khi khách quét QR tại bàn. */
export function Landing({ token }: { token: string }) {
  const t = useTranslations('landing');
  const tc = useTranslations('common');
  const locale = useLocale() as 'vi' | 'en';
  const router = useRouter();
  const toast = useToast((s) => s.show);
  const setSession = useGuestSession((s) => s.setSession);
  const bindCart = useCart((s) => s.bindSession);
  const [nickname, setNickname] = useState('');
  const [pin, setPin] = useState('');
  const [guestCount, setGuestCount] = useState(2);

  const landing = useQuery({
    queryKey: ['qr-landing', token],
    queryFn: () => api<LandingData>(`/q/${encodeURIComponent(token)}`, { absolute: true }),
    retry: false,
  });

  const join = useMutation({
    mutationFn: () =>
      api<JoinResult>(`/q/${encodeURIComponent(token)}/join`, {
        absolute: true,
        body: { nickname: nickname.trim() || undefined, joinPin: pin || undefined, guestCount: landing.data?.session ? undefined : guestCount, locale },
      }),
    onSuccess: (r) => {
      setSession({
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
      if (r.session.joinPin) toast(t('joinPinShare', { pin: r.session.joinPin }));
      router.replace('/menu');
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 403) toast(t('invalidPin'), 'error');
      else toast(err instanceof ApiError ? err.message : tc('errorGeneric'), 'error');
    },
  });

  if (landing.isPending) return <PageSpinner />;
  if (landing.isError || !landing.data) {
    return (
      <EmptyState
        icon={<QrCode className="h-8 w-8" />}
        title={t('notFound')}
        body={t('notFoundBody')}
        action={
          <>
            <Button onClick={() => landing.refetch()} size="lg">
              {tc('retry')}
            </Button>
            <LinkButton href="/menu" variant="secondary">
              <UtensilsCrossed className="h-4 w-4" />
              {tc('viewMenu')}
            </LinkButton>
            <LinkButton href="/" variant="ghost">
              <House className="h-4 w-4" />
              {tc('goHome')}
            </LinkButton>
          </>
        }
      />
    );
  }
  const { branch, table, session } = landing.data;
  const needPin = !!session && branch.guestJoinMode === 'PIN' && session.participants > 0;

  return (
    <div className="animate-rise pt-2">
      {/* Thẻ bàn */}
      <section className="brand-pattern relative overflow-hidden rounded-4xl px-6 pt-6 pb-7 text-cream shadow-lift">
        <div className="flex items-center gap-2.5">
          <BrandMark className="h-10 w-10" />
          <div className="leading-tight">
            <p className="text-[11px] font-semibold tracking-[0.18em] text-gold-light uppercase">{t('checkIn')}</p>
            <p className="font-semibold">{branch.name}</p>
          </div>
        </div>
        <p className="mt-6 text-sm text-cream/80">{t('welcome', { branch: branch.name })}</p>
        <h1 className="tabular mt-1 font-serif text-[44px] leading-none font-bold">
          <span className="gold-text">{table.name}</span>
        </h1>
        <p className="mt-2 text-sm text-cream/85">
          {table.area}
          {table.maxSeats ? ` · ${t('seats', { count: table.maxSeats })}` : ''}
        </p>
        {session ? (
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1.5 text-sm font-medium">
            <span className="h-2 w-2 animate-pulse rounded-full bg-gold-light" />
            <Users className="h-4 w-4" /> {t('sessionOpen', { count: session.participants })}
          </p>
        ) : null}
      </section>

      {/* Biểu mẫu vào bàn */}
      <form
        className="relative -mt-4 space-y-5 rounded-[28px] bg-paper p-5 shadow-card ring-1 ring-line-soft"
        onSubmit={(e) => {
          e.preventDefault();
          join.mutate();
        }}
      >
        <Field label={t('nickname')}>
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder={t('nicknamePlaceholder')} maxLength={40} autoComplete="given-name" className={inputClass} />
        </Field>
        {!session ? (
          <div>
            <span className="mb-1.5 block text-sm font-semibold text-ink">{t('guestCount')}</span>
            <div className="grid grid-cols-5 gap-2 sm:grid-cols-9" role="radiogroup" aria-label={t('guestCount')}>
              {GUEST_COUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  onClick={() => setGuestCount(n)}
                  className={cn('tabular h-12 rounded-2xl text-base font-bold ring-1 transition', guestCount === n ? 'bg-maroon text-white ring-maroon' : 'bg-paper text-ink-soft ring-line')}
                  aria-checked={guestCount === n}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {needPin ? (
          <Field label={t('pin')} hint={t('pinHint')}>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-ink-muted" />
              <input inputMode="numeric" pattern="\d{4}" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} className={cn(inputClass, 'tabular text-center text-2xl font-bold tracking-[0.6em]')} required />
            </div>
          </Field>
        ) : null}
        <Button type="submit" size="lg" className="w-full" loading={join.isPending}>
          {join.isPending ? t('joining') : session ? t('join') : t('start')}
          {!join.isPending ? <ChevronRight className="h-5 w-5" /> : null}
        </Button>
      </form>

      {/* Có gì trong ứng dụng */}
      <ul className="mt-6 grid grid-cols-2 gap-2.5">
        {[
          { icon: UtensilsCrossed, text: t('featureOrder') },
          { icon: ListChecks, text: t('featureTrack') },
          { icon: BellRing, text: t('featureCall') },
          { icon: ReceiptText, text: t('featurePay') },
        ].map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-2.5 rounded-2xl bg-paper/70 p-3 text-[13px] leading-tight font-medium text-ink-soft ring-1 ring-line-soft">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-maroon-soft text-maroon">
              <Icon className="h-4 w-4" />
            </span>
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
}
