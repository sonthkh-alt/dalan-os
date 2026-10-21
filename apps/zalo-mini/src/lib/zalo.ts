/**
 * Lớp bọc zmp-sdk. Mọi lời gọi SDK đi qua đây để:
 *  - chạy thật bên trong Zalo (Mini App hoặc `zmp start`);
 *  - có phương án dự phòng trên trình duyệt thường (`vite dev`) để thử nghiệm cục bộ.
 * zmp-sdk được import động nên trình duyệt thường không nạp SDK.
 */

type ZmpSdk = typeof import('zmp-sdk/apis');

let sdkPromise: Promise<ZmpSdk> | null = null;
function sdk(): Promise<ZmpSdk> {
  sdkPromise ??= import('zmp-sdk/apis');
  return sdkPromise;
}

/** Đang chạy trong Zalo (app Zalo hoặc trình giả lập của zmp-cli)? */
export function isInZalo(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { APP_ID?: string; ZaloJavaScriptInterface?: unknown };
  return (
    /Zalo/i.test(navigator.userAgent) ||
    !!w.ZaloJavaScriptInterface ||
    window.location.pathname.startsWith('/zapps/') ||
    !!w.APP_ID
  );
}

export class ZaloError extends Error {
  constructor(
    public readonly code: number | string,
    message: string,
  ) {
    super(message);
    this.name = 'ZaloError';
  }
}

function toZaloError(err: unknown, fallback: string): ZaloError {
  const e = err as { code?: number | string; message?: string };
  return new ZaloError(e?.code ?? 'UNKNOWN', e?.message || fallback);
}

// ───────── Tham số khởi động (deep link / QR bàn) ─────────

/**
 * Gộp tham số khi mở Mini App: getRouteParams() của SDK + query string + hash.
 * Link QR bàn dạng https://zalo.me/s/<APP_ID>/?qr=<token> sẽ cho { qr: "<token>" }.
 */
export async function getStartParams(): Promise<Record<string, string>> {
  const params: Record<string, string> = {};
  const merge = (search: string) => {
    new URLSearchParams(search).forEach((v, k) => {
      if (v) params[k] = v;
    });
  };
  merge(window.location.search);
  const hashQuery = window.location.hash.split('?')[1];
  if (hashQuery) merge(hashQuery);
  if (isInZalo()) {
    try {
      const { getRouteParams } = await sdk();
      Object.assign(params, getRouteParams() ?? {});
    } catch {
      /* SDK cũ không có getRouteParams */
    }
  }
  return params;
}

// ───────── Đăng nhập ─────────

export interface ZaloAuthResult {
  accessToken: string;
  phoneToken?: string;
  name?: string;
  avatarUrl?: string;
}

const DEV_ID_KEY = 'dalan-zalo-dev-user';

function devUserId(): string {
  try {
    let id = localStorage.getItem(DEV_ID_KEY);
    if (!id) {
      id = `web-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(DEV_ID_KEY, id);
    }
    return id;
  } catch {
    return 'web-dev';
  }
}

/**
 * Lấy accessToken (và phoneToken nếu người dùng đồng ý chia sẻ số điện thoại).
 * Trên trình duyệt: trả token giả lập `mock:<id>:<sđt>:<tên>` — API chỉ chấp nhận khi MESSAGING_PROVIDER=mock.
 */
export async function zaloAuthorize(opts: {
  askPhone: boolean;
  devPhone?: string;
  devName?: string;
}): Promise<ZaloAuthResult> {
  if (!isInZalo()) {
    const parts = [
      'mock',
      devUserId(),
      (opts.devPhone ?? '').replace(/\D/g, ''),
      opts.devName?.trim() ?? '',
    ];
    return { accessToken: parts.join(':').replace(/:+$/, ''), name: opts.devName };
  }
  const zmp = await sdk();
  let accessToken: string;
  try {
    accessToken = await zmp.getAccessToken();
  } catch (err) {
    throw toZaloError(err, 'Không lấy được phiên đăng nhập Zalo');
  }
  if (!accessToken) throw new ZaloError('NO_TOKEN', 'Không lấy được phiên đăng nhập Zalo');

  let name: string | undefined;
  let avatarUrl: string | undefined;
  try {
    const { userInfo } = await zmp.getUserInfo({ autoRequestPermission: true });
    name = userInfo?.name;
    avatarUrl = userInfo?.avatar;
  } catch {
    /* người dùng từ chối chia sẻ tên/ảnh: vẫn đăng nhập được */
  }

  let phoneToken: string | undefined;
  if (opts.askPhone) {
    try {
      const r = await zmp.getPhoneNumber();
      phoneToken = r.token;
    } catch (err) {
      const e = toZaloError(err, 'Bạn chưa cho phép chia sẻ số điện thoại');
      // -201 / -1401: người dùng từ chối — đăng nhập tiếp nếu tài khoản đã liên kết Zalo trước đó
      if (!['-201', '-1401', '-203'].includes(String(e.code))) throw e;
    }
  }
  return { accessToken, phoneToken, name, avatarUrl };
}

// ───────── Quét QR ─────────

/** Mở camera quét QR (trong Zalo). Trình duyệt: hỏi dán nội dung mã/đường dẫn để thử. */
export async function scanQr(): Promise<string | null> {
  if (!isInZalo()) {
    const value = window.prompt(
      'Trình duyệt không có camera Zalo. Dán đường dẫn hoặc mã QR bàn để thử:',
    );
    return value?.trim() || null;
  }
  try {
    const { scanQRCode } = await sdk();
    const r = await scanQRCode();
    return r?.content?.trim() || null;
  } catch (err) {
    const e = toZaloError(err, 'Không quét được mã QR');
    if (String(e.code) === '-201') return null; // người dùng đóng camera
    throw e;
  }
}

// ───────── Mở liên kết, gọi điện ─────────

export async function openUrl(url: string): Promise<void> {
  if (!isInZalo()) {
    window.open(url, '_blank', 'noopener');
    return;
  }
  const { openWebview } = await sdk();
  await openWebview({ url, config: { style: 'normal' } });
}

export async function callPhone(phone: string): Promise<void> {
  const digits = phone.replace(/[^\d+]/g, '');
  if (!isInZalo()) {
    window.location.href = `tel:${digits}`;
    return;
  }
  try {
    const { openPhone } = await sdk();
    await openPhone({ phoneNumber: digits });
  } catch {
    window.location.href = `tel:${digits}`;
  }
}

// ───────── Thanh toán Checkout SDK ─────────

export interface CheckoutOrderInput {
  amount: number;
  desc: string;
  item: Record<string, unknown>[];
  extradata?: Record<string, unknown>;
  /** MAC do máy chủ ký bằng khóa riêng Checkout SDK — không bao giờ tính ở client */
  mac: string;
  method?: string;
}

/**
 * Mở giao diện thanh toán của Zalo Checkout SDK (Payment.createOrder).
 * Cần endpoint API ký MAC (chưa có) và cấu hình phương thức thanh toán trong Zalo Mini App Console.
 */
export async function checkoutCreateOrder(input: CheckoutOrderInput): Promise<{ orderId: string }> {
  if (!isInZalo())
    throw new ZaloError('NOT_IN_ZALO', 'Thanh toán Zalo chỉ hoạt động trong ứng dụng Zalo');
  const { Payment } = await sdk();
  const r = (await Payment.createOrder({
    ...input,
    item: input.item as Record<string, unknown>[],
  })) as { orderId: string };
  return r;
}
