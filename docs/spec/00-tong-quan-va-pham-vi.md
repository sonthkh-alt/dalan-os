# Đặc tả tổng quan: Hệ thống quản lý và đặt món Nhà hàng Dạ Lan

Phiên bản 1.0, ngày 2026-10-20. Tên mã dự án: **DaLan OS**.

## 1. Mục tiêu

Xây dựng một hệ thống duy nhất phục vụ cả **khách hàng** và **nhà hàng** tại ba cơ sở Dạ Lan
Center, Dạ Lan Star, Dạ Lan Event, đạt chuẩn vận hành của các nền tảng nhà hàng hàng đầu thế
giới (Toast, Lightspeed, me&u, SevenRooms, Tripleseat) và tuân thủ đầy đủ quy định, thói quen
thanh toán, kênh liên lạc tại Việt Nam.

Mục tiêu đo được sau 6 tháng vận hành:

| Chỉ số | Hiện trạng (ước) | Mục tiêu |
|---|---|---|
| Thời gian từ lúc khách gọi tới lúc bếp nhận phiếu | 3-8 phút (ghi tay, chạy xuống bếp) | dưới 30 giây |
| Sai sót đơn hàng (ghi nhầm, quên món) | không đo được | dưới 1% số dòng món |
| Thời gian thanh toán tại bàn | 5-10 phút | dưới 2 phút |
| Tỷ lệ hóa đơn điện tử phát hành đúng hạn | thủ công | 100%, tự động |
| Tỷ lệ đặt bàn online được xác nhận tự động | 0% | trên 80% |
| Tỷ lệ no-show đặt bàn | không đo được | giảm 50% nhờ nhắc lịch và đặt cọc |
| Thời gian lập báo giá và BEO cho một tiệc cưới | hàng giờ, Excel | dưới 15 phút |
| Chênh lệch kiểm kê kho so với định lượng | không đo được | nhìn thấy theo ngày |

## 2. Người dùng và vai trò

### 2.1 Khách hàng (không cần tài khoản)
- **Khách tại bàn**: quét QR, xem thực đơn song ngữ, gọi món cùng nhóm, theo dõi món, gọi nhân viên, xem bill tạm tính, chia tiền, thanh toán, nhận hóa đơn điện tử, đánh giá.
- **Khách đặt bàn**: đặt bàn hoặc phòng VIP online, đặt cọc khi cần, nhận xác nhận và nhắc lịch qua Zalo, đặt món trước.
- **Khách thành viên**: đăng nhập bằng số điện thoại (OTP) hoặc Zalo, tích điểm, nhận ưu đãi sinh nhật, xem lịch sử.
- **Khách tổ chức tiệc**: gửi yêu cầu báo giá tiệc cưới, hội nghị, gala; theo dõi hợp đồng, lịch đặt cọc.

### 2.2 Nhân sự nhà hàng
| Vai trò | Thiết bị chính | Việc chính |
|---|---|---|
| Phục vụ (waiter) | Điện thoại hoặc tablet | Mở bàn, gọi món, gửi bếp, báo món lên, xử lý yêu cầu khách, tạm tính |
| Lễ tân / Host | Tablet hoặc PC | Đặt bàn, xếp bàn, danh sách chờ, đón khách, check-in |
| Thu ngân (cashier) | PC hoặc tablet có máy in | Tính tiền, chia bill, thu tiền, VietQR, hóa đơn điện tử, kết ca |
| Bếp / Bar | Màn hình bếp (KDS) hoặc máy in phiếu | Nhận phiếu theo trạm, báo xong, báo hết món |
| Quản lý cơ sở | PC, điện thoại | Sơ đồ bàn, nhân sự, ca, duyệt hủy món và giảm giá, báo cáo cơ sở |
| Nhân viên kinh doanh tiệc | PC | Lead, báo giá, hợp đồng, BEO, lịch sảnh |
| Thủ kho / Mua hàng | PC, điện thoại | Nhập hàng, chuyển kho, kiểm kê, định lượng |
| Kế toán | PC | Đối soát thanh toán, hóa đơn điện tử, xuất dữ liệu kế toán |
| Ban giám đốc | Điện thoại, PC | Báo cáo toàn công ty theo thời gian thực |
| Quản trị hệ thống | PC | Cấu hình, phân quyền, tích hợp, thiết bị |

## 3. Phạm vi chức năng (giai đoạn 1, bàn giao theo đợt)

| Mô-đun | Nội dung | Đợt |
|---|---|---|
| A. Nền tảng | Tổ chức, cơ sở, khu vực, bàn và phòng, nhân sự, vai trò, ca làm việc, thiết bị, cấu hình thuế và phí | 1 |
| B. Thực đơn | Món, danh mục, thực đơn theo lịch, biến thể, tùy chọn chế biến, món theo cân, giá theo thời điểm, định suất và combo, điều chỉnh theo cơ sở, ảnh, song ngữ, hết món | 1 |
| C. Vận hành bàn | Sơ đồ bàn trực quan, phiên bàn, gọi món nhiều đợt, gộp/tách/chuyển bàn, gọi theo course, ghi chú, hủy món có duyệt | 1 |
| D. Bếp và bar | Định tuyến theo trạm, KDS, in phiếu bếp, expo, bump, thời gian chế biến, hết món | 1 |
| E. Thanh toán | Tạm tính, chia bill, giảm giá, phí phục vụ, VAT, tiền mặt, VietQR động, thẻ và Apple Pay tại máy POS ngân hàng, VNPay, MoMo, ZaloPay, Apple Pay online qua cổng, đặt cọc, hoàn tiền, kết ca | 1 |
| F. Hóa đơn điện tử | Phát hành từ máy tính tiền theo NĐ 70/2025 qua MISA, Viettel hoặc VNPT; hủy, thay thế, điều chỉnh; tra cứu | 2 |
| G. Ứng dụng khách | QR theo bàn, phiên nhóm, menu, gọi món, theo dõi, gọi phục vụ, bill, chia tiền, thanh toán, đánh giá, PWA song ngữ | 1 |
| H. Đặt bàn | Đặt bàn online theo khung giờ và sức chứa, phòng VIP, đặt cọc, xác nhận và nhắc lịch qua ZNS, danh sách chờ, check-in | 2 |
| I. Khách hàng và tích điểm | Hồ sơ khách theo số điện thoại, hạng thành viên, điểm, voucher, sinh nhật, lịch sử, Zalo OA và Mini App | 2 |
| J. Tiệc và sự kiện | Lead, báo giá theo mâm, hợp đồng, lịch đặt cọc, chốt thực đơn và số mâm, BEO, lịch sảnh, ngày tiệc, quyết toán | 3 |
| K. Kho và định lượng | Nguyên liệu, đơn vị quy đổi, định lượng theo món, nhập hàng, chuyển kho, kiểm kê, hao hụt, cảnh báo tồn, giá vốn | 3 |
| L. Báo cáo và quản trị | Doanh thu đa chiều, báo cáo ca, bếp, đặt bàn, tiệc, kho, tích điểm, xuất Excel, nhật ký thao tác, kết nối kế toán | 1-3 |
| M. In ấn | Cầu in cục bộ cho máy in bếp và máy in hóa đơn ESC/POS, mẫu in tiếng Việt | 1 |

Ngoài phạm vi giai đoạn 1: giao hàng tận nơi và kết nối ShopeeFood/GrabFood, chấm công và tính
lương (đã có hệ thống riêng), kế toán tổng hợp (xuất dữ liệu sang phần mềm kế toán hiện có),
Dạ Lan Sport và nhà máy.

## 4. Nguyên tắc thiết kế

1. **Một nguồn sự thật cho mỗi lượt khách**: mọi hành động của khách và nhân viên trong một lượt ngồi gom về một *phiên bàn*. Không có đơn "mồ côi".
2. **Không bao giờ mất đơn**: ứng dụng ghi lệnh cục bộ trước, gửi lên máy chủ sau; mỗi lệnh có khóa chống trùng; mất mạng vẫn gọi món và in bếp qua cầu in cục bộ.
3. **Tiếng Việt là ngôn ngữ gốc**: dữ liệu, giao diện, mẫu in, thông báo đều tiếng Việt chuẩn; tiếng Anh là bản dịch cho khách.
4. **Đúng luật Việt Nam từ đầu**: hóa đơn điện tử từ máy tính tiền, VAT theo cấu hình, lưu vết sửa xóa, bảo vệ dữ liệu cá nhân theo Nghị định 13/2023.
5. **Tích hợp qua bộ chuyển đổi**: thanh toán, hóa đơn điện tử, Zalo, máy in đều đi qua giao diện chung; đổi nhà cung cấp không đổi nghiệp vụ.
6. **Đa cơ sở ngay từ mô hình dữ liệu**: thực đơn gốc toàn công ty, mỗi cơ sở tùy biến; báo cáo gộp và tách.
7. **Thiết kế cho tay bận và ánh sáng kém**: nút lớn, ít bước, phản hồi tức thì, hoạt động tốt trên điện thoại tầm trung và wifi chập chờn.

## 5. Ràng buộc và giả định

- Tiền tệ: VND, số nguyên, không có số lẻ; lưu bằng số nguyên 64-bit vì hóa đơn tiệc có thể vượt 2 tỷ đồng.
- Múi giờ: Asia/Ho_Chi_Minh; ngày kinh doanh có thể kết thúc sau nửa đêm (cấu hình giờ chốt ngày, mặc định 04:00).
- Giá niêm yết đã gồm VAT (thói quen Việt Nam); hệ thống hỗ trợ cả giá chưa gồm VAT theo cấu hình cơ sở.
- Phí phục vụ: mặc định 0%, bật được theo cơ sở, khu vực (phòng VIP) hoặc loại tiệc.
- Khách không bắt buộc đăng nhập để gọi món tại bàn.
- Nhà hàng cung cấp sau: thực đơn định suất, tiệc, chay; giá bia rượu; sơ đồ tầng và danh sách bàn; thiết bị in hiện có; nhà cung cấp hóa đơn điện tử; tài khoản ngân hàng nhận VietQR; hợp đồng merchant VNPay, MoMo, ZaloPay, OnePay (Apple Pay).
- Apple Pay tại Việt Nam: NAPAS triển khai cho thẻ nội địa từ 04/2025; tại quầy, Apple Pay là giao dịch thẻ không tiếp xúc trên máy POS của ngân hàng; online đi qua cổng có hỗ trợ Apple Pay (OnePay, VNPay theo lộ trình NAPAS). Hệ thống coi Apple Pay là một *phương thức* trên hai *kênh* đó.

## 6. Tài liệu liên quan

- `01-van-hanh-nha-hang.md`: thực đơn, bàn, gọi món, bếp, thanh toán, hóa đơn điện tử, ca.
- `02-khach-hang.md`: ứng dụng khách, đặt bàn, thành viên, Zalo.
- `03-tiec-su-kien.md`: tiệc cưới và sự kiện.
- `04-kho-dinh-luong.md`: kho và định lượng.
- `05-quan-tri-bao-cao.md`: quản trị, báo cáo, phân quyền, nhật ký.
- `../architecture/kien-truc-tong-the.md` và các ADR trong `../architecture/adr/`.
- `../research/01-nghien-cuu-nha-hang-da-lan.md`: cơ sở nghiên cứu.
