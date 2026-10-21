import { describe, expect, it } from 'vitest';
import { money, moneyD, modifiersText, paymentLabel, percent, qty, time } from './format.js';
import { wrapText, ellipsize } from '../render/layout.js';
import { parseNetworkAddress } from '../transports/index.js';

describe('định dạng', () => {
  it('tiền Việt', () => {
    expect(money(1_234_000)).toBe('1.234.000');
    expect(moneyD(945_000)).toBe('945.000đ');
    expect(money(null)).toBe('0');
  });
  it('số lượng và phần trăm', () => {
    expect(qty(2)).toBe('2');
    expect(qty(1.2)).toBe('1,2');
    expect(percent(500)).toBe('5%');
    expect(percent(850)).toBe('8,5%');
  });
  it('giờ theo múi giờ Việt Nam', () => {
    expect(time('2026-10-20T18:30:00Z')).toBe('01:30');
  });
  it('tùy chọn và nhãn thanh toán', () => {
    expect(modifiersText([{ optionName: 'Rang me' }, { optionName: 'Ít cay' }])).toBe('Rang me, Ít cay');
    expect(modifiersText(['A', 'B'])).toBe('A, B');
    expect(modifiersText(null)).toBe('');
    expect(paymentLabel('CARD_TERMINAL', 'APPLE_PAY')).toBe('Thẻ (Apple Pay)');
    expect(paymentLabel('CASH')).toBe('Tiền mặt');
  });
});

describe('chia dòng', () => {
  const measure = (s: string) => s.length * 10;
  it('ngắt theo từ trong bề rộng', () => {
    expect(wrapText('Gà ri luộc rút xương cỡ lớn', 100, measure)).toEqual(['Gà ri luộc', 'rút xương', 'cỡ lớn']);
  });
  it('cắt từ quá dài theo ký tự và giữ dòng trống', () => {
    expect(wrapText('abcdefghijklmnop\n\nx', 50, measure)).toEqual(['abcde', 'fghij', 'klmno', 'p', '', 'x']);
  });
  it('ellipsize', () => {
    expect(ellipsize('Nhà hàng Dạ Lan', 80, measure)).toBe('Nhà hàn…');
    expect(ellipsize('ngắn', 80, measure)).toBe('ngắn');
  });
});

describe('địa chỉ máy in', () => {
  it('mặc định cổng 9100', () => {
    expect(parseNetworkAddress('192.168.1.201')).toEqual({ host: '192.168.1.201', port: 9100 });
    expect(parseNetworkAddress('10.0.0.5:9101')).toEqual({ host: '10.0.0.5', port: 9101 });
    expect(() => parseNetworkAddress('')).toThrow();
  });
});
