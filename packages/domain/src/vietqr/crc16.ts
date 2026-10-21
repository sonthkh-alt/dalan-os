/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) theo yêu cầu của EMVCo QR. */
export function crc16CcittFalse(input: string): number {
  const bytes = new TextEncoder().encode(input);
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

export function crc16Hex(input: string): string {
  return crc16CcittFalse(input).toString(16).toUpperCase().padStart(4, '0');
}
