import { describe, expect, it } from 'vitest';
import { businessDate, isWithinSchedule, ticketAgeLevel, toLocal } from './business-date.js';

describe('ngày kinh doanh', () => {
  it('trước giờ chốt tính về ngày hôm trước (giờ Việt Nam)', () => {
    // 2026-10-21 01:30 giờ VN = 2026-10-20 18:30 UTC
    expect(businessDate(new Date('2026-10-20T18:30:00Z'), '04:00')).toBe('2026-10-20');
    // 2026-10-21 05:00 giờ VN = 2026-10-20 22:00 UTC
    expect(businessDate(new Date('2026-10-20T22:00:00Z'), '04:00')).toBe('2026-10-21');
    expect(businessDate(new Date('2026-10-20T22:00:00Z'), '00:00')).toBe('2026-10-21');
  });

  it('toLocal cho đúng thứ trong tuần', () => {
    // 2026-10-20 là thứ Ba
    expect(toLocal(new Date('2026-10-20T03:00:00Z')).isoWeekday).toBe(2);
  });

  it('lịch bán ăn sáng và Chợ quê cuối tuần', () => {
    const breakfast = { days: [1, 2, 3, 4, 5, 6, 7], from: '06:00', to: '10:00' };
    const choQue = { days: [6, 7], from: '06:00', to: '10:00' };
    const satMorning = new Date('2026-10-24T00:30:00Z'); // thứ Bảy 07:30 VN
    const tueMorning = new Date('2026-10-20T00:30:00Z'); // thứ Ba 07:30 VN
    const tueNoon = new Date('2026-10-20T05:00:00Z'); // thứ Ba 12:00 VN
    expect(isWithinSchedule(breakfast, tueMorning)).toBe(true);
    expect(isWithinSchedule(breakfast, tueNoon)).toBe(false);
    expect(isWithinSchedule(choQue, satMorning)).toBe(true);
    expect(isWithinSchedule(choQue, tueMorning)).toBe(false);
    expect(isWithinSchedule({}, tueNoon)).toBe(true);
    expect(isWithinSchedule(null, tueNoon)).toBe(true);
  });

  it('lịch qua đêm', () => {
    const lateNight = { from: '22:00', to: '02:00' };
    expect(isWithinSchedule(lateNight, new Date('2026-10-20T16:00:00Z'))).toBe(true); // 23:00 VN
    expect(isWithinSchedule(lateNight, new Date('2026-10-20T18:00:00Z'))).toBe(true); // 01:00 VN hôm sau
    expect(isWithinSchedule(lateNight, new Date('2026-10-20T20:00:00Z'))).toBe(false); // 03:00 VN
  });

  it('mức cảnh báo tuổi phiếu bếp', () => {
    expect(ticketAgeLevel(3)).toBe('ok');
    expect(ticketAgeLevel(12)).toBe('warn');
    expect(ticketAgeLevel(25)).toBe('late');
  });
});
