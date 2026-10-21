import { crc16Hex } from './crc16.js';
import { removeDiacritics } from '../text/text.js';

/**
 * Sinh và phân tích mã VietQR (NAPAS 247 / EMVCo MPM) cho chuyển khoản tới tài khoản.
 * Tham chiếu: EMV QR Code Specification for Payment Systems (MPM) và tài liệu VietQR của NAPAS.
 */

const NAPAS_GUID = 'A000000727';
const SERVICE_ACCOUNT = 'QRIBFTTA';
const SERVICE_CARD = 'QRIBFTTC';

export interface VietQrInput {
  /** Mã BIN ngân hàng thụ hưởng, ví dụ 970436 (Vietcombank). */
  bankBin: string;
  /** Số tài khoản (hoặc số thẻ khi service = card). */
  accountNo: string;
  /** Số tiền VND; bỏ trống hoặc 0 để khách tự nhập (mã tĩnh). */
  amount?: number;
  /** Nội dung chuyển khoản, tối đa 25 ký tự ASCII; dấu sẽ được bỏ. */
  purpose?: string;
  service?: 'account' | 'card';
}

export interface VietQrParsed {
  dynamic: boolean;
  bankBin: string;
  accountNo: string;
  service: string;
  amount: number | null;
  purpose: string | null;
  crcValid: boolean;
}

function tlv(id: string, value: string): string {
  if (value.length > 99) throw new RangeError(`Giá trị trường ${id} vượt 99 ký tự`);
  return `${id}${value.length.toString().padStart(2, '0')}${value}`;
}

/** Chuẩn hóa nội dung chuyển khoản: bỏ dấu, chỉ giữ chữ, số, khoảng trắng; tối đa 25 ký tự. */
export function sanitizePurpose(purpose: string, maxLength = 25): string {
  return removeDiacritics(purpose)
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .trim();
}

export function buildVietQrPayload(input: VietQrInput): string {
  if (!/^\d{6}$/.test(input.bankBin)) throw new RangeError('bankBin phải gồm 6 chữ số');
  if (!/^[A-Za-z0-9]{1,19}$/.test(input.accountNo)) {
    throw new RangeError('accountNo chỉ gồm chữ và số, tối đa 19 ký tự');
  }
  const amount = input.amount ?? 0;
  if (!Number.isSafeInteger(amount) || amount < 0) throw new RangeError('amount phải là số nguyên không âm');
  const dynamic = amount > 0;

  const beneficiary = tlv('00', input.bankBin) + tlv('01', input.accountNo);
  const merchantAccount =
    tlv('00', NAPAS_GUID) +
    tlv('01', beneficiary) +
    tlv('02', input.service === 'card' ? SERVICE_CARD : SERVICE_ACCOUNT);

  let payload = tlv('00', '01') + tlv('01', dynamic ? '12' : '11') + tlv('38', merchantAccount) + tlv('53', '704');
  if (dynamic) payload += tlv('54', amount.toString());
  payload += tlv('58', 'VN');
  const purpose = input.purpose ? sanitizePurpose(input.purpose) : '';
  if (purpose) payload += tlv('62', tlv('08', purpose));
  payload += '6304';
  return payload + crc16Hex(payload);
}

function readTlv(data: string): Map<string, string> {
  const fields = new Map<string, string>();
  let i = 0;
  while (i + 4 <= data.length) {
    const id = data.slice(i, i + 2);
    const len = Number.parseInt(data.slice(i + 2, i + 4), 10);
    if (Number.isNaN(len)) break;
    fields.set(id, data.slice(i + 4, i + 4 + len));
    i += 4 + len;
  }
  return fields;
}

export function parseVietQrPayload(payload: string): VietQrParsed {
  const root = readTlv(payload);
  const crc = root.get('63') ?? '';
  const body = payload.slice(0, payload.length - 4);
  const crcValid = crc.toUpperCase() === crc16Hex(body);
  const merchant = readTlv(root.get('38') ?? '');
  const beneficiary = readTlv(merchant.get('01') ?? '');
  const additional = readTlv(root.get('62') ?? '');
  const amountRaw = root.get('54');
  return {
    dynamic: root.get('01') === '12',
    bankBin: beneficiary.get('00') ?? '',
    accountNo: beneficiary.get('01') ?? '',
    service: merchant.get('02') ?? '',
    amount: amountRaw ? Number(amountRaw) : null,
    purpose: additional.get('08') ?? null,
    crcValid,
  };
}

/** Nội dung chuyển khoản chuẩn cho bill: "DL <mã bill>" để đối soát tự động. */
export function billTransferPurpose(billCode: string): string {
  return sanitizePurpose(`DL ${billCode}`);
}
