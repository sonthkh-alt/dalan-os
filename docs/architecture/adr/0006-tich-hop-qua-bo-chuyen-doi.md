# ADR 0006: Tích hợp bên ngoài qua bộ chuyển đổi có bản Mock

Ngày: 2026-10-20. Trạng thái: Chấp nhận.

## Bối cảnh
Người dùng yêu cầu tích hợp VietQR, VNPay, MoMo, ZaloPay, Apple Pay, HĐĐT (MISA/Viettel/VNPT),
Zalo OA/ZNS/Mini App. Nhà hàng chưa cho biết nhà cung cấp HĐĐT và ngân hàng đang dùng; hợp đồng
merchant chưa có; API của từng bên thay đổi theo thời gian.

## Quyết định
- Mỗi loại tích hợp có một giao diện TypeScript trong `apps/api/src/integrations/<loai>/provider.ts`
  và nhiều triển khai; chọn triển khai theo cấu hình cơ sở.
- Luôn có bản `Mock` chạy được offline để kiểm thử end-to-end, demo và CI; bản Mock mô phỏng cả
  webhook (gọi lại API sau vài giây).
- VietQR sinh tại chỗ theo chuẩn EMVCo/NAPAS 247 trong `packages/domain` (không phụ thuộc bên
  thứ ba); xác nhận tiền về qua webhook ngân hàng khi có API, hoặc thu ngân xác nhận tay.
- Webhook vào API phải xác thực chữ ký theo tài liệu từng bên; xử lý idempotent theo mã giao dịch.
- Gọi ra bên ngoài đi qua worker BullMQ với thử lại lũy tiến và hộp thư chết (dead letter) hiển
  thị trên màn hình quản trị.

## Hệ quả
- Có thể bàn giao và nghiệm thu toàn bộ nghiệp vụ trước khi có hợp đồng merchant.
- Khi nhà hàng cho biết nhà cung cấp HĐĐT, chỉ cần hoàn thiện một bộ chuyển đổi.
