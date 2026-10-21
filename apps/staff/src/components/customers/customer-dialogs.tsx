'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { ApiError, errorMessage } from '@/lib/api';
import { useBranchId } from '@/lib/auth-store';
import { keys, useAction, useFloor } from '@/lib/queries';
import { customerApi, opsKeys, useCustomers, useTiers, type CustomerDetail, type CustomerSummary } from '@/lib/queries-ops';
import { emptyToNull, emptyToUndef, phoneDisplay, toVnIso } from '@/lib/ops-utils';
import { cn, money, moneyPlain } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Badge, Input, Loading, Segmented, Select, Textarea } from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';
import { Checkbox, MoneyInput, NumberInput, useDebounced } from '@/components/ops/ui';

const GENDERS = [
  { value: '', label: 'Không rõ' },
  { value: 'M', label: 'Nam' },
  { value: 'F', label: 'Nữ' },
  { value: 'O', label: 'Khác' },
];

const parseTags = (s: string) => [...new Set(s.split(',').map((t) => t.trim()).filter(Boolean))];

/** Chọn một hồ sơ khách bằng tìm kiếm (dùng cho gộp hồ sơ). */
export function CustomerPicker({ onPick, excludeId, selectedId }: { onPick: (c: CustomerSummary) => void; excludeId?: string; selectedId?: string | null }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 300);
  const res = useCustomers({ q: dq || undefined, pageSize: 8 });
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-ink-300" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tên, số điện thoại" className="pl-10" />
      </div>
      <div className="max-h-64 divide-y divide-ink-100 overflow-y-auto rounded-xl border border-ink-100">
        {res.isLoading && <Loading />}
        {(res.data?.items ?? [])
          .filter((c) => c.id !== excludeId)
          .map((c) => (
            <button key={c.id} type="button" onClick={() => onPick(c)} className={cn('flex w-full items-center gap-2 px-3 py-2 text-left', selectedId === c.id ? 'bg-brand-50' : 'hover:bg-paper')}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{c.fullName ?? 'Chưa có tên'}</span>
                <span className="text-xs text-ink-500">
                  {phoneDisplay(c.phone)} · {c.visitCount} lần ghé · {moneyPlain(c.pointsBalance)} điểm
                </span>
              </span>
              {c.tier && <Badge tone="brand">{c.tier.name}</Badge>}
            </button>
          ))}
      </div>
    </div>
  );
}

// ───────────────────────── Tạo / sửa hồ sơ ─────────────────────────

interface FormState {
  phone: string;
  fullName: string;
  email: string;
  birthday: string;
  gender: string;
  companyName: string;
  taxCode: string;
  companyAddress: string;
  tags: string;
  notes: string;
  allergies: string;
  preferences: string;
  marketingConsent: boolean;
  tierId: string;
}

function toForm(c?: CustomerSummary | CustomerDetail | null): FormState {
  return {
    phone: c ? c.phone.replace(/^\+84/, '0') : '',
    fullName: c?.fullName ?? '',
    email: c?.email ?? '',
    birthday: c?.birthday ? c.birthday.slice(0, 10) : '',
    gender: c?.gender ?? '',
    companyName: c?.companyName ?? '',
    taxCode: c?.taxCode ?? '',
    companyAddress: c?.companyAddress ?? '',
    tags: (c?.tags ?? []).join(', '),
    notes: c?.notes ?? '',
    allergies: c?.allergies ?? '',
    preferences: c?.preferences ?? '',
    marketingConsent: c?.marketingConsent ?? false,
    tierId: c?.tierId ?? '',
  };
}

function CustomerFields({ f, set, phoneLocked, showTier }: { f: FormState; set: <K extends keyof FormState>(k: K, v: FormState[K]) => void; phoneLocked: boolean; showTier: boolean }) {
  const tiers = useTiers();
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Số điện thoại" value={f.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" disabled={phoneLocked} hint={phoneLocked ? 'Bạn không có quyền xem/sửa số đầy đủ' : undefined} />
        <Input label="Họ tên" value={f.fullName} onChange={(e) => set('fullName', e.target.value)} />
        <Input label="Email" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
        <Input label="Ngày sinh" type="date" value={f.birthday} onChange={(e) => set('birthday', e.target.value)} />
        <Select label="Giới tính" value={f.gender} onChange={(e) => set('gender', e.target.value)}>
          {GENDERS.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </Select>
        {showTier ? (
          <Select label="Hạng thành viên" value={f.tierId} onChange={(e) => set('tierId', e.target.value)}>
            <option value="">Chưa xếp hạng</option>
            {(tiers.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        ) : (
          <div />
        )}
        <Input label="Công ty (xuất hóa đơn)" value={f.companyName} onChange={(e) => set('companyName', e.target.value)} />
        <Input label="Mã số thuế" value={f.taxCode} onChange={(e) => set('taxCode', e.target.value)} />
      </div>
      <Input label="Địa chỉ công ty" value={f.companyAddress} onChange={(e) => set('companyAddress', e.target.value)} />
      <Input label="Nhãn (phân cách bằng dấu phẩy)" value={f.tags} onChange={(e) => set('tags', e.target.value)} placeholder="VIP, doanh-nghiep, lu-hanh" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Textarea label="Dị ứng" value={f.allergies} onChange={(e) => set('allergies', e.target.value)} />
        <Textarea label="Sở thích" value={f.preferences} onChange={(e) => set('preferences', e.target.value)} />
      </div>
      <Textarea label="Ghi chú" value={f.notes} onChange={(e) => set('notes', e.target.value)} />
      <Checkbox label="Đồng ý nhận tin ưu đãi (ZNS/SMS)" checked={f.marketingConsent} onChange={(v) => set('marketingConsent', v)} hint="Theo Nghị định 13/2023: chỉ đánh dấu khi khách đồng ý rõ ràng" />
    </div>
  );
}

export function CreateCustomerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState<FormState>(toForm());
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));
  const create = useAction((body: Record<string, unknown>) => customerApi.create(body), () => [opsKeys.customersAll]);
  const submit = () => {
    const body: Record<string, unknown> = {
      phone: f.phone.trim(),
      fullName: emptyToUndef(f.fullName),
      email: emptyToUndef(f.email),
      birthday: emptyToUndef(f.birthday),
      gender: f.gender || undefined,
      companyName: emptyToUndef(f.companyName),
      taxCode: emptyToUndef(f.taxCode),
      companyAddress: emptyToUndef(f.companyAddress),
      tags: parseTags(f.tags),
      notes: emptyToUndef(f.notes),
      allergies: emptyToUndef(f.allergies),
      preferences: emptyToUndef(f.preferences),
      marketingConsent: f.marketingConsent,
    };
    create.mutate(body, {
      onSuccess: (c) => {
        toast.success('Đã tạo hồ sơ khách');
        setF(toForm());
        onClose();
        router.push(`/customers/${c.id}`);
      },
      onError: (e) => {
        if (e instanceof ApiError && e.code === 'CUSTOMER_EXISTS') {
          const id = (e.details as { customerId?: string } | undefined)?.customerId;
          toast.warning('Số điện thoại đã có hồ sơ, mở hồ sơ hiện có');
          if (id) {
            onClose();
            router.push(`/customers/${id}`);
          }
          return;
        }
        toast.error(errorMessage(e));
      },
    });
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Thêm khách hàng"
      size="lg"
      footer={
        <Button block onClick={submit} loading={create.isPending} disabled={f.phone.replace(/\D/g, '').length < 9}>
          Tạo hồ sơ
        </Button>
      }
    >
      <CustomerFields f={f} set={set} phoneLocked={false} showTier={false} />
    </Dialog>
  );
}

/** Sửa hồ sơ: chỉ gửi các trường đã thay đổi (PATCH không đặt lại trường khác). */
export function EditCustomerDialog({ customer, onClose }: { customer: CustomerDetail; onClose: () => void }) {
  const initial = toForm(customer);
  const [f, setF] = useState<FormState>(initial);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));
  const save = useAction((body: Record<string, unknown>) => customerApi.update(customer.id, body), () => [opsKeys.customer(customer.id), opsKeys.customersAll], () => {
    toast.success('Đã lưu hồ sơ');
    onClose();
  });
  const submit = () => {
    const body: Record<string, unknown> = {};
    if (!customer.phoneMasked && f.phone !== initial.phone) body.phone = f.phone.trim();
    if (f.fullName !== initial.fullName) body.fullName = f.fullName.trim();
    if (f.email !== initial.email) body.email = emptyToNull(f.email);
    if (f.birthday !== initial.birthday) body.birthday = emptyToNull(f.birthday);
    if (f.gender !== initial.gender && f.gender) body.gender = f.gender;
    if (f.companyName !== initial.companyName) body.companyName = emptyToNull(f.companyName);
    if (f.taxCode !== initial.taxCode) body.taxCode = emptyToNull(f.taxCode);
    if (f.companyAddress !== initial.companyAddress) body.companyAddress = emptyToNull(f.companyAddress);
    if (parseTags(f.tags).join('|') !== parseTags(initial.tags).join('|')) body.tags = parseTags(f.tags);
    if (f.notes !== initial.notes) body.notes = emptyToNull(f.notes);
    if (f.allergies !== initial.allergies) body.allergies = emptyToNull(f.allergies);
    if (f.preferences !== initial.preferences) body.preferences = emptyToNull(f.preferences);
    if (f.marketingConsent !== initial.marketingConsent) body.marketingConsent = f.marketingConsent;
    if (f.tierId !== initial.tierId) body.tierId = f.tierId || null;
    if (Object.keys(body).length === 0) {
      toast.info('Không có thay đổi');
      return onClose();
    }
    save.mutate(body, { onError: (e) => toast.error(errorMessage(e)) });
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Sửa hồ sơ khách"
      size="lg"
      footer={
        <Button block onClick={submit} loading={save.isPending}>
          Lưu thay đổi
        </Button>
      }
    >
      <CustomerFields f={f} set={set} phoneLocked={customer.phoneMasked} showTier />
    </Dialog>
  );
}

// ───────────────────────── Điểm, voucher, gộp, gắn bàn ─────────────────────────

export function PointsDialog({ customer, onClose }: { customer: CustomerDetail; onClose: () => void }) {
  const [sign, setSign] = useState<'+' | '-'>('+');
  const [points, setPoints] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const delta = (points ?? 0) * (sign === '+' ? 1 : -1);
  const adjust = useAction(() => customerApi.adjustPoints(customer.id, delta, reason.trim()), () => [opsKeys.customer(customer.id), opsKeys.customersAll], (r) => {
    toast.success(`Số dư mới: ${moneyPlain(r.pointsBalance)} điểm`);
    onClose();
  });
  const after = customer.pointsBalance + delta;
  return (
    <Dialog
      open
      onClose={onClose}
      title="Điều chỉnh điểm"
      size="sm"
      footer={
        <Button block onClick={() => adjust.mutate(undefined, { onError: (e) => toast.error(errorMessage(e)) })} loading={adjust.isPending} disabled={!points || !reason.trim() || after < 0}>
          {sign === '+' ? 'Cộng' : 'Trừ'} {moneyPlain(points ?? 0)} điểm
        </Button>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-ink-700">
          Số dư hiện tại: <b>{moneyPlain(customer.pointsBalance)}</b> điểm
        </p>
        <Segmented
          value={sign}
          onChange={setSign}
          options={[
            { value: '+', label: 'Cộng điểm' },
            { value: '-', label: 'Trừ điểm' },
          ]}
        />
        <NumberInput label="Số điểm" value={points} onChange={(v) => setPoints(v === null ? null : Math.abs(Math.round(v)))} min={1} step={1} />
        <Input label="Lý do (bắt buộc)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Bù điểm hóa đơn, quà tặng, sửa sai..." />
        <p className={cn('text-sm', after < 0 ? 'text-red-700' : 'text-ink-500')}>Sau điều chỉnh: {moneyPlain(after)} điểm{after < 0 ? ' (không được âm)' : ''}</p>
      </div>
    </Dialog>
  );
}

export function VoucherDialog({ customer, onClose }: { customer: CustomerDetail; onClose: () => void }) {
  const [kind, setKind] = useState<'PERCENT' | 'AMOUNT'>('PERCENT');
  const [percent, setPercent] = useState<number | null>(10);
  const [amount, setAmount] = useState<number | null>(100_000);
  const [minBill, setMinBill] = useState<number | null>(null);
  const [maxDiscount, setMaxDiscount] = useState<number | null>(null);
  const [validTo, setValidTo] = useState('');
  const [usageLimit, setUsageLimit] = useState<number | null>(1);
  const [code, setCode] = useState('');
  const create = useAction((body: Record<string, unknown>) => customerApi.createVoucher(body), () => [opsKeys.customer(customer.id)], (vs) => {
    toast.success(`Đã tặng voucher ${vs[0]?.code ?? ''}`);
    onClose();
  });
  const value = kind === 'PERCENT' ? Math.round((percent ?? 0) * 100) : (amount ?? 0);
  const submit = () =>
    create.mutate(
      {
        kind,
        value,
        customerId: customer.id,
        usageLimit: usageLimit ?? 1,
        ...(code.trim() ? { code: code.trim().toUpperCase() } : {}),
        ...(minBill ? { minBill } : {}),
        ...(maxDiscount && kind === 'PERCENT' ? { maxDiscount } : {}),
        ...(validTo ? { validTo: toVnIso(validTo, '23:59') } : {}),
      },
      { onError: (e) => toast.error(errorMessage(e)) },
    );
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Tặng voucher cho ${customer.fullName ?? 'khách'}`}
      size="md"
      footer={
        <Button block onClick={submit} loading={create.isPending} disabled={value <= 0 || (kind === 'PERCENT' && value > 10_000)}>
          Tạo voucher
        </Button>
      }
    >
      <div className="space-y-3">
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: 'PERCENT', label: 'Giảm theo %' },
            { value: 'AMOUNT', label: 'Giảm số tiền' },
          ]}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          {kind === 'PERCENT' ? <NumberInput label="Phần trăm giảm" value={percent} onChange={setPercent} min={1} suffix="%" /> : <MoneyInput label="Số tiền giảm" value={amount} onChange={setAmount} />}
          {kind === 'PERCENT' && <MoneyInput label="Giảm tối đa" value={maxDiscount} onChange={setMaxDiscount} />}
          <MoneyInput label="Hóa đơn tối thiểu" value={minBill} onChange={setMinBill} />
          <Input label="Hạn dùng" type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
          <NumberInput label="Số lần dùng" value={usageLimit} onChange={setUsageLimit} min={1} step={1} />
          <Input label="Mã (để trống: tự sinh)" value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        <p className="text-sm text-ink-500">
          Voucher gắn với hồ sơ khách, dùng được ở mọi cơ sở. {kind === 'AMOUNT' && amount ? `Giảm ${money(amount)}.` : ''}
        </p>
      </div>
    </Dialog>
  );
}

export function MergeDialog({ open, onClose, target: presetTarget }: { open: boolean; onClose: () => void; target?: CustomerSummary | null }) {
  const router = useRouter();
  const [source, setSource] = useState<CustomerSummary | null>(null);
  const [target, setTarget] = useState<CustomerSummary | null>(presetTarget ?? null);
  const merge = useAction(() => customerApi.merge(source!.id, target!.id), () => [opsKeys.customersAll, opsKeys.customer(target?.id ?? ''), opsKeys.customer(source?.id ?? '')], (c) => {
    toast.success('Đã gộp hồ sơ');
    onClose();
    router.push(`/customers/${c.id}`);
  });
  const card = (c: CustomerSummary | null, label: string) => (
    <div className={cn('rounded-xl border p-3 text-sm', c ? 'border-ink-100 bg-paper' : 'border-dashed border-ink-300 text-ink-500')}>
      <div className="text-xs font-semibold text-ink-500 uppercase">{label}</div>
      {c ? (
        <>
          <div className="font-bold">{c.fullName ?? 'Chưa có tên'}</div>
          <div>
            {phoneDisplay(c.phone)} · {c.visitCount} lần ghé · {moneyPlain(c.pointsBalance)} điểm
          </div>
        </>
      ) : (
        <div>Chưa chọn</div>
      )}
    </div>
  );
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Gộp hồ sơ trùng"
      size="lg"
      footer={
        <Button variant="danger" block onClick={() => merge.mutate(undefined, { onError: (e) => toast.error(errorMessage(e)) })} loading={merge.isPending} disabled={!source || !target || source.id === target.id}>
          Gộp vào hồ sơ giữ lại
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {card(source, 'Hồ sơ bị gộp (sẽ ẩn danh)')}
        {card(target, 'Hồ sơ giữ lại')}
      </div>
      <p className="my-2 text-sm text-ink-700">Toàn bộ lần ghé, hóa đơn, đặt bàn, điểm và voucher của hồ sơ bị gộp chuyển sang hồ sơ giữ lại. Không hoàn tác được.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-sm font-semibold">Chọn hồ sơ bị gộp</div>
          <CustomerPicker onPick={setSource} excludeId={target?.id} selectedId={source?.id} />
        </div>
        {!presetTarget && (
          <div>
            <div className="mb-1 text-sm font-semibold">Chọn hồ sơ giữ lại</div>
            <CustomerPicker onPick={setTarget} excludeId={source?.id} selectedId={target?.id} />
          </div>
        )}
      </div>
    </Dialog>
  );
}

/** Gắn khách vào một phiên bàn đang mở (POST /sessions/:id/customer). */
export function AttachSessionDialog({ customer, onClose }: { customer: CustomerDetail; onClose: () => void }) {
  const router = useRouter();
  const branchId = useBranchId();
  const floor = useFloor();
  const sessions = new Map<string, { id: string; code: string; guestCount: number; tables: string[]; hasCustomer: boolean }>();
  for (const a of floor.data?.areas ?? [])
    for (const t of a.tables) {
      if (!t.session || !['OPEN', 'PENDING', 'BILL_REQUESTED'].includes(t.session.status)) continue;
      const s = sessions.get(t.session.id) ?? { id: t.session.id, code: t.session.code, guestCount: t.session.guestCount, tables: [], hasCustomer: false };
      s.tables.push(t.name);
      sessions.set(t.session.id, s);
    }
  const attach = useAction((sessionId: string) => customerApi.attachToSession(sessionId, { customerId: customer.id }), (sid) => [keys.session(sid), keys.floor(branchId)], (_c, sid) => {
    toast.success('Đã gắn khách vào bàn');
    onClose();
    router.push(`/sessions/${sid}`);
  });
  const list = [...sessions.values()];
  return (
    <Dialog open onClose={onClose} title="Gắn khách vào bàn đang mở" size="md">
      {floor.isLoading && <Loading />}
      {!floor.isLoading && list.length === 0 && <p className="py-6 text-center text-ink-500">Không có bàn nào đang mở.</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {list.map((s) => (
          <button key={s.id} type="button" disabled={attach.isPending} onClick={() => attach.mutate(s.id, { onError: (e) => toast.error(errorMessage(e)) })} className="rounded-xl border border-ink-100 bg-white p-3 text-left hover:border-brand-500">
            <div className="font-bold">{s.tables.join(' + ')}</div>
            <div className="text-sm text-ink-500">
              {s.code} · {s.guestCount} khách
            </div>
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-500">Khách sẽ được tích điểm và áp ưu đãi trên các bill còn mở của bàn.</p>
    </Dialog>
  );
}
