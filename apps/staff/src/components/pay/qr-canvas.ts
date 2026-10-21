'use client';

/**
 * Dựng ảnh QR trên trình duyệt cho thanh toán VietQR đang chờ (khi API không trả data URL, ví dụ mở lại
 * sau khi tải lại trang). Dùng thư viện `qrcode` đã có trong monorepo nếu khả dụng; nếu không trả về null.
 */
export async function renderQr(payload: string): Promise<string | null> {
  if (!payload) return null;
  try {
    const mod = (await import('qrcode')) as { toDataURL: (text: string, opts: Record<string, unknown>) => Promise<string> };
    return await mod.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 1, width: 512 });
  } catch {
    return null;
  }
}
