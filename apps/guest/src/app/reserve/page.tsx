'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Armchair, CalendarCheck, CalendarDays, Check, ChevronRight, Clock, Crown, MapPin, PartyPopper, Pencil, Phone, Sun, Trees, Users, UtensilsCrossed } from 'lucide-react';
import { normalizeVnPhone } from '@dalan/domain';
import { api, ApiError, isNotFound } from '@/lib/api';
import { BRANCHES } from '@/lib/branches';
import { useCustomer } from '@/lib/customer-store';
import { cn } from '@/lib/format';
import { BranchMonogram } from '@/components/BranchPicker';
import { Button, Field, LinkButton, PageTitle, QuantityStepper, inputClass, useToast } from '@/components/ui';

interface PublicBranch {
  id: string;
  code: string;
  name: string;
  phone: string | null;
}

type Seating = 'HALL' | 'VIP_ROOM' | 'OUTDOOR';
const STEP_KEYS = ['branch', 'datetime', 'party', 'contact', 'review'] as const;
const LUNCH = ['10:30', '11:00', '11:30', '12:00', '12:30', '13:00'];
const DINNER = ['17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30'];
const PARTY_QUICK = [2, 4, 6, 8, 10, 20];
const REQUEST_TAGS = ['birthday', 'anniversary', 'business', 'babyChair'] as const;

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function todayIso(): string {
  return isoDate(new Date());
}
/** Giờ đã qua (đệm 30 phút) nếu chọn ngày hôm nay. */
function isPastSlot(date: string, slot: string): boolean {
  if (date !== todayIso()) return false;
  const now = new Date();
  const [h, m] = slot.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0) < now.getHours() * 60 + now.getMinutes() + 30;
}
/** Sau 20:00 thì mặc định đặt cho ngày mai. */
function defaultDate(): string {
  const d = new Date();
  if (d.getHours() >= 20) d.setDate(d.getDate() + 1);
  return isoDate(d);
}

export default function ReservePage() {
  const t = useTranslations('reserve');
  const tc = useTranslations('common');
  const locale = useLocale();
  const toast = useToast((s) => s.show);
  const customer = useCustomer();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    branchCode: 'CENTER',
    date: defaultDate(),
    time: '18:30',
    partySize: 4,
    seating: 'HALL' as Seating,
    name: customer.fullName ?? '',
    phone: customer.phone ?? '',
    requests: '',
  });
  const [result, setResult] = useState<'ok' | 'unavailable' | null>(null);
  const [phoneError, setPhoneError] = useState(false);
  const branch = BRANCHES.find((b) => b.code === form.branchCode) ?? BRANCHES[0]!;
  // Danh sách cơ sở từ API (để lấy id); nếu API chưa sẵn sàng thì vẫn hiển thị form với dữ liệu tĩnh.
  const publicBranches = useQuery({ queryKey: ['public-branches'], queryFn: () => api<PublicBranch[]>('/public/branches'), staleTime: 300_000, retry: false });

  const seatingLabel = (s: Seating) => (s === 'VIP_ROOM' ? t('seatingVip') : s === 'OUTDOOR' ? t('seatingOutdoor') : t('seatingHall'));

  const submit = useMutation({
    mutationFn: async () => {
      const phone = normalizeVnPhone(form.phone);
      if (!phone) throw new ApiError(400, 'INVALID_PHONE', t('invalidPhone'));
      const target = publicBranches.data?.find((b) => b.code === form.branchCode);
      if (!target) throw new ApiError(404, 'NOT_FOUND', 'Chưa có dịch vụ đặt bàn online');
      return api('/public/reservations', {
        body: {
          branchId: target.id,
          reservedAt: `${form.date}T${form.time}:00+07:00`,
          partySize: form.partySize,
          customerName: form.name.trim(),
          customerPhone: phone,
          specialRequests: [`${t('seating')}: ${seatingLabel(form.seating)}`, form.requests.trim()].filter(Boolean).join('. ').slice(0, 500),
          source: 'WEB',
        },
      });
    },
    onSuccess: () => setResult('ok'),
    onError: (err) => {
      if (isNotFound(err)) setResult('unavailable');
      else toast(err instanceof ApiError ? err.message : tc('errorGeneric'), 'error');
    },
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const dateLabel = useMemo(() => {
    const d = new Date(`${form.date}T00:00:00`);
    return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'vi-VN', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  }, [form.date, locale]);

  const canNext = [true, !!form.date && !!form.time && !isPastSlot(form.date, form.time), form.partySize >= 1, form.name.trim().length > 0 && form.phone.trim().length > 0, true][step];

  const next = () => {
    if (step === 3) {
      if (!normalizeVnPhone(form.phone)) {
        setPhoneError(true);
        return;
      }
      setPhoneError(false);
    }
    setStep((s) => Math.min(4, s + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const back = () => setStep((s) => Math.max(0, s - 1));

  if (result === 'ok') {
    return (
      <div className="animate-rise py-4 text-center">
        <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success text-white shadow-lift">
          <CalendarCheck className="h-9 w-9" />
        </span>
        <h1 className="mt-5 font-serif text-[28px] font-bold text-ink">{t('successTitle')}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">{t('success')}</p>
        <Summary form={form} branchName={branch.name} dateLabel={dateLabel} seatingLabel={seatingLabel(form.seating)} />
        <div className="mt-5 grid grid-cols-1 gap-2.5">
          <LinkButton href="/" size="lg">
            {tc('goHome')}
          </LinkButton>
          <div className="grid grid-cols-2 gap-2.5">
            <LinkButton href={`/menu/${branch.code}`} variant="secondary">
              <UtensilsCrossed className="h-4 w-4" />
              {tc('viewMenu')}
            </LinkButton>
            <a href={`tel:${branch.phone}`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-paper font-semibold text-maroon ring-1 ring-maroon/25">
              <Phone className="h-4 w-4" />
              {tc('call')}
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageTitle eyebrow={t('stepOf', { step: step + 1, total: STEP_KEYS.length })} title={t('title')} subtitle={t(`steps.${STEP_KEYS[step]}`)} />

      <div className="mb-6 grid grid-cols-5 gap-1.5" aria-hidden>
        {STEP_KEYS.map((k, i) => (
          <span key={k} className={cn('h-1.5 rounded-full transition-colors duration-300', i <= step ? 'bg-maroon' : 'bg-cream-dark')} />
        ))}
      </div>

      {result === 'unavailable' ? (
        <div className="mb-5 rounded-3xl bg-warn-soft p-4">
          <p className="text-sm text-warn">{t('unavailable', { phone: branch.phone })}</p>
          <a href={`tel:${branch.phone}`} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-maroon px-4 font-semibold text-white">
            <Phone className="h-4 w-4" /> {t('callNow')}
          </a>
        </div>
      ) : null}

      <div key={step} className="animate-rise">
        {step === 0 ? (
          <ul className="grid grid-cols-1 gap-3">
            {BRANCHES.map((b) => {
              const on = form.branchCode === b.code;
              return (
                <li key={b.code}>
                  <button
                    type="button"
                    onClick={() => set('branchCode', b.code)}
                    aria-pressed={on}
                    className={cn('flex w-full items-center gap-4 rounded-3xl bg-paper p-4 text-left shadow-card transition', on ? 'ring-2 ring-maroon' : 'ring-1 ring-line-soft')}
                  >
                    <BranchMonogram code={b.code} className="h-12 w-12 text-xl" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-serif text-lg font-bold text-ink">{b.name}</span>
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{b.address}</span>
                      </span>
                    </span>
                    <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2', on ? 'border-maroon bg-maroon text-white' : 'border-line')}>{on ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        {step === 1 ? <DateTimeStep date={form.date} time={form.time} onDate={(v) => set('date', v)} onTime={(v) => set('time', v)} /> : null}

        {step === 2 ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between rounded-3xl bg-paper p-4 shadow-card ring-1 ring-line-soft">
              <span className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-maroon-soft text-maroon">
                  <Users className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-semibold text-ink">{t('partySize')}</span>
                  <span className="block text-xs text-ink-muted">{t('guestsCount', { count: form.partySize })}</span>
                </span>
              </span>
              <QuantityStepper value={form.partySize} onChange={(v) => set('partySize', Math.min(500, Math.max(1, v)))} max={500} label={t('partySize')} />
            </div>
            <div className="grid grid-cols-6 gap-2">
              {PARTY_QUICK.map((n) => (
                <button key={n} type="button" onClick={() => set('partySize', n)} className={cn('tabular min-h-11 rounded-2xl font-semibold ring-1 transition', form.partySize === n ? 'bg-maroon text-white ring-maroon' : 'bg-paper text-ink-soft ring-line')}>
                  {n}
                </button>
              ))}
            </div>
            <Field label={t('otherCount')}>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={500}
                value={form.partySize}
                onChange={(e) => set('partySize', Math.min(500, Math.max(1, Number(e.target.value) || 1)))}
                className={cn(inputClass, 'tabular')}
              />
            </Field>
            {form.partySize >= 30 ? (
              <div className="flex items-start gap-3 rounded-3xl bg-gold-soft p-4 text-sm">
                <PartyPopper className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
                <p className="text-ink-soft">
                  {t('largeParty')}{' '}
                  <a href={`tel:${branch.phone}`} className="font-semibold text-maroon underline underline-offset-2">
                    {branch.phone}
                  </a>
                </p>
              </div>
            ) : null}
            <fieldset>
              <legend className="mb-2.5 text-base font-bold text-ink">{t('seating')}</legend>
              <div className="grid grid-cols-3 gap-2.5">
                {(
                  [
                    { v: 'HALL', icon: Armchair },
                    { v: 'VIP_ROOM', icon: Crown },
                    { v: 'OUTDOOR', icon: Trees },
                  ] as const
                ).map(({ v, icon: Icon }) => {
                  const on = form.seating === v;
                  return (
                    <button key={v} type="button" onClick={() => set('seating', v)} aria-pressed={on} className={cn('flex min-h-24 flex-col items-center justify-center gap-2 rounded-3xl p-3 text-center text-sm font-semibold transition', on ? 'bg-maroon-soft text-maroon ring-2 ring-maroon' : 'bg-paper text-ink-soft ring-1 ring-line')}>
                      <Icon className="h-6 w-6" />
                      {seatingLabel(v)}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4">
            <Field label={t('name')}>
              <input value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={100} className={inputClass} autoComplete="name" required />
            </Field>
            <Field label={t('phone')} hint={phoneError ? t('invalidPhone') : t('phoneHint')}>
              <input
                type="tel"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => {
                  set('phone', e.target.value);
                  setPhoneError(false);
                }}
                placeholder="0912 345 678"
                autoComplete="tel"
                className={cn(inputClass, phoneError && 'border-danger! ring-4 ring-danger/10')}
                aria-invalid={phoneError}
                required
              />
            </Field>
            <div>
              <span className="mb-1.5 block text-sm font-semibold text-ink">{t('requests')}</span>
              <div className="mb-2 flex flex-wrap gap-2">
                {REQUEST_TAGS.map((k) => (
                  <button key={k} type="button" onClick={() => set('requests', [form.requests.trim(), t(`tags.${k}`)].filter(Boolean).join(', ').slice(0, 450))} className="min-h-10 rounded-full bg-paper px-3.5 text-sm font-medium text-ink-soft ring-1 ring-line hover:ring-maroon/40">
                    + {t(`tags.${k}`)}
                  </button>
                ))}
              </div>
              <textarea value={form.requests} onChange={(e) => set('requests', e.target.value)} placeholder={t('requestsPlaceholder')} rows={3} maxLength={450} className={cn(inputClass, 'resize-none')} aria-label={t('requests')} />
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div>
            <Summary form={form} branchName={branch.name} dateLabel={dateLabel} seatingLabel={seatingLabel(form.seating)} onEdit={setStep} />
            <p className="mt-3 text-center text-xs leading-relaxed text-ink-muted">{t('policy')}</p>
          </div>
        ) : null}
      </div>

      <div className="sticky z-10 mt-8 flex gap-2.5 rounded-3xl bg-cream/90 py-2 backdrop-blur" style={{ bottom: 'calc(var(--nav-h) + var(--safe-bottom) + 0.5rem)' }}>
        {step > 0 ? (
          <Button variant="secondary" size="lg" onClick={back} className="px-5">
            {tc('back')}
          </Button>
        ) : null}
        {step < 4 ? (
          <Button size="lg" className="flex-1" onClick={next} disabled={!canNext}>
            {tc('continue')}
            <ChevronRight className="h-5 w-5" />
          </Button>
        ) : (
          <Button size="lg" className="flex-1" onClick={() => submit.mutate()} loading={submit.isPending}>
            <CalendarCheck className="h-5 w-5" />
            {t('submit')}
          </Button>
        )}
      </div>
    </div>
  );
}

function DateTimeStep({ date, time, onDate, onTime }: { date: string; time: string; onDate: (v: string) => void; onTime: (v: string) => void }) {
  const t = useTranslations('reserve');
  const locale = useLocale();
  const days = useMemo(() => {
    const out: { iso: string; weekday: string; day: string; month: string }[] = [];
    const base = new Date();
    const fmtW = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'vi-VN', { weekday: 'short' });
    for (let i = 0; i < 14; i++) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      out.push({ iso: isoDate(d), weekday: i === 0 ? t('today') : i === 1 ? t('tomorrow') : fmtW.format(d), day: String(d.getDate()), month: `${t('monthShort')} ${d.getMonth() + 1}` });
    }
    return out;
  }, [locale, t]);
  // Không cho chọn giờ đã qua trong hôm nay
  const isPast = (slot: string) => isPastSlot(date, slot);

  const slotGroup = (label: string, icon: ReactNode, slots: string[]) => (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink-soft">
        {icon}
        {label}
      </p>
      <div className="grid grid-cols-4 gap-2">
        {slots.map((s) => {
          const on = time === s;
          const past = isPast(s);
          return (
            <button key={s} type="button" disabled={past} onClick={() => onTime(s)} className={cn('tabular min-h-11 rounded-2xl text-sm font-semibold ring-1 transition disabled:opacity-35', on ? 'bg-maroon text-white ring-maroon' : 'bg-paper text-ink ring-line hover:ring-maroon/40')}>
              {s}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-base font-bold text-ink">
          <CalendarDays className="h-4.5 w-4.5 text-maroon" />
          {t('date')}
        </p>
        <div className="no-scrollbar -mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-1">
          {days.map((d) => {
            const on = d.iso === date;
            return (
              <button key={d.iso} type="button" onClick={() => onDate(d.iso)} aria-pressed={on} className={cn('flex w-16 shrink-0 snap-start flex-col items-center rounded-2xl py-2.5 ring-1 transition', on ? 'bg-maroon text-white shadow-md ring-maroon' : 'bg-paper text-ink ring-line')}>
                <span className={cn('text-[11px] font-semibold', on ? 'text-white/80' : 'text-ink-muted')}>{d.weekday}</span>
                <span className="tabular font-serif text-2xl font-bold">{d.day}</span>
                <span className={cn('text-[10px]', on ? 'text-white/75' : 'text-ink-muted')}>{d.month}</span>
              </button>
            );
          })}
        </div>
        <input type="date" min={todayIso()} value={date} onChange={(e) => e.target.value && onDate(e.target.value)} className={cn(inputClass, 'mt-2')} aria-label={t('otherDate')} />
      </div>
      <div className="space-y-4">
        <p className="flex items-center gap-1.5 text-base font-bold text-ink">
          <Clock className="h-4.5 w-4.5 text-maroon" />
          {t('time')}
        </p>
        {slotGroup(t('lunch'), <Sun className="h-4 w-4" />, LUNCH)}
        {slotGroup(t('dinner'), <UtensilsCrossed className="h-4 w-4" />, DINNER)}
        <Field label={t('otherTime')}>
          <input type="time" step={900} value={time} onChange={(e) => onTime(e.target.value)} className={inputClass} />
        </Field>
      </div>
    </div>
  );
}

function Summary({
  form,
  branchName,
  dateLabel,
  seatingLabel,
  onEdit,
}: {
  form: { date: string; time: string; partySize: number; name: string; phone: string; requests: string };
  branchName: string;
  dateLabel: string;
  seatingLabel: string;
  onEdit?: (step: number) => void;
}) {
  const t = useTranslations('reserve');
  const rows: { step: number; icon: typeof MapPin; label: string; value: string }[] = [
    { step: 0, icon: MapPin, label: t('branch'), value: branchName },
    { step: 1, icon: CalendarDays, label: t('when'), value: `${form.time} · ${dateLabel}` },
    { step: 2, icon: Users, label: t('partySize'), value: `${t('guestsCount', { count: form.partySize })} · ${seatingLabel}` },
    { step: 3, icon: Phone, label: t('contact'), value: `${form.name} · ${form.phone}` },
  ];
  return (
    <div className="mt-5 overflow-hidden rounded-3xl bg-paper text-left shadow-card ring-1 ring-line-soft">
      {rows.map(({ step, icon: Icon, label, value }, i) => (
        <div key={step} className={cn('flex items-center gap-3 px-4 py-3.5', i > 0 && 'border-t border-line-soft')}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-maroon-soft text-maroon">
            <Icon className="h-4.5 w-4.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-ink-muted">{label}</span>
            <span className="block font-semibold text-ink first-letter:uppercase">{value}</span>
          </span>
          {onEdit ? (
            <button type="button" onClick={() => onEdit(step)} className="flex h-10 w-10 items-center justify-center rounded-full text-ink-muted hover:bg-cream hover:text-maroon" aria-label={t('edit')}>
              <Pencil className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      ))}
      {form.requests.trim() ? <p className="border-t border-line-soft px-4 py-3 text-sm text-ink-soft italic">“{form.requests.trim()}”</p> : null}
    </div>
  );
}
