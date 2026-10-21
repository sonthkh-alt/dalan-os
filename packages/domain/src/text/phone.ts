import { parsePhoneNumberFromString } from 'libphonenumber-js/min';

/** Chuẩn hóa số điện thoại Việt Nam về E.164 (+84...). Trả null nếu không hợp lệ. */
export function normalizeVnPhone(input: string): string | null {
  const trimmed = input.replace(/[\s.-]/g, '');
  const parsed = parsePhoneNumberFromString(trimmed, 'VN');
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}

/** Hiển thị dạng quen thuộc: 0912 345 678. */
export function formatVnPhone(e164: string): string {
  const parsed = parsePhoneNumberFromString(e164);
  if (!parsed) return e164;
  return parsed.country === 'VN' ? parsed.formatNational() : parsed.formatInternational();
}

/** Che số giữa để bảo vệ dữ liệu cá nhân: 0912***678. */
export function maskPhone(e164: string): string {
  const national = formatVnPhone(e164).replace(/\s/g, '');
  if (national.length < 7) return '***';
  return `${national.slice(0, 4)}***${national.slice(-3)}`;
}
