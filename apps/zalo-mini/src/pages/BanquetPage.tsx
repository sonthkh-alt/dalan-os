import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button, useNavigate } from 'zmp-ui';
import type { EventKind } from '@dalan/contracts';
import { normalizeVnPhone } from '@dalan/domain';
import { PageShell } from '../components/PageShell';
import { Card, Chip, Field, Notice, inputClass, useToast } from '../components/ui';
import { api, ApiError, errorMessage, isMissingEndpoint } from '../lib/api';
import { BRANCHES, findBranch, formatPhone } from '../lib/branches';
import { useCustomer } from '../lib/customer-store';
import { todayIso } from '../lib/format';
import { callPhone } from '../lib/zalo';

// Nhãn giống EVENT_KIND_LABELS của @dalan/contracts (khai báo lại để không kéo zod vào bundle Mini App)
const EVENT_KIND_LABELS: Record<EventKind, string> = {
  WEDDING: 'Tiệc cưới',
  ENGAGEMENT: 'Lễ ăn hỏi',
  CONFERENCE: 'Hội nghị',
  GALA: 'Gala dinner',
  OPENING: 'Khai trương',
  ANNIVERSARY: 'Lễ kỷ niệm',
  BIRTHDAY: 'Sinh nhật',
  REUNION: 'Họp lớp, họp mặt',
  PARTY: 'Liên hoan',
  OTHER: 'Khác',
};

const KINDS: EventKind[] = [
  'WEDDING',
  'ENGAGEMENT',
  'BIRTHDAY',
  'CONFERENCE',
  'GALA',
  'REUNION',
  'ANNIVERSARY',
  'OPENING',
  'PARTY',
  'OTHER',
];

/** Gửi yêu cầu tư vấn tiệc cưới, hội nghị, sự kiện (mặc định cơ sở Dạ Lan Event). */
export function BanquetPage() {
  const navigate = useNavigate();
  const toast = useToast((s) => s.show);
  const profile = useCustomer((s) => s.profile);
  const [branchCode, setBranchCode] = useState('EVENT');
  const [kind, setKind] = useState<EventKind>('WEDDING');
  const [eventDate, setEventDate] = useState(todayIso(30));
  const [startTime, setStartTime] = useState('11:00');
  const [tables, setTables] = useState('');
  const [guests, setGuests] = useState('');
  const [name, setName] = useState(profile?.fullName ?? '');
  const [phone, setPhone] = useState(profile?.phone ? profile.phone.replace(/^\+84/, '0') : '');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [done, setDone] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const branch = findBranch(branchCode) ?? BRANCHES[2]!;

  const submit = useMutation({
    mutationFn: () => {
      const normalized = normalizeVnPhone(phone);
      if (!normalized) throw new ApiError(400, 'INVALID_PHONE', 'Số điện thoại không hợp lệ');
      return api('/public/event-inquiries', {
        body: {
          branchCode,
          kind,
          contactName: name.trim(),
          contactPhone: normalized,
          contactEmail: email.trim() || undefined,
          eventDate,
          startTime: startTime || undefined,
          expectedTables: tables ? Number(tables) : undefined,
          expectedGuests: guests ? Number(guests) : undefined,
          notes: [notes.trim(), 'Gửi từ Zalo Mini App'].filter(Boolean).join('\n'),
        },
      });
    },
    onSuccess: () => setDone(true),
    onError: (err) => {
      if (isMissingEndpoint(err)) setUnavailable(true);
      else toast(errorMessage(err), 'error');
    },
  });

  if (done) {
    return (
      <PageShell title="Đặt tiệc" back>
        <Card className="text-center">
          <p className="text-lg font-bold text-success">Đã gửi yêu cầu tư vấn tiệc</p>
          <p className="mt-2 text-sm text-ink-soft">
            Bộ phận kinh doanh {branch.name} sẽ gọi lại cho quý khách trong giờ làm việc để tư vấn
            sảnh, thực đơn và báo giá.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => void callPhone(branch.phone)}>
              Gọi ngay
            </Button>
            <Button onClick={() => navigate('/', { replace: true })}>Về trang chủ</Button>
          </div>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell title="Đặt tiệc, sự kiện" back>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
      >
        <Notice>
          Dạ Lan Event có sảnh 11.000 m², phục vụ tiệc cưới và sự kiện tới 1.100 khách. Để lại thông
          tin, chúng tôi sẽ tư vấn miễn phí.
        </Notice>
        {unavailable ? (
          <Notice tone="warn">
            Gửi yêu cầu online đang được hoàn thiện. Vui lòng gọi {formatPhone(branch.phone)}.
            <button
              type="button"
              onClick={() => void callPhone(branch.phone)}
              className="mt-2 block rounded-lg bg-maroon px-3 py-1.5 font-semibold text-white"
            >
              Gọi ngay
            </button>
          </Notice>
        ) : null}

        <Field label="Loại tiệc">
          <div className="flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
                {EVENT_KIND_LABELS[k]}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="Cơ sở">
          <div className="grid grid-cols-3 gap-2">
            {BRANCHES.map((b) => (
              <Chip
                key={b.code}
                active={b.code === branchCode}
                onClick={() => setBranchCode(b.code)}
              >
                {b.name.replace('Dạ Lan ', '')}
              </Chip>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ngày tổ chức">
            <input
              type="date"
              min={todayIso(1)}
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className={inputClass}
              required
            />
          </Field>
          <Field label="Giờ bắt đầu">
            <input
              type="time"
              step={900}
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Số mâm dự kiến">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={1000}
              value={tables}
              onChange={(e) => setTables(e.target.value)}
              placeholder="Ví dụ: 50"
              className={inputClass}
            />
          </Field>
          <Field label="Số khách dự kiến">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={10000}
              value={guests}
              onChange={(e) => setGuests(e.target.value)}
              placeholder="Ví dụ: 500"
              className={inputClass}
            />
          </Field>
        </div>
        <Field label="Người liên hệ">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            className={inputClass}
            required
          />
        </Field>
        <Field label="Số điện thoại">
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0912 345 678"
            className={inputClass}
            required
          />
        </Field>
        <Field label="Email (không bắt buộc)">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Ghi chú">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={1500}
            placeholder="Ngân sách, phong cách trang trí, thực đơn mong muốn..."
            className={inputClass}
          />
        </Field>
        <Button htmlType="submit" fullWidth loading={submit.isPending}>
          Gửi yêu cầu tư vấn
        </Button>
      </form>
    </PageShell>
  );
}
