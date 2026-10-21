# ADR 0007: Apple Pay là phương thức trên hai kênh: máy POS ngân hàng và cổng online

Ngày: 2026-10-20. Trạng thái: Chấp nhận. Người dùng bổ sung yêu cầu Apple Pay.

## Bối cảnh
Apple Pay vào Việt Nam tháng 8/2023 (thẻ quốc tế) và NAPAS triển khai cho thẻ nội địa từ
15/04/2025 với Vietcombank, OCB và các ngân hàng lớn; NAPAS công bố lộ trình mở rộng qua OnePay,
VNPay, ZaloPay, Ngân Lượng. Apple không cung cấp API thanh toán trực tiếp cho merchant; Apple Pay
luôn chạy trên hạ tầng thẻ (contactless tại quầy) hoặc qua một cổng thanh toán hỗ trợ Apple Pay
trên web/app (cần Apple Developer Merchant ID và xác minh tên miền).

## Quyết định
1. **Tại quầy**: khách chạm iPhone/Apple Watch vào máy POS ngân hàng (contactless). Hệ thống ghi
   nhận thanh toán với phương thức `CARD_TERMINAL`, nhãn con `APPLE_PAY` (nhân viên chọn hoặc tự
   nhận khi tích hợp máy POS), 4 số cuối và mã chuẩn chi. Không cần tích hợp phần mềm riêng với
   Apple.
2. **Online** (app khách, Zalo Mini App, đặt cọc): qua bộ chuyển đổi `PaymentProvider` của cổng
   hỗ trợ Apple Pay (ưu tiên OnePay; VNPay khi có). Giao diện khách hiển thị nút Apple Pay chỉ trên
   Safari/iOS khi cổng báo khả dụng (`canMakePayments`). Dòng thanh toán ghi `provider=ONEPAY`,
   `method=APPLE_PAY`.
3. Google Pay và Samsung Pay xử lý tương tự khi có.

## Hệ quả
- Nhà hàng cần: máy POS ngân hàng có contactless (đa số máy mới đều có); hợp đồng với OnePay hoặc
  VNPay có bật Apple Pay; tài khoản Apple Developer để xác minh tên miền `menu.dalan.com.vn`.
- Báo cáo theo phương thức tách được Apple Pay dù qua kênh nào.
