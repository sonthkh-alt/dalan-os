/** Chuyển ảnh RGBA thành bitmap đơn sắc đóng gói 1 bit/điểm (MSB là điểm bên trái), từng hàng. */

export interface PackedBitmap {
  width: number;
  height: number;
  /** Số byte mỗi hàng = ceil(width / 8) */
  widthBytes: number;
  data: Uint8Array;
}

export function packMonochrome(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, threshold = 128): PackedBitmap {
  const widthBytes = Math.ceil(width / 8);
  const data = new Uint8Array(widthBytes * height);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * widthBytes;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = rgba[i] ?? 255;
      const g = rgba[i + 1] ?? 255;
      const b = rgba[i + 2] ?? 255;
      const a = rgba[i + 3] ?? 255;
      // Trộn alpha trên nền trắng rồi lấy độ sáng
      const lum = ((0.299 * r + 0.587 * g + 0.114 * b) * a) / 255 + (255 - a);
      if (lum < threshold) {
        data[rowOffset + (x >> 3)] = (data[rowOffset + (x >> 3)] ?? 0) | (0x80 >> (x & 7));
      }
    }
  }
  return { width, height, widthBytes, data };
}

/** Tạo bitmap từ hàm điểm (dùng cho kiểm thử và vẽ không cần canvas). */
export function bitmapFromPredicate(width: number, height: number, isBlack: (x: number, y: number) => boolean): PackedBitmap {
  const widthBytes = Math.ceil(width / 8);
  const data = new Uint8Array(widthBytes * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isBlack(x, y)) data[y * widthBytes + (x >> 3)] = (data[y * widthBytes + (x >> 3)] ?? 0) | (0x80 >> (x & 7));
    }
  }
  return { width, height, widthBytes, data };
}

/** Cắt phần trắng thừa ở cuối (giảm giấy). Giữ tối thiểu `keep` hàng. */
export function trimBottom(bitmap: PackedBitmap, keep = 8): PackedBitmap {
  let last = bitmap.height - 1;
  while (last > 0) {
    const row = bitmap.data.subarray(last * bitmap.widthBytes, (last + 1) * bitmap.widthBytes);
    if (row.some((b) => b !== 0)) break;
    last--;
  }
  const height = Math.min(bitmap.height, last + 1 + keep);
  return { ...bitmap, height, data: bitmap.data.subarray(0, height * bitmap.widthBytes) };
}
