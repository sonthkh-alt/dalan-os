/** Kết quả tải tệp lên (ảnh món, chứng từ, hợp đồng). */
export interface UploadResult {
  url: string;
  path: string;
  size: number;
  mimeType: string;
  originalName: string;
}

export const ALLOWED_UPLOAD_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'] as const;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
