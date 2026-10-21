'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Phone } from 'lucide-react';
import { normalizeVnPhone } from '@dalan/domain';
import { api, ApiError, isNotFound } from '@/lib/api';
import { BRANCHES } from '@/lib/branches';

interface PublicBranch {
  id: string;
  code: string;
  name: string;
  phone: string | null;
}
import { Button, Card, Field, inputClass, useToast } from '@/components/ui';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function ReservePage() {
  const t = useTranslations('reserve');
  const tc = useTranslations('common');
  const toast = useToast((s) => s.show);
  const [form, setForm] = useState({ branchCode: 'CENTER', date: todayIso(), time: '18:30', partySize: 4, seating: 'HALL', name: '', phone: '', requests: '' });
  const [result, setResult] = useState<'ok' | 'unavailable' | null>(null);
  const branch = BRANCHES.find((b) => b.code === form.branchCode) ?? BRANCHES[0]!;
  // Danh sách cơ sở từ API (để lấy id); nếu API chưa sẵn sàng thì vẫn hiển thị form với dữ liệu tĩnh.
  const publicBranches = useQuery({ queryKey: ['public-branches'], queryFn: () => api<PublicBranch[]>('/public/branches'), staleTime: 300_000, retry: false });

  const submit = useMutation({
    mutationFn: async () => {
      const phone = normalizeVnPhone(form.phone);
      if (!phone) throw new ApiError(400, 'INVALID_PHONE', 'Số điện thoại không hợp lệ');
      const target = publicBranches.data?.find((b) => b.code === form.branchCode);
      if (!target) throw new ApiError(404, 'NOT_FOUND', 'Chưa có dịch vụ đặt bàn online');
      const seatingLabel = form.seating === 'VIP_ROOM' ? t('seatingVip') : form.seating === 'OUTDOOR' ? t('seatingOutdoor') : t('seatingHall');
      return api('/public/reservations', {
        body: {
          branchId: target.id,
          reservedAt: `${form.date}T${form.time}:00+07:00`,
          partySize: form.partySize,
          customerName: form.name.trim(),
          customerPhone: phone,
          specialRequests: [`${t('seating')}: ${seatingLabel}`, form.requests.trim()].filter(Boolean).join('. ').slice(0, 500),
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

  if (result === 'ok') {
    return (
      <Card className="text-center">
        <p className="font-bold text-success">{t('success')}</p>
      </Card>
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
      <h1 className="text-xl font-bold">{t('title')}</h1>
      {result === 'unavailable' ? (
        <Card className="bg-warn-soft">
          <p className="text-sm text-warn">{t('unavailable', { phone: branch.phone })}</p>
          <a href={`tel:${branch.phone}`} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl bg-maroon px-4 font-semibold text-white">
            <Phone className="h-4 w-4" /> {t('callNow')}
          </a>
        </Card>
      ) : null}
      <Field label={t('branch')}>
        <select value={form.branchCode} onChange={(e) => set('branchCode', e.target.value)} className={inputClass}>
          {BRANCHES.map((b) => (
            <option key={b.code} value={b.code}>
              {b.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('date')}>
          <input type="date" min={todayIso()} value={form.date} onChange={(e) => set('date', e.target.value)} className={inputClass} required />
        </Field>
        <Field label={t('time')}>
          <input type="time" step={900} value={form.time} onChange={(e) => set('time', e.target.value)} className={inputClass} required />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('partySize')}>
          <input type="number" min={1} max={500} value={form.partySize} onChange={(e) => set('partySize', Number(e.target.value))} className={inputClass} required />
        </Field>
        <Field label={t('seating')}>
          <select value={form.seating} onChange={(e) => set('seating', e.target.value)} className={inputClass}>
            <option value="HALL">{t('seatingHall')}</option>
            <option value="VIP_ROOM">{t('seatingVip')}</option>
            <option value="OUTDOOR">{t('seatingOutdoor')}</option>
          </select>
        </Field>
      </div>
      <Field label={t('name')}>
        <input value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={100} className={inputClass} required />
      </Field>
      <Field label={t('phone')}>
        <input type="tel" inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputClass} required />
      </Field>
      <Field label={t('requests')}>
        <textarea value={form.requests} onChange={(e) => set('requests', e.target.value)} placeholder={t('requestsPlaceholder')} rows={3} maxLength={500} className={inputClass} />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={submit.isPending}>
        {t('submit')}
      </Button>
    </form>
  );
}
