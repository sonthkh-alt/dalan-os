# Hướng dẫn tích hợp API DaLan OS

Tài liệu máy sinh: `GET /docs` (Swagger UI), `GET /docs/openapi.json`. Mọi đường dẫn nghiệp vụ có
tiền tố `/api/v1`. Ngoại lệ: `/health`, `/q/:token`, `/q/:token/join` (đường dẫn in trên mã QR).

## Xác thực

| Loại người dùng | Cách lấy token | Cách gửi |
|---|---|---|
| Nhân viên (quản lý) | `POST /auth/staff/login` {login, password} | `Authorization: Bearer <accessToken>` |
| Nhân viên trên thiết bị chung | `GET /auth/staff/device` (header `x-device-token`) để lấy danh sách, rồi `POST /auth/staff/pin` {staffId, pin} | Bearer |
| Khách thành viên | `POST /auth/customer/otp/request` {phone} → `POST /auth/customer/otp/verify` {phone, code} | Bearer |
| Khách tại bàn (QR) | `POST /q/:token/join` → `guestToken` | `x-guest-token: <guestToken>` |
| Cầu in | Token thiết bị loại PRINT_BRIDGE | `x-device-token` |

Access token sống 15 phút; làm mới bằng `POST /auth/refresh` {refreshToken} (xoay vòng, token cũ bị
thu hồi). Thiết bị đăng ký bởi quản lý qua `POST /auth/devices` và chỉ hiển thị token một lần.

Quyền theo chuỗi `tai_nguyen.hanh_dong` (xem `packages/contracts/src/permissions.ts`). Thiếu quyền
trả 403 với `code: FORBIDDEN`. Thao tác vượt hạn mức (hủy món lớn, giảm giá sâu, hoàn tiền) trả 400
`code: APPROVAL_REQUIRED`; gửi lại kèm `managerPin` để ủy quyền tại chỗ.

## Hình dạng lỗi

```json
{ "statusCode": 409, "code": "TABLE_OCCUPIED", "message": "Bàn A01 đang có khách (phiên SC-20261020-0003)", "details": { "tableId": "..." }, "traceId": "..." }
```

Mã thường gặp: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE`,
`TABLE_OCCUPIED`, `ITEM_SOLD_OUT`, `ITEM_OUT_OF_HOURS`, `VARIANT_REQUIRED`, `MODIFIER_INVALID`,
`APPROVAL_REQUIRED`, `AMOUNT_EXCEEDS`, `IDEMPOTENCY_MISMATCH`, `DUPLICATE`.

## Khóa chống trùng

Mọi lệnh ghi (POST/PUT/PATCH/DELETE) nên gửi header `Idempotency-Key: <uuid>`. Cùng khóa và cùng
nội dung trong 24 giờ trả lại đúng kết quả cũ (header `x-idempotent-replay: true`); cùng khóa khác
nội dung trả 409. Ứng dụng nhân viên dùng cơ chế này cho hàng đợi offline.

## Số liệu

Tiền là số nguyên đồng (JSON number). Phần trăm là basis points (bps): 10% = 1000. Số lượng là số
thập phân (kg với món theo cân). Thời gian ISO 8601 UTC; `businessDate` dạng YYYY-MM-DD theo giờ
chốt ngày của cơ sở.

## Realtime (Socket.IO)

Namespace `/rt`, `auth: { token }` (access token hoặc guest token; thiết bị cầu in dùng
`auth: { deviceToken }`). Sự kiện `event` mang `{ id, seq, type, aggregateType, aggregateId,
branchId, payload, occurredAt }`. Nhân viên vào phòng theo cơ sở (và trạm nếu gửi
`auth.stationCode`), khách vào phòng theo phiên. Khi kết nối lại gửi `sync` {lastSeq} để nhận các
sự kiện bị lỡ. Danh sách loại sự kiện: `packages/contracts/src/events.ts`.

## Luồng tiêu biểu

1. Mở bàn: `POST /branches/:branchId/sessions` {tableIds, guestCount}.
2. Gọi món: `POST /sessions/:id/orders` {lines:[{itemId, variantId?, quantity, modifiers:[{groupId, optionId}], note, course}], send:true}.
3. Bếp: `GET /branches/:branchId/kitchen/tickets?stationCode=HOT` → `POST /kitchen/tickets/:id/bump`.
4. Tính tiền: `POST /sessions/:id/empties` (đếm vỏ) → `POST /sessions/:id/bills` {mode:'ALL'} → `POST /bills/:id/discounts` → `POST /bills/:id/payments` {method:'BANK_TRANSFER'} (nhận `qrPayload`, `qrDataUrl`) → `POST /payments/:id/confirm`.
5. Khách QR: `GET /q/:token` → `POST /q/:token/join` → `GET /guest/menu` → `POST /guest/orders` → `GET /guest/session`.

## Webhook thanh toán và hóa đơn điện tử

Đường dẫn `POST /webhooks/payments/:provider` xác thực chữ ký theo từng cổng, xử lý idempotent theo
mã giao dịch. Chi tiết trong mô-đun `payments` và `invoicing`.
