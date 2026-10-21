import { describe, expect, it } from 'vitest';
import { bitmapFromPredicate, packMonochrome, trimBottom } from './bitmap.js';
import { buildPrintBuffer, CMD, rasterCommands } from './escpos.js';

describe('bitmap', () => {
  it('đóng gói 1 bit/điểm, MSB là điểm bên trái', () => {
    const bmp = bitmapFromPredicate(10, 1, (x) => x === 0 || x === 9);
    expect(bmp.widthBytes).toBe(2);
    expect([...bmp.data]).toEqual([0x80, 0x40]);
  });

  it('packMonochrome ngưỡng độ sáng và alpha', () => {
    // 3 điểm: đen đục, trắng, đen trong suốt (coi như trắng)
    const rgba = Uint8ClampedArray.from([0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 0]);
    const bmp = packMonochrome(rgba, 3, 1);
    expect([...bmp.data]).toEqual([0x80]);
  });

  it('trimBottom cắt hàng trắng cuối nhưng giữ keep hàng', () => {
    const bmp = bitmapFromPredicate(8, 20, (_x, y) => y < 5);
    const trimmed = trimBottom(bmp, 2);
    expect(trimmed.height).toBe(7);
    expect(trimmed.data.length).toBe(7);
  });
});

describe('escpos', () => {
  it('GS v 0 có header đúng kích thước và dữ liệu', () => {
    const bmp = bitmapFromPredicate(576, 10, () => true);
    const parts = rasterCommands(bmp);
    expect(parts).toHaveLength(1);
    const cmd = parts[0]!;
    expect([...cmd.subarray(0, 8)]).toEqual([0x1d, 0x76, 0x30, 0x00, 72, 0, 10, 0]);
    expect(cmd.length).toBe(8 + 72 * 10);
    expect(cmd[8]).toBe(0xff);
  });

  it('chia khối khi ảnh cao hơn chunkRows', () => {
    const bmp = bitmapFromPredicate(384, 1030, () => false);
    const parts = rasterCommands(bmp, 512);
    expect(parts.map((p) => (p[6] ?? 0) | ((p[7] ?? 0) << 8))).toEqual([512, 512, 6]);
    expect(parts.map((p) => p[4])).toEqual([48, 48, 48]);
  });

  it('buildPrintBuffer bắt đầu bằng ESC @ và kết thúc bằng cắt giấy, mở két khi yêu cầu', () => {
    const bmp = bitmapFromPredicate(8, 2, () => true);
    const buf = buildPrintBuffer(bmp, { openDrawer: true });
    expect([...buf.subarray(0, 2)]).toEqual([0x1b, 0x40]);
    const drawer = CMD.openDrawer();
    expect([...buf.subarray(buf.length - drawer.length)]).toEqual([...drawer]);
    const cut = CMD.cut(true);
    expect([...buf.subarray(buf.length - drawer.length - cut.length, buf.length - drawer.length)]).toEqual([...cut]);
  });
});
