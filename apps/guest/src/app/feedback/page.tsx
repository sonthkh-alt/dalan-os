'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation } from '@tanstack/react-query';
import { api, ApiError, isNotFound } from '@/lib/api';
import { useGuestSessionView, useGuestToken } from '@/lib/guest-data';
import { useGuestSession } from '@/lib/session-store';
import { localizedName } from '@/lib/format';
import { SessionGate } from '@/components/SessionGate';
import { StarRating } from '@/components/StarRating';
import { Heart, House, UtensilsCrossed } from 'lucide-react';
import { Button, Chip, LinkButton, PageTitle, inputClass, useToast } from '@/components/ui';

export default function FeedbackPage() {
  return (
    <SessionGate>
      <Feedback />
    </SessionGate>
  );
}

function Feedback() {
  const t = useTranslations('feedback');
  const locale = useLocale();
  const token = useGuestToken();
  const sessionId = useGuestSession((s) => s.sessionId);
  const toast = useToast((s) => s.show);
  const view = useGuestSessionView();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [liked, setLiked] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  const dishes = Array.from(new Map((view.data?.orders ?? []).flatMap((o) => o.lines).filter((l) => l.status === 'SERVED' || l.status === 'READY').map((l) => [l.name, l])).values());

  const submit = useMutation({
    mutationFn: async () => {
      // API: POST /guest/feedback (feedbackSchema). Món thích gửi dưới dạng tags vì phiên khách không lộ itemId.
      const body = { rating, comment: comment.trim() || undefined, likedItemIds: [], tags: liked.map((n) => n.slice(0, 40)) };
      try {
        await api('/guest/feedback', { guestToken: token, body });
      } catch (err) {
        // Khi API chưa sẵn sàng (404) thì lưu cục bộ để không mất đánh giá.
        if (!isNotFound(err)) throw err;
        const key = 'dalan-feedback-pending';
        const pending = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown[];
        pending.push({ ...body, sessionId, at: new Date().toISOString() });
        localStorage.setItem(key, JSON.stringify(pending));
      }
    },
    onSuccess: () => {
      setDone(true);
      toast(t('thanks'));
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : t('thanks'), 'warn'),
  });

  if (done) {
    return (
      <div className="animate-rise py-10 text-center">
        <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-maroon-soft text-maroon">
          <Heart className="h-9 w-9" fill="currentColor" />
        </span>
        <p className="mt-5 font-serif text-2xl font-bold text-ink">{t('thanks')}</p>
        <p className="mt-1 text-sm text-ink-soft">{t('savedLocal')}</p>
        <div className="mx-auto mt-6 grid grid-cols-1 max-w-xs gap-2.5">
          <LinkButton href="/menu" size="lg">
            <UtensilsCrossed className="h-5 w-5" />
            {t('backToMenu')}
          </LinkButton>
          <LinkButton href="/" variant="secondary">
            <House className="h-4 w-4" />
            {t('home')}
          </LinkButton>
        </div>
      </div>
    );
  }
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit.mutate();
      }}
    >
      <PageTitle eyebrow={t('eyebrow')} title={t('title')} />
      <div className="rounded-[28px] bg-paper p-5 text-center shadow-card ring-1 ring-line-soft">
        <StarRating value={rating} onChange={setRating} label={t('rating')} />
        <p className="mt-2 font-semibold text-maroon">{t(`scale.${rating as 1 | 2 | 3 | 4 | 5}`)}</p>
      </div>
      {dishes.length > 0 ? (
        <div>
          <p className="mb-2 text-sm font-semibold text-ink">{t('liked')}</p>
          <div className="flex flex-wrap gap-2">
            {dishes.map((d) => (
              <Chip key={d.name} active={liked.includes(d.name)} onClick={() => setLiked((prev) => (prev.includes(d.name) ? prev.filter((x) => x !== d.name) : [...prev, d.name]))}>
                {localizedName(locale, d.name, d.nameEn)}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}
      <label className="block">
        <span className="mb-1.5 block text-sm font-semibold text-ink">{t('comment')}</span>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('commentPlaceholder')} rows={4} maxLength={1000} className={`${inputClass} resize-none`} />
      </label>
      <Button type="submit" size="lg" className="w-full" loading={submit.isPending}>
        {t('submit')}
      </Button>
    </form>
  );
}
