import QRCode from 'qrcode';

export interface QrMatrix {
  size: number;
  isDark: (row: number, col: number) => boolean;
}

/** Sinh ma trận QR (thư viện `qrcode` dùng chung với API). */
export function qrMatrix(data: string, level: 'L' | 'M' | 'Q' | 'H' = 'M'): QrMatrix {
  const code = QRCode.create(data, { errorCorrectionLevel: level });
  const size = code.modules.size;
  const bits = code.modules.data;
  return {
    size,
    isDark: (row, col) => bits[row * size + col] === 1,
  };
}
