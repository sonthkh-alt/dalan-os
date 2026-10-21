import { describe, expect, it } from 'vitest';
import { crc16Hex } from './crc16.js';
import { billTransferPurpose, buildVietQrPayload, parseVietQrPayload, sanitizePurpose } from './vietqr.js';
import { findBankByBin, findBankByCode } from './banks.js';

describe('vietqr', () => {
  it('CRC-16/CCITT-FALSE khớp vector chuẩn', () => {
    expect(crc16Hex('123456789')).toBe('29B1');
  });

  it('sinh mã động có số tiền và nội dung, parse lại khớp', () => {
    const payload = buildVietQrPayload({
      bankBin: '970436',
      accountNo: '0011001234567',
      amount: 945_000,
      purpose: 'DL C-20261020-0001',
    });
    expect(payload.startsWith('000201010212')).toBe(true);
    expect(payload).toContain('0010A000000727');
    expect(payload).toContain('0208QRIBFTTA');
    expect(payload).toContain('5303704');
    expect(payload).toContain('5406945000');
    expect(payload).toContain('5802VN');
    const parsed = parseVietQrPayload(payload);
    expect(parsed).toMatchObject({
      dynamic: true,
      bankBin: '970436',
      accountNo: '0011001234567',
      service: 'QRIBFTTA',
      amount: 945_000,
      purpose: 'DL C 20261020 0001',
      crcValid: true,
    });
  });

  it('sinh mã tĩnh khi không có số tiền', () => {
    const payload = buildVietQrPayload({ bankBin: '970422', accountNo: '9704221234' });
    const parsed = parseVietQrPayload(payload);
    expect(parsed.dynamic).toBe(false);
    expect(parsed.amount).toBeNull();
    expect(parsed.crcValid).toBe(true);
  });

  it('phát hiện CRC sai', () => {
    const payload = buildVietQrPayload({ bankBin: '970436', accountNo: '123', amount: 1000 });
    const tampered = payload.slice(0, -4) + '0000';
    expect(parseVietQrPayload(tampered).crcValid).toBe(false);
  });

  it('chuẩn hóa nội dung bỏ dấu và giới hạn 25 ký tự', () => {
    expect(sanitizePurpose('Thanh toán bàn 12 Dạ Lan')).toBe('Thanh toan ban 12 Da Lan');
    expect(sanitizePurpose('a'.repeat(40))).toHaveLength(25);
    expect(billTransferPurpose('C-0001')).toBe('DL C 0001');
  });

  it('từ chối đầu vào sai', () => {
    expect(() => buildVietQrPayload({ bankBin: '97043', accountNo: '1' })).toThrow();
    expect(() => buildVietQrPayload({ bankBin: '970436', accountNo: '1', amount: -1 })).toThrow();
  });

  it('tra cứu ngân hàng', () => {
    expect(findBankByBin('970436')?.shortName).toBe('Vietcombank');
    expect(findBankByCode('mb')?.bin).toBe('970422');
  });
});
