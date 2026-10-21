/** Tiện ích ngày giờ cho các màn hình vận hành (đặt bàn, tiệc, kho). Luôn tính theo giờ Việt Nam. */

export const VN_TZ = 'Asia/Ho_Chi_Minh';

/** Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD. */
export function vnToday(now: Date = new Date()): string {
  return vnDate(now);
}

/** Đổi thời điểm sang ngày YYYY-MM-DD theo giờ Việt Nam. */
export function vnDate(value: string | Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: VN_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
  return parts;
}

/** Giờ:phút theo giờ Việt Nam. */
export function vnTime(value: string | Date): string {
  return new Intl.DateTimeFormat('vi-VN', { timeZone: VN_TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}

/** Số phút kể từ 00:00 (giờ Việt Nam) của một thời điểm. */
export function vnMinutes(value: string | Date): number {
  const [h, m] = vnTime(value).split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Ghép ngày + giờ thành ISO có múi giờ +07:00 (API yêu cầu offset). */
export function toVnIso(date: string, hhmm: string): string {
  return `${date}T${hhmm.length === 5 ? hhmm : hhmm.slice(0, 5)}:00+07:00`;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Thứ trong tuần (1 = Thứ Hai … 7 = Chủ nhật) của ngày YYYY-MM-DD. */
export function isoWeekday(date: string): number {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

export function startOfWeek(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

export function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: string): string {
  const [y, m] = date.split('-').map(Number);
  const last = new Date(Date.UTC(y ?? 2026, m ?? 1, 0)).getUTCDate();
  return `${date.slice(0, 7)}-${String(last).padStart(2, '0')}`;
}

const WEEKDAYS = ['', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật'];
const WEEKDAYS_SHORT = ['', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export function weekdayLabel(date: string, short = false): string {
  return (short ? WEEKDAYS_SHORT : WEEKDAYS)[isoWeekday(date)] ?? '';
}

/** "Thứ Tư, 21/10/2026" */
export function dateLabel(date: string, withWeekday = true): string {
  const [y, m, d] = date.split('-');
  return `${withWeekday ? `${weekdayLabel(date)}, ` : ''}${d}/${m}/${y}`;
}

/** "21/10" */
export function dayMonth(date: string): string {
  const [, m, d] = date.split('-');
  return `${d}/${m}`;
}

/** Hiển thị ngày giờ đầy đủ theo giờ Việt Nam: "21/10/2026 18:30". */
export function vnDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return `${dateLabel(vnDate(value), false)} ${vnTime(value)}`;
}

export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function minutesToHhmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Bỏ dấu tiếng Việt để tìm kiếm không phân biệt dấu. */
export function fold(text: string | null | undefined): string {
  return (text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

/** "+84912345678" → "0912 345 678" (giữ nguyên nếu đã bị che). */
export function phoneDisplay(phone: string | null | undefined): string {
  if (!phone) return '—';
  if (phone.includes('*')) return phone.replace(/^\+84/, '0');
  const local = phone.replace(/^\+84/, '0');
  return local.length === 10 ? `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}` : local;
}

/** So sánh nông để chỉ gửi các trường đã thay đổi trong PATCH. */
export function changedFields<T extends Record<string, unknown>>(initial: T, next: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(next) as (keyof T)[]) {
    const a = initial[key];
    const b = next[key];
    const same = Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((v, i) => v === b[i]) : a === b;
    if (!same) out[key] = b;
  }
  return out;
}

/** Chuỗi rỗng → null (cho trường có thể xóa). */
export const emptyToNull = (v: string): string | null => (v.trim() === '' ? null : v.trim());
/** Chuỗi rỗng → undefined (cho trường tùy chọn khi tạo mới). */
export const emptyToUndef = (v: string): string | undefined => (v.trim() === '' ? undefined : v.trim());

/** Phần trăm hiển thị từ basis points: 800 → "8%". */
export function bpsLabel(bps: number | null | undefined): string {
  const v = (bps ?? 0) / 100;
  return `${Number.isInteger(v) ? v : v.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%`;
}
