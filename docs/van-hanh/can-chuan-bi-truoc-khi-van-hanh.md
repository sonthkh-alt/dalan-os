# Những việc Dạ Lan cần chuẩn bị trước khi vận hành thật

Phần mềm đã chạy đầy đủ với dữ liệu thực đơn thật của Dạ Lan, nhưng các tích hợp bên ngoài đang
chạy ở chế độ mô phỏng. Bảng dưới liệt kê thông tin và hợp đồng nhà hàng cần cung cấp.

## 1. Dữ liệu vận hành

| Việc | Ghi chú |
|---|---|
| Thực đơn định suất, tiệc cưới, tiệc ngọt/mặn/tự chọn, chay | Website chưa đăng; nhập qua Quản trị → Thực đơn |
| Giá bia, rượu, nước ngọt | Hiện là giá tạm để thử luồng đếm vỏ |
| Giá cơm trưa văn phòng hiện hành | Đang dùng ảnh menu năm 2016 |
| Ảnh món ăn | Tải lên trong Quản trị → Thực đơn |
| Sơ đồ tầng, số bàn, phòng VIP, sức chứa từng sảnh của 3 cơ sở | Hiện là sơ đồ mẫu; sửa bằng Quản trị → Sơ đồ bàn, rồi in tờ QR |
| Danh sách nhân viên, vai trò, cơ sở làm việc | Đổi ngay mật khẩu và PIN của các tài khoản mẫu |
| Chính sách: VAT 8% hay 10%, phí phục vụ, mức tối thiểu phòng VIP, đặt cọc, tích điểm | Quản trị → Cấu hình |

## 2. Tài khoản và hợp đồng tích hợp

| Tích hợp | Cần gì | Trạng thái trong phần mềm |
|---|---|---|
| VietQR | Số tài khoản ngân hàng nhận tiền cho từng cơ sở | Chạy thật; đang dùng tài khoản mẫu |
| Xác nhận chuyển khoản tự động | API biến động số dư của ngân hàng (hoặc dịch vụ đối soát như PayOS, Casso) | Hiện thu ngân bấm "Đã nhận tiền" |
| VNPay, MoMo, ZaloPay | Hợp đồng merchant, mã TMN/partner code, khóa bí mật, đăng ký URL webhook | Bộ chuyển đổi đã viết, đang chạy mock |
| Apple Pay online | Hợp đồng OnePay (hoặc VNPay) có bật Apple Pay; Apple Developer account để xác minh tên miền | Bộ chuyển đổi OnePay đã viết, đang chạy mock |
| Apple Pay, thẻ tại quầy | Máy POS ngân hàng có contactless | Thu ngân ghi nhận 4 số cuối và mã chuẩn chi |
| Hóa đơn điện tử máy tính tiền (NĐ 70/2025) | Nhà cung cấp đang dùng (MISA, Viettel hoặc VNPT), tài khoản API, ký hiệu mẫu hóa đơn máy tính tiền | Khung bộ chuyển đổi MISA/Viettel/VNPT có, cần tài liệu API chính thức để hoàn thiện; đang chạy mock |
| Zalo OA và ZNS | Zalo Official Account đã xác thực, đăng ký mẫu ZNS (xác nhận đặt bàn, nhắc lịch, biên nhận, sinh nhật, OTP) | Đang chạy mock |
| Zalo Mini App | App ID, liên kết OA, xin quyền số điện thoại, `ZALO_APP_SECRET`, cấu hình Checkout SDK | Ứng dụng đã build, chưa deploy (xem `apps/zalo-mini/README.md`) |
| SMS dự phòng | Nhà cung cấp SMS brandname | Chưa tích hợp |

## 3. Hạ tầng

| Việc | Ghi chú |
|---|---|
| Máy chủ ảo tại Việt Nam (4 vCPU, 8 GB RAM) | Xem `docs/van-hanh/trien-khai.md` |
| Tên miền `api`, `app`, `menu`.dalan.com.vn trỏ về máy chủ | HTTPS tự động qua Caddy |
| Mỗi cơ sở: 1 PC Windows chạy cầu in, máy in nhiệt LAN cho bếp/bar/quầy | Xem `apps/print-bridge/README.md`; chưa thử với máy in thật |
| Router có SIM 4G dự phòng tại mỗi cơ sở | Giảm gián đoạn khi mất mạng |
| Tablet cho phục vụ, màn hình hoặc tablet cho bếp | Đăng ký thiết bị trong Quản trị → Nhân sự → Thiết bị |

## 4. Nghiệm thu tại cơ sở (đề xuất)

1. Chạy thử một ca tại một cơ sở (khuyến nghị Dạ Lan Star) song song với cách làm cũ.
2. Kiểm tra in phiếu bếp và bill trên máy in thật, tốc độ wifi và thao tác khi mất mạng.
3. Thử thanh toán thật số tiền nhỏ qua từng cổng sau khi có hợp đồng.
4. Phát hành hóa đơn điện tử trên môi trường thử của nhà cung cấp rồi môi trường thật.
5. Mở rộng sang Center và Event.
