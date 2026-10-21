'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TaxInvoiceInfo } from '@dalan/contracts';
import { api, ApiError } from '@/lib/api';
import { useGuestToken } from '@/lib/guest-data';
import { Button, Field, inputClass, useToast } from './ui';

export function TaxInvoiceForm({ billId, initial }: { billId: string; initial?: Partial<TaxInvoiceInfo> | null }) {
  const t = useTranslations('bill');
  const tc = useTranslations('common');
  const token = useGuestToken();
  const toast = useToast((s) => s.show);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<TaxInvoiceInfo>({
    buyerName: initial?.buyerName ?? '',
    buyerTaxCode: initial?.buyerTaxCode ?? '',
    buyerAddress: initial?.buyerAddress ?? '',
    buyerEmail: initial?.buyerEmail ?? '',
  });
  const save = useMutation({
    mutationFn: () =>
      api(`/bills/${billId}/tax-invoice-info`, {
        method: 'PUT',
        guestToken: token,
        body: { buyerName: form.buyerName, buyerTaxCode: form.buyerTaxCode || undefined, buyerAddress: form.buyerAddress || undefined, buyerEmail: form.buyerEmail || undefined },
      }),
    onSuccess: () => {
      toast(t('taxInvoiceSaved'));
      void queryClient.invalidateQueries({ queryKey: ['bill', billId] });
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : tc('errorGeneric'), 'error'),
  });
  const set = (key: keyof TaxInvoiceInfo) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <p className="text-xs leading-relaxed text-ink-muted">{t('taxInvoiceHint')}</p>
      <Field label={t('buyerName')}>
        <input required maxLength={200} value={form.buyerName} onChange={set('buyerName')} className={inputClass} />
      </Field>
      <Field label={t('buyerTaxCode')}>
        <input inputMode="numeric" maxLength={20} value={form.buyerTaxCode ?? ''} onChange={set('buyerTaxCode')} className={inputClass} />
      </Field>
      <Field label={t('buyerAddress')}>
        <input maxLength={300} value={form.buyerAddress ?? ''} onChange={set('buyerAddress')} className={inputClass} />
      </Field>
      <Field label={t('buyerEmail')}>
        <input type="email" value={form.buyerEmail ?? ''} onChange={set('buyerEmail')} className={inputClass} />
      </Field>
      <Button type="submit" className="w-full" loading={save.isPending}>
        {tc('save')}
      </Button>
    </form>
  );
}
