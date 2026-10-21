# @dalan/zalo-mini — Zalo Mini App "Dạ Lan"

Mini App trên Zalo cho khách của Nhà hàng Dạ Lan (spec `docs/spec/02-khach-hang.md`, mục **I3.2**): đăng nhập bằng Zalo, xem thực đơn, đặt bàn, gọi món khi quét QR tại bàn, xem điểm/hạng/voucher và lịch sử, gửi yêu cầu tiệc. Dùng chung API với app khách web (`apps/guest`).

Stack theo template chính thức [zaui-restaurant](https://github.com/Zalo-MiniApp/zaui-restaurant) / zaui-market: React + `zmp-ui` + `zmp-sdk` + Vite + Tailwind, `app-config.json`, deploy bằng `zmp-cli`.

| Thành phần | Phiên bản | Ghi chú |
| --- | --- | --- |
| react / react-dom | 18.3.1 (ghim riêng) | `zmp-ui` 1.11 chưa hỗ trợ React 19 (dùng `react-is` 18). Gốc monorepo có React 19 cho Next.js; `vite.config.ts` dùng `resolve.dedupe` để mọi gói dùng chung React 18 của app này. |
| zmp-ui | 1.11.14 | Router (`ZMPRouter`, `AnimationRoutes`), `BottomNavigation`, `Sheet`, `Button`, `Icon` |
| zmp-sdk | 2.53.2 | Chỉ gọi qua `src/lib/zalo.ts` (import động) |
| vite | 5.4.21 | `zmp-vite-plugin` 1.1.6 yêu cầu Vite 4/5 |
| tailwindcss | 4 (catalog) | qua `@tailwindcss/vite` |

## Trang

| Đường dẫn | Nội dung |
| --- | --- |
| `/` | Trang chủ: 3 cơ sở (giờ mở cửa từ API), quét QR bàn, lối tắt thực đơn / đặt bàn / đặt tiệc |
| `/menu`, `/menu/:branchCode` | Thực đơn công khai từng cơ sở: tìm không dấu, lọc (đặc sản, hải sản, chay, dưới 100k), nhảy theo nhóm, sheet chi tiết món (chỉ xem) |
| `/table` | Chưa vào bàn: quét QR (camera Zalo) hoặc nhập mã. Đã vào bàn: thực đơn của bàn, sheet chọn cỡ/tùy chọn/kg/ghi chú, giỏ, gửi món |
| `/table/join/:token`, `/q/:token` | Vào bàn từ QR: tên gọi, số khách, mã PIN nếu cơ sở bật chế độ PIN |
| `/table/orders` | Trạng thái từng món theo đợt gọi (tự làm mới 15 giây), gọi nhân viên / nước / chén đũa / tính tiền |
| `/table/bill` | Tạm tính (phí phục vụ, VAT), bill đang mở, xin tính tiền, thông tin chuyển khoản, thanh toán ZaloPay qua `payment-intents` |
| `/reserve` | Đặt bàn: cơ sở, ngày, số khách, khung giờ 15 phút từ API availability, loại chỗ, yêu cầu đặc biệt; điền sẵn tên/SĐT khi đã đăng nhập; `source: MINI_APP` |
| `/account` | Đăng nhập Zalo → điểm, hạng, số lần ghé, voucher, lịch sử bill, biến động điểm, đặt bàn của tôi |
| `/banquet` | Gửi yêu cầu tư vấn tiệc cưới / sự kiện (`/public/event-inquiries`) |

Khi API chưa có endpoint (404/405/501) các trang hiện thông báo nhẹ (ví dụ "Đặt bàn online đang được hoàn thiện… Gọi ngay") thay vì báo lỗi.

## Cấu trúc

```
apps/zalo-mini/
├── app-config.json      # tiêu đề "Dạ Lan", màu header đỏ #8b1e2d, ẩn action bar của Zalo
├── index.html
├── vite.config.ts       # zmp-vite-plugin (build ra www/ + www/app-config.json), react, tailwind, dedupe React
├── src/
│   ├── main.tsx, App.tsx          # router, thanh điều hướng, xử lý tham số khởi động (QR bàn)
│   ├── lib/zalo.ts                # lớp bọc zmp-sdk + phương án dự phòng trình duyệt
│   ├── lib/api.ts                 # fetch API, x-guest-token, Bearer + tự refresh token
│   ├── lib/{session,cart,customer}-store.ts   # zustand persist (localStorage)
│   ├── lib/table-token.ts         # đọc token bàn từ QR / deep link
│   ├── lib/queries.ts             # react-query: menu, phiên bàn, /me, availability...
│   ├── components/…  pages/…
└── www/                 # kết quả build (không commit)
```

## Chạy cục bộ

```bash
pnpm install
pnpm infra:up && pnpm --filter @dalan/api dev      # API http://localhost:4000 (MESSAGING_PROVIDER=mock)
pnpm --filter @dalan/zalo-mini dev                 # http://localhost:3002
```

Ngoài Zalo, `src/lib/zalo.ts` tự chuyển sang chế độ trình duyệt:

| Chức năng | Trong Zalo | Trình duyệt (`vite dev`) |
| --- | --- | --- |
| Đăng nhập | `getAccessToken()` + `getUserInfo()` + `getPhoneNumber()` → `POST /api/v1/auth/customer/zalo` | Gửi token giả lập `mock:<id>:<sđt>:<tên>`; API chỉ chấp nhận khi `MESSAGING_PROVIDER=mock` |
| Quét QR | `scanQRCode()` | Hộp thoại dán đường dẫn / mã bàn |
| Tham số mở app | `getRouteParams()` + query string | query string (`?qr=...`) |
| Mở link, gọi điện | `openWebview()`, `openPhone()` | `window.open`, `tel:` |
| Thanh toán Checkout SDK | `Payment.createOrder()` (`checkoutCreateOrder`) | báo không hỗ trợ |

Thử luồng gọi món tại bàn: lấy `qrToken` của một bàn (bảng `DiningTable`) rồi mở `http://localhost:3002/?qr=<qrToken>` hoặc `http://localhost:3002/q/<qrToken>`.

Thử đăng nhập Zalo giả lập bằng curl:

```bash
curl -X POST http://localhost:4000/api/v1/auth/customer/zalo \
  -H 'content-type: application/json' \
  -d '{"accessToken":"mock:zalo-user-1:0912000009:Khách thử"}'
# → { accessToken, refreshToken, expiresIn, customer: { id, phone, fullName, isNew, zaloUserId, avatarUrl } }
```

Chạy thử trong trình giả lập Zalo: `pnpm --filter @dalan/zalo-mini zmp:start` (cần `zmp login` trước, xem bên dưới).

## Cấu hình địa chỉ API

- Biến build-time `VITE_API_URL` (không có `/api/v1`), mặc định `http://localhost:4000`. Đặt trong `apps/zalo-mini/.env` (xem `.env.example`) hoặc khi build: `VITE_API_URL=https://api.dalan.vn pnpm --filter @dalan/zalo-mini build`.
- Mini App chỉ gọi được domain **HTTPS** đã khai báo: Zalo Mini App Console → app Dạ Lan → **Cấu hình → Danh sách domain hợp lệ / Whitelist domain**. Thêm domain API (ví dụ `api.dalan.vn`) và domain chứa ảnh món (S3/CDN nếu `STORAGE_PROVIDER=s3`).
- API: thêm origin của Mini App vào `CORS_ORIGINS` (khi biến này được đặt, danh sách mặc định bị thay thế). Trên Zalo, WebView của Mini App chạy dưới domain `h5.zdn.vn` (thường là `https://h5.zdn.vn`); kiểm tra header `Origin` thật trong log API sau lần chạy thử đầu tiên rồi bổ sung cho chính xác, ví dụ:
  `CORS_ORIGINS=https://dalan.vn,https://staff.dalan.vn,https://h5.zdn.vn`
- API cũng cần cho phép các header `authorization`, `x-guest-token`, `idempotency-key` (đã dùng cho app khách web).

## Thiết lập trên Zalo (cần tài khoản chủ nhà hàng)

1. **Zalo App + App ID**: tạo ứng dụng tại <https://developers.zalo.me>, sau đó tạo Mini App tại <https://mini.zalo.me> (Zalo Mini App Console). Ghi lại **App ID** của Mini App và **Secret key** của Zalo App.
2. **Liên kết Official Account**: trong Console, liên kết OA "Nhà hàng Dạ Lan" với Mini App (cần cho ZNS, quan tâm OA, hiển thị thương hiệu, và là điều kiện để xin một số quyền).
3. **Quyền người dùng** (Console → Quyền / Permissions):
   - *Thông tin người dùng* (tên, ảnh đại diện) — `getUserInfo`, người dùng xác nhận theo Nghị định 13/2023/NĐ-CP.
   - *Số điện thoại* — `getPhoneNumber`; phải gửi yêu cầu cấp quyền và được Zalo duyệt. Token số điện thoại chỉ dùng **một lần**, hết hạn sau **2 phút**; máy chủ đổi token tại `GET https://graph.zalo.me/v2.0/me/info` với header `access_token`, `code` (token), `secret_key`.
   - Đặt `ZALO_APP_SECRET=<secret key>` cho API (`apps/api/src/config/env.ts`) và chuyển `MESSAGING_PROVIDER=zalo` ở môi trường thật — khi đó token `mock:` bị từ chối.
4. **Thanh toán**: Console → **Thanh toán / Checkout SDK**: bật các phương thức (ZaloPay, ATM/thẻ, ví…), lấy khóa riêng (private key) để máy chủ ký `mac` cho `Payment.createOrder`, cấu hình URL nhận kết quả (notify) về API. Hiện app gọi `POST /bills/:id/payment-intents` (`method: ZALOPAY`, `channel: mini_app`) và mở link cổng; Zalo khuyến nghị thanh toán trong Mini App qua Checkout SDK — xem mục "Việc còn thiếu".
5. **Domain hợp lệ**: như mục "Cấu hình địa chỉ API".

## Mã QR bàn mở thẳng Mini App

- Link mở Mini App có tham số: `https://zalo.me/s/<APP_ID>/?qr=<qrToken>` (tương đương `.../q/<qrToken>`). Khi quét bằng camera Zalo hoặc bấm link trong chat, Zalo mở Mini App; `StartParamHandler` (`src/App.tsx`) đọc tham số bằng `getRouteParams()` + query string (`qr`, `table`, `token`, `t`) và chuyển tới `/table/join/<qrToken>`. Nếu đã có phiên còn hạn của đúng bàn đó thì vào thẳng trang gọi món.
- Bản thử nghiệm (testing) thêm `env=TESTING&version=<số bản>` vào link (Console hiển thị link/QR của từng bản).
- QR web hiện có (`https://<domain app khách>/q/<qrToken>`) vẫn dùng được: nút "Quét QR" trong Mini App nhận cả dạng này. Gợi ý in QR: dùng link web (mở được bằng mọi camera), và trang `/q/<token>` của web khách có thể thêm nút "Mở bằng Zalo" trỏ tới link `zalo.me/s/...` ở trên; hoặc in thẳng link `zalo.me/s/...` nếu muốn ưu tiên Zalo.
- `getAppInfo()` trả `appUrl`/`qrCodeUrl` chính thức của Mini App để đối chiếu định dạng link.

## Build và deploy

```bash
pnpm --filter @dalan/zalo-mini typecheck
VITE_API_URL=https://api.dalan.vn pnpm --filter @dalan/zalo-mini build   # → apps/zalo-mini/www (+ www/app-config.json)

cd apps/zalo-mini
pnpm run zmp:login      # = npx zmp-cli@4.0.3 login — chọn đăng nhập bằng QR, nhập App ID; ghi APP_ID, ZMP_TOKEN vào .env (không commit)
pnpm run deploy:testing # vite build && zmp deploy --existing --outputDir www --testing  → bản thử nghiệm
pnpm run deploy         # vite build && zmp deploy --existing --outputDir www            → bản phát triển
```

Lưu ý dùng `pnpm run deploy` (lệnh `pnpm deploy` là lệnh có sẵn của pnpm). `--existing` deploy nguyên thư mục `www` do Vite 5 build (zmp-cli không tự build lại bằng Vite 2 đi kèm). Sau khi deploy, vào Console chọn phiên bản → **Gửi duyệt** để phát hành. `zmp-cli` không được cài vào workspace (rất nặng, kéo theo Vite 2); các script gọi qua `npx`.

## Việc còn thiếu / cần thông tin thật

- **Thông tin Zalo thật**: App ID, `zmp login`, secret key, quyền số điện thoại được duyệt, liên kết OA, domain whitelist — chưa có nên chưa deploy và chưa thử trên máy thật.
- **Checkout SDK**: chưa có endpoint API ký `mac` (ví dụ `POST /bills/:id/zalo-checkout`) và nhận notify từ Checkout SDK. `src/lib/zalo.ts` đã có `checkoutCreateOrder()` sẵn để nối.
- **Biên nhận / ZNS qua OA, theo dõi OA (`followOA`)**: chưa làm trong Mini App.
- **Ảnh món**: phải nằm trên domain HTTPS đã whitelist.
