/** Xử lý ngày kinh doanh và lịch bán theo múi giờ Việt Nam. */

export const VN_TIMEZONE = 'Asia/Ho_Chi_Minh';

export interface LocalDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 1 = Thứ hai ... 7 = Chủ nhật (ISO). */
  isoWeekday: number;
}

const partFormatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = partFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
    });
    partFormatters.set(timeZone, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function toLocal(date: Date, timeZone = VN_TIMEZONE): LocalDateTime {
  const parts = formatterFor(timeZone).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    isoWeekday: WEEKDAYS[get('weekday')] ?? 1,
  };
}

export function parseHHmm(value: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) throw new RangeError(`Giờ không hợp lệ: ${value}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) throw new RangeError(`Giờ không hợp lệ: ${value}`);
  return h * 60 + min;
}

function ymd(year: number, month: number, day: number): string {
  return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

function shiftDay(local: LocalDateTime, days: number): string {
  const utc = Date.UTC(local.year, local.month - 1, local.day + days);
  const d = new Date(utc);
  return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/**
 * Ngày kinh doanh (YYYY-MM-DD): trước giờ chốt (ví dụ 04:00) vẫn tính là ngày hôm trước,
 * để ca đêm không bị tách sang hai ngày.
 */
export function businessDate(now: Date, cutoff = '04:00', timeZone = VN_TIMEZONE): string {
  const local = toLocal(now, timeZone);
  const minutes = local.hour * 60 + local.minute;
  return minutes < parseHHmm(cutoff) ? shiftDay(local, -1) : ymd(local.year, local.month, local.day);
}

export interface Schedule {
  /** Ngày trong tuần ISO 1..7; bỏ trống = mọi ngày. */
  days?: number[];
  /** "06:00" */
  from?: string;
  /** "10:00"; nhỏ hơn from nghĩa là qua đêm. */
  to?: string;
}

/** Thực đơn/danh mục có đang trong giờ bán không. Lịch rỗng = luôn bán. */
export function isWithinSchedule(schedule: Schedule | null | undefined, now: Date, timeZone = VN_TIMEZONE): boolean {
  if (!schedule || (!schedule.days?.length && !schedule.from && !schedule.to)) return true;
  const local = toLocal(now, timeZone);
  const minutes = local.hour * 60 + local.minute;
  const dayOk = (weekday: number) => !schedule.days?.length || schedule.days.includes(weekday);
  if (schedule.from && schedule.to) {
    const from = parseHHmm(schedule.from);
    const to = parseHHmm(schedule.to);
    if (from <= to) {
      if (minutes < from || minutes >= to) return false;
      return dayOk(local.isoWeekday);
    }
    // Qua đêm: [from, 24h) thuộc ngày hiện tại, [0, to) thuộc ngày hôm trước.
    if (minutes >= from) return dayOk(local.isoWeekday);
    if (minutes < to) return dayOk(local.isoWeekday === 1 ? 7 : local.isoWeekday - 1);
    return false;
  }
  return dayOk(local.isoWeekday);
}

/** Tuổi (phút) của một mốc thời gian tới hiện tại, dùng để tô màu phiếu bếp. */
export function minutesSince(from: Date, now: Date = new Date()): number {
  return Math.floor((now.getTime() - from.getTime()) / 60_000);
}

export type TicketAgeLevel = 'ok' | 'warn' | 'late';
export function ticketAgeLevel(minutes: number, warnAt = 10, lateAt = 20): TicketAgeLevel {
  if (minutes >= lateAt) return 'late';
  if (minutes >= warnAt) return 'warn';
  return 'ok';
}
