'use client';

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { VIET_BANKS, buildVietQrPayload, findBankByBin, removeDiacritics } from '@dalan/domain';
import { errorMessage } from '@/lib/api';
import { useBranchId, useCan } from '@/lib/auth-store';
import { adminKeys, settingsAdminApi, useBranchDetail, type BranchDetail } from '@/lib/queries-admin';
import { money } from '@/lib/utils';
import { renderQr } from '@/components/pay/qr-canvas';
import { Button } from '@/components/ui/button';
import { Input, Loading, Segmented, Select, Textarea } from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';
import { BpsInput, Card, IntInput, MoneyInput, Toggle, diffPatch } from '../form';
import { IntegrationsPanel } from './integrations-panel';
import { StationsPrintersPanel } from './stations-printers';

type Tab = 'branch' | 'stations' | 'integrations';

export function SettingsAdmin() {
  const canPrint = useCan('print.manage');
  const canBranchUpdate = useCan('branch.update');
  const canBranchRead = useCan('branch.read');
  const canBranch = canBranchUpdate || canBranchRead;
  const tabs: { value: Tab; label: string }[] = [
    ...(canBranch ? [{ value: 'branch' as Tab, label: 'Cơ sở' }] : []),
    ...(canBranch || canPrint ? [{ value: 'stations' as Tab, label: 'Trạm bếp & máy in' }] : []),
    { value: 'integrations', label: 'Tích hợp' },
  ];
  const [tab, setTab] = useState<Tab>(tabs[0]!.value);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold text-ink-900">Cấu hình</h1>
        <Segmented className="ml-auto" value={tab} onChange={setTab} options={tabs} />
      </div>
      {tab === 'branch' && <BranchSettings />}
      {tab === 'stations' && <StationsPrintersPanel />}
      {tab === 'integrations' && <IntegrationsPanel />}
    </div>
  );
}

interface BranchForm {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  taxCode: string | null;
  businessDayCutoff: string;
  vatRateBps: number;
  priceIncludesVat: boolean;
  serviceChargeBps: number;
  rounding: BranchDetail['rounding'];
  qrOrderMode: BranchDetail['qrOrderMode'];
  guestJoinMode: BranchDetail['guestJoinMode'];
  defaultDiningMinutes: number;
  bankBin: string | null;
  bankAccountNo: string | null;
  bankAccountName: string | null;
  receiptHeader: string | null;
  receiptFooter: string | null;
  openingHours: Record<string, unknown>;
  [k: string]: unknown;
}

function toForm(b: BranchDetail): BranchForm {
  return {
    name: b.name,
    address: b.address,
    phone: b.phone,
    email: b.email,
    taxCode: b.taxCode,
    businessDayCutoff: b.businessDayCutoff,
    vatRateBps: b.vatRateBps,
    priceIncludesVat: b.priceIncludesVat,
    serviceChargeBps: b.serviceChargeBps,
    rounding: b.rounding,
    qrOrderMode: b.qrOrderMode,
    guestJoinMode: b.guestJoinMode,
    defaultDiningMinutes: b.defaultDiningMinutes,
    bankBin: b.bankBin,
    bankAccountNo: b.bankAccountNo,
    bankAccountName: b.bankAccountName,
    receiptHeader: b.receiptHeader,
    receiptFooter: b.receiptFooter,
    openingHours: b.openingHours ?? {},
  };
}

function BranchSettings() {
  const branchId = useBranchId();
  const branch = useBranchDetail(branchId);
  if (branch.isLoading) return <Loading />;
  if (branch.isError || !branch.data) return <p className="text-red-700">{errorMessage(branch.error)}</p>;
  return <BranchForm key={`${branch.data.id}-${branch.data.updatedAt ?? ''}`} branch={branch.data} />;
}

function BranchForm({ branch }: { branch: BranchDetail }) {
  const qc = useQueryClient();
  const canEdit = useCan('branch.update');
  const original = useMemo(() => toForm(branch), [branch]);
  const [form, setForm] = useState<BranchForm>(original);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof BranchForm>(k: K, v: BranchForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const changes = diffPatch(original, form);
  const dirty = Object.keys(changes).length > 0;
  const hours = (form.openingHours.default ?? {}) as { from?: string; to?: string };

  const save = async () => {
    if (!form.name.trim()) return toast.error('Nhập tên cơ sở');
    if (form.bankBin && form.bankAccountNo && !/^[A-Za-z0-9]{1,19}$/.test(form.bankAccountNo)) return toast.error('Số tài khoản chỉ gồm chữ và số, tối đa 19 ký tự');
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) return toast.error('Email không hợp lệ');
    setSaving(true);
    try {
      await settingsAdminApi.updateBranch(branch.id, changes);
      toast.success('Đã lưu cấu hình cơ sở');
      void qc.invalidateQueries({ queryKey: adminKeys.branch(branch.id) });
      void qc.invalidateQueries({ queryKey: ['branch', branch.id] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <fieldset disabled={!canEdit} className="space-y-3">
      <div className="sticky top-14 z-10 flex flex-wrap items-center gap-2 rounded-xl bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
        <span className="font-bold">{branch.name}</span>
        <span className="text-sm text-ink-500">({branch.code})</span>
        {!canEdit && <span className="text-sm text-amber-700">Chỉ xem</span>}
        {dirty && <span className="text-sm font-semibold text-amber-700">Có thay đổi chưa lưu</span>}
        {canEdit && (
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="ghost" disabled={!dirty} onClick={() => setForm(original)}>
              Hoàn tác
            </Button>
            <Button size="sm" disabled={!dirty} loading={saving} onClick={() => void save()}>
              <Save className="h-4 w-4" /> Lưu cấu hình
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Thông tin cơ sở">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Tên cơ sở *" value={form.name} onChange={(e) => set('name', e.target.value)} />
            <Input label="Điện thoại" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value || null)} />
            <div className="sm:col-span-2">
              <Input label="Địa chỉ" value={form.address ?? ''} onChange={(e) => set('address', e.target.value || null)} />
            </div>
            <Input label="Email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value || null)} />
            <Input label="Mã số thuế" value={form.taxCode ?? ''} onChange={(e) => set('taxCode', e.target.value || null)} />
            <Input label="Mở cửa từ" type="time" value={hours.from ?? ''} onChange={(e) => set('openingHours', { ...form.openingHours, default: { ...hours, from: e.target.value } })} />
            <Input label="Đóng cửa lúc" type="time" value={hours.to ?? ''} onChange={(e) => set('openingHours', { ...form.openingHours, default: { ...hours, to: e.target.value } })} />
            <Input label="Giờ chốt ngày kinh doanh" type="time" value={form.businessDayCutoff} onChange={(e) => set('businessDayCutoff', e.target.value)} hint="Đơn trước giờ này tính vào ngày hôm trước (mặc định 04:00)." />
            <IntInput label="Thời gian ngồi mặc định (phút)" value={form.defaultDiningMinutes} min={15} onChange={(v) => set('defaultDiningMinutes', Math.min(600, Math.max(15, v ?? 90)))} />
          </div>
        </Card>

        <Card title="Thuế, phí và làm tròn">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Thuế suất VAT" value={String(form.vatRateBps)} onChange={(e) => set('vatRateBps', Number(e.target.value))}>
              {[0, 500, 800, 1000].map((v) => (
                <option key={v} value={v}>
                  {v / 100}%
                </option>
              ))}
              {![0, 500, 800, 1000].includes(form.vatRateBps) && <option value={form.vatRateBps}>{form.vatRateBps / 100}%</option>}
            </Select>
            <BpsInput label="Phí phục vụ" value={form.serviceChargeBps} onChange={(v) => set('serviceChargeBps', v ?? 0)} />
            <div className="sm:col-span-2">
              <Toggle checked={form.priceIncludesVat} onChange={(v) => set('priceIncludesVat', v)} label="Giá món đã gồm VAT" hint="Tắt nếu giá trên thực đơn chưa gồm thuế (VAT cộng thêm khi tính bill)." />
            </div>
            <Select label="Làm tròn tổng bill" value={form.rounding} onChange={(e) => set('rounding', e.target.value as BranchForm['rounding'])}>
              <option value="NONE">Không làm tròn</option>
              <option value="TO_500">Làm tròn 500đ</option>
              <option value="TO_1000">Làm tròn 1.000đ</option>
            </Select>
          </div>
        </Card>

        <Card title="Gọi món qua QR">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Xác nhận đơn QR" value={form.qrOrderMode} onChange={(e) => set('qrOrderMode', e.target.value as BranchForm['qrOrderMode'])}>
              <option value="STAFF_CONFIRM">Nhân viên xác nhận trước khi gửi bếp</option>
              <option value="DIRECT">Gửi thẳng xuống bếp</option>
            </Select>
            <Select label="Khách vào bàn" value={form.guestJoinMode} onChange={(e) => set('guestJoinMode', e.target.value as BranchForm['guestJoinMode'])}>
              <option value="OPEN">Tự do (quét là vào)</option>
              <option value="PIN">Cần mã PIN bàn</option>
              <option value="STAFF">Nhân viên mở bàn trước</option>
            </Select>
          </div>
        </Card>

        <Card title="Nội dung in trên bill">
          <div className="space-y-3">
            <Textarea label="Đầu bill" value={form.receiptHeader ?? ''} maxLength={300} onChange={(e) => set('receiptHeader', e.target.value || null)} />
            <Textarea label="Cuối bill" value={form.receiptFooter ?? ''} maxLength={300} onChange={(e) => set('receiptFooter', e.target.value || null)} />
          </div>
        </Card>

        <Card title="Tài khoản nhận chuyển khoản (VietQR)" className="lg:col-span-2">
          <BankSection form={form} set={set} />
        </Card>
      </div>
    </fieldset>
  );
}

function BankSection({ form, set }: { form: BranchForm; set: <K extends keyof BranchForm>(k: K, v: BranchForm[K]) => void }) {
  const [amount, setAmount] = useState<number | null>(null);
  const [img, setImg] = useState<string | null>(null);
  const [payload, setPayload] = useState('');
  const bank = form.bankBin ? findBankByBin(form.bankBin) : undefined;

  useEffect(() => {
    let alive = true;
    let p = '';
    try {
      if (form.bankBin && form.bankAccountNo && /^[A-Za-z0-9]{1,19}$/.test(form.bankAccountNo)) {
        p = buildVietQrPayload({ bankBin: form.bankBin, accountNo: form.bankAccountNo, amount: amount ?? undefined, purpose: amount ? 'Thanh toan thu' : undefined });
      }
    } catch {
      p = '';
    }
    setPayload(p);
    if (!p) {
      setImg(null);
      return;
    }
    void renderQr(p).then((d) => alive && setImg(d));
    return () => {
      alive = false;
    };
  }, [form.bankBin, form.bankAccountNo, amount]);

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_260px]">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Select label="Ngân hàng" value={form.bankBin ?? ''} onChange={(e) => set('bankBin', e.target.value || null)}>
            <option value="">— Chưa cấu hình —</option>
            {VIET_BANKS.map((b) => (
              <option key={b.bin} value={b.bin}>
                {b.shortName} – {b.name} ({b.bin})
              </option>
            ))}
          </Select>
        </div>
        <Input label="Số tài khoản" value={form.bankAccountNo ?? ''} inputMode="numeric" onChange={(e) => set('bankAccountNo', e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 19) || null)} />
        <Input
          label="Tên chủ tài khoản"
          value={form.bankAccountName ?? ''}
          onChange={(e) => set('bankAccountName', removeDiacritics(e.target.value).toUpperCase().slice(0, 60) || null)}
          hint="Viết hoa không dấu, đúng như tên in trên app ngân hàng."
        />
        <MoneyInput label="Số tiền thử (không bắt buộc)" value={amount} onChange={setAmount} hint="Chỉ để xem trước mã QR động, không lưu." />
      </div>
      <div className="flex flex-col items-center gap-1 rounded-xl border border-ink-100 p-3 text-center">
        <span className="text-sm font-semibold">Xem trước mã VietQR</span>
        {img ? <img src={img} alt="VietQR xem trước" className="h-52 w-52" /> : <div className="flex h-52 w-52 items-center justify-center rounded-lg bg-ink-100 px-4 text-sm text-ink-500">Chọn ngân hàng và nhập số tài khoản để xem mã</div>}
        {bank && <span className="text-sm font-semibold">{bank.shortName}</span>}
        {form.bankAccountNo && <span className="font-mono text-sm">{form.bankAccountNo}</span>}
        {form.bankAccountName && <span className="text-xs">{form.bankAccountName}</span>}
        {amount ? <span className="text-xs text-ink-500">Số tiền: {money(amount)}</span> : <span className="text-xs text-ink-500">Mã tĩnh: khách tự nhập số tiền</span>}
        {payload && <span className="mt-1 max-w-full truncate font-mono text-[10px] text-ink-300" title={payload}>{payload}</span>}
      </div>
    </div>
  );
}
