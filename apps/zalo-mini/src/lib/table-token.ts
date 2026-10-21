/** Tên tham số chứa token bàn khi mở Mini App từ QR: https://zalo.me/s/<APP_ID>/?qr=<token> */
export const TABLE_PARAM_KEYS = ['qr', 'table', 'token', 't'] as const;

const TOKEN_RE = /^[A-Za-z0-9_-]{6,128}$/;

/**
 * Lấy token bàn từ nội dung QR. Hỗ trợ:
 *  - QR web khách: https://<domain>/q/<token>
 *  - Link Mini App: https://zalo.me/s/<APP_ID>/?qr=<token> hoặc .../q/<token>
 *  - Chuỗi token thuần
 */
export function extractTableToken(content: string | null | undefined): string | null {
  const value = content?.trim();
  if (!value) return null;
  if (TOKEN_RE.test(value)) return value;
  try {
    const url = new URL(value);
    const fromPath = url.pathname.match(/\/q\/([A-Za-z0-9_-]{6,128})(?:\/|$)/);
    if (fromPath?.[1]) return fromPath[1];
    for (const key of TABLE_PARAM_KEYS) {
      const v = url.searchParams.get(key);
      if (v && TOKEN_RE.test(v)) return v;
    }
  } catch {
    /* không phải URL */
  }
  return null;
}

export function tokenFromParams(params: Record<string, string>): string | null {
  for (const key of TABLE_PARAM_KEYS) {
    const v = params[key];
    const token = v ? extractTableToken(v) : null;
    if (token) return token;
  }
  return null;
}
