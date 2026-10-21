import { describe, expect, it } from 'vitest';
import { formatVnPhone, maskPhone, normalizeVnPhone } from './phone.js';

describe('số điện thoại', () => {
  it('chuẩn hóa các dạng nhập phổ biến', () => {
    expect(normalizeVnPhone('0912 345 678')).toBe('+84912345678');
    expect(normalizeVnPhone('+84 912345678')).toBe('+84912345678');
    expect(normalizeVnPhone('84912345678')).toBe('+84912345678');
    expect(normalizeVnPhone('02373852004')).toBe('+842373852004');
    expect(normalizeVnPhone('12345')).toBeNull();
  });
  it('hiển thị và che số', () => {
    expect(formatVnPhone('+84912345678').replace(/\s/g, '')).toBe('0912345678');
    expect(maskPhone('+84912345678')).toBe('0912***678');
  });
});
