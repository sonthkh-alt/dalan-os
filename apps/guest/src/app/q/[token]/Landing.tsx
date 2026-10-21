'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useCart } from '@/lib/cart-store';
import { useGuestSession, type GuestBranch, type GuestTable } from '@/lib/session-store';
import { Button, Card, EmptyState, Field, Spinner, inputClass, useToast } from '@/components/ui';

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

  if (landing.isPending) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }
  if (landing.isError || !landing.data) {
    return <EmptyState title={t('notFound')} action={<Button variant="secondary" onClick={() => landing.refetch()}>{tc('retry')}</Button>} />;
  }
  const { branch, table, session } = landing.data;
  const needPin = !!session && branch.guestJoinMode === 'PIN' && session.participants > 0;

  return (
    <div className="space-y-4">
      <Card className="bg-maroon text-cream">
        <p className="text-xs font-semibold tracking-widest text-cream/70 uppercase">{branch.name}</p>
        <h1 className="mt-1 text-2xl font-bold">{t('tableLabel', { table: table.name, area: table.area })}</h1>
        {session ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-cream/90">
            <Users className="h-4 w-4" /> {t('sessionOpen', { count: session.participants })}
          </p>
        ) : null}
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-bold">{t('welcome', { branch: branch.name })}</h2>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            join.mutate();
          }}
        >
          <Field label={t('nickname')}>
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder={t('nicknamePlaceholder')} maxLength={40} className={inputClass} />
          </Field>
          {!session ? (
            <Field label={t('guestCount')}>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setGuestCount(n)}
                    className={`h-11 flex-1 rounded-xl border text-base font-semibold ${guestCount === n ? 'border-maroon bg-maroon text-white' : 'border-line bg-paper text-ink-soft'}`}
                    aria-pressed={guestCount === n}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </Field>
          ) : null}
          {needPin ? (
            <Field label={t('pin')} hint={t('pinHint')}>
              <input inputMode="numeric" pattern="\d{4}" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} className={`${inputClass} text-center text-2xl tracking-[0.5em]`} required />
            </Field>
          ) : null}
          <Button type="submit" size="lg" className="w-full" loading={join.isPending}>
            {join.isPending ? t('joining') : session ? t('join') : t('start')}
          </Button>
        </form>
      </Card>
    </div>
  );
}
