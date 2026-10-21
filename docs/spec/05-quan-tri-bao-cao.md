# Đặc tả nghiệp vụ: Quản trị, phân quyền, báo cáo (A, L)

## A. Nền tảng và cấu hình

- **A1.1** Tổ chức (Công ty CP Dạ Lan) → cơ sở (Center, Star, Event) → khu vực → bàn. Mỗi cơ sở có: địa chỉ, điện thoại, giờ mở cửa theo ngày, giờ chốt ngày kinh doanh, múi giờ, mã số thuế, thông tin in trên bill, logo, tài khoản ngân hàng nhận VietQR, cấu hình thuế (VAT 8%/10%, gồm hay chưa gồm), phí phục vụ, làm tròn, chính sách đặt cọc, chế độ xác nhận đơn QR.
- **A1.2** Nhân sự: hồ sơ, cơ sở làm việc (một hoặc nhiều), vai trò, mã PIN 4-6 số để đăng nhập nhanh trên thiết bị chung, tài khoản mật khẩu cho quản lý, trạng thái.
- **A1.3** Phân quyền theo vai trò với các quyền chi tiết (ví dụ `order.void.over_limit`, `bill.discount.percent_max_20`, `report.view.all_branches`, `customer.phone.view_full`); vai trò mẫu: Phục vụ, Lễ tân, Thu ngân, Bếp, Bar, Quản lý cơ sở, Kinh doanh tiệc, Thủ kho, Kế toán, Giám đốc, Quản trị.
- **A1.4** Thiết bị: đăng ký thiết bị (tablet, PC, màn hình bếp) với cơ sở và vai trò mặc định, khóa về một cơ sở, thu hồi từ xa.
- **A1.5** Ca làm việc gắn với thiết bị thu ngân và két; chuyển ca giữa chừng.
- **A1.6** Mẫu in, mẫu ZNS, mẫu email, mẫu hợp đồng và báo giá có thể sửa bằng trình soạn với biến.

## L. Báo cáo

### L1. Thời gian thực (màn hình giám đốc và quản lý)
- Doanh thu hôm nay theo cơ sở so với cùng kỳ tuần trước; số bàn đang phục vụ; số khách; doanh thu trung bình mỗi khách; đơn chờ bếp quá hạn; yêu cầu khách chưa xử lý; đặt bàn sắp tới trong 2 giờ; tiệc hôm nay.

### L2. Bán hàng
- Doanh thu theo ngày, giờ, ngày trong tuần, cơ sở, khu vực, thực đơn, danh mục, món, nhân viên, nguồn đơn (nhân viên, QR, đặt trước, tiệc), phương thức thanh toán.
- Món bán chạy và bán chậm, tỷ lệ kèm (attach rate) đồ uống, giá trị trung bình mỗi bill và mỗi khách, số lượt bàn và thời gian ngồi trung bình.
- Giảm giá, hủy món, hoàn tiền theo người thực hiện và lý do.
- So sánh cùng kỳ; xuất Excel; lịch gửi báo cáo tự động qua email/Zalo cho ban giám đốc.

### L3. Vận hành
- Thời gian bếp theo trạm và món; món chậm; giờ cao điểm; hiệu suất nhân viên (số bàn, doanh thu, tốc độ phản hồi yêu cầu khách).
- Đặt bàn: số lượt, tỷ lệ xác nhận, no-show, hủy, nguồn (web, Zalo, điện thoại); công suất theo khung giờ.
- Đánh giá khách: điểm trung bình theo cơ sở, theo ngày, phân tích từ khóa nhận xét; cảnh báo điểm thấp.

### L4. Tài chính và tuân thủ
- Báo cáo ca (Z), tổng hợp tiền mặt và điện tử theo ngày, đối soát cổng và ngân hàng, hóa đơn điện tử đã phát hành so với bill, bảng kê thuế theo thuế suất.
- Xuất dữ liệu doanh thu, thanh toán, hóa đơn theo định dạng CSV/Excel khớp mẫu nhập của phần mềm kế toán đang dùng (xác định mẫu khi triển khai).

### L5. Nhật ký và an toàn
- Nhật ký thao tác (AuditLog) cho mọi thay đổi nhạy cảm: giá, giảm giá, hủy món, sửa bill, hoàn tiền, đổi quyền, xuất dữ liệu; ghi người, thiết bị, thời điểm, giá trị trước và sau; tra cứu theo bàn, bill, nhân viên.
- Phiên đăng nhập, thiết bị, đăng nhập thất bại; khóa tài khoản sau 5 lần sai PIN.

## Yêu cầu phi chức năng chung

| Lĩnh vực | Yêu cầu |
|---|---|
| Hiệu năng | API đọc dưới 200 ms p95; cập nhật thời gian thực tới bếp và app khách dưới 1 giây; app khách tải lần đầu dưới 2 giây trên 4G |
| Chịu lỗi | Mất internet: POS và app nhân viên vẫn gọi món, in bếp qua cầu in trong LAN, tạm tính bằng dữ liệu đệm; đồng bộ khi có mạng, không trùng không mất; máy chủ khôi phục trong 15 phút từ bản sao lưu |
| Bảo mật | HTTPS; JWT ngắn hạn và refresh; PIN băm; phân quyền kiểm tra ở API; giới hạn tần suất; webhook xác thực chữ ký; bí mật trong biến môi trường; dữ liệu cá nhân mã hóa khi lưu số điện thoại và email |
| Khả năng quan sát | Log cấu trúc, mã truy vết theo yêu cầu, chỉ số (số đơn, độ trễ bếp, lỗi webhook), cảnh báo khi hàng đợi hóa đơn hoặc in bị kẹt |
| Sao lưu | Sao lưu cơ sở dữ liệu hằng ngày, lưu 30 ngày; kiểm tra khôi phục hằng tháng |
| Ngôn ngữ | Giao diện nhân viên tiếng Việt; giao diện khách Việt/Anh; dữ liệu món song ngữ |
| Khả năng mở rộng | Thêm cơ sở mới chỉ bằng cấu hình; tách dịch vụ (bếp, thanh toán) khi tải tăng; thiết kế theo log sự kiện cho phép thêm máy chủ cơ sở sau này |
