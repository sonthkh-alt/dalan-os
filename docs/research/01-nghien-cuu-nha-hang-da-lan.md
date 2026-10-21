# Nghiên cứu nền tảng cho phần mềm Nhà hàng Dạ Lan

Ngày lập: 2026-10-20. Tài liệu này tổng hợp kết quả khảo sát Nhà hàng Dạ Lan, các chuẩn
phần mềm nhà hàng trên thế giới và đặc thù thị trường Việt Nam. Mọi kết luận thiết kế ở
phần cuối đều suy ra từ các dữ kiện ở đây.

## 1. Nhà hàng Dạ Lan (Thanh Hóa)

Nguồn: https://dalan.com.vn/ và các trang con (truy cập 2026-10-20).

### 1.1 Tổ chức

| Đơn vị | Địa chỉ | Quy mô | Điện thoại |
|---|---|---|---|
| Công ty CP Dạ Lan (trụ sở) | Số 01 Phan Chu Trinh, P. Điện Biên, TP. Thanh Hóa | Chuyển đổi từ DNNN, hoạt động từ năm 2000 | 0237 385 2004 / 0237 371 7970 |
| Dạ Lan Center | Ngã tư phía Bắc, P. Hạc Thành, QL1A | Nhà hàng 5 tầng, sức chứa trên 600 khách, có phòng VIP (VIP 6-8 cải tạo 2025), thang máy | 0237 385 2004, 098 405 8966 |
| Dạ Lan Star | 630 Quang Trung 2, P. Hạc Thành | Xây trên nền Dạ Lan 2 cũ, cửa ngõ phía Nam QL1A | 0237 661 5678 |
| Dạ Lan Event | Lô 28 Công viên Hội An, P. Hạc Thành | 11.000 m², sức chứa khoảng 1.100 khách, chuyên tiệc cưới và sự kiện (có tiệc 3.000-4.000 khách) | 0237 888 6999, 0969 637 069 |
| Dạ Lan Sport | - | Gym, yoga, aerobic, tennis | 0969 949 666 |
| Nhà máy Hoàng Long | - | Rượu gạo truyền thống, nước uống tinh khiết Dạ Lan, thực phẩm chế biến | 0237 666 9999 |

Email: dalanthanhhoa@dalan.com.vn. Slogan: "Tinh hoa ẩm thực xứ Thanh".

### 1.2 Lịch sử và quy mô

- 2000-2005: 2 cơ sở dưới 900 m², 52 nhân viên.
- 2005-2010: hơn 200 nhân viên, 5 cơ sở, 22.000 m², ISO 22000:2005, bắt đầu tổ chức sự kiện (2008). Doanh thu 2010 đạt 62 tỷ đồng.
- 2010-2015: mua lại Toàn Hà (2012) làm trung tâm sự kiện, đầu tư gần 150 tỷ.
- 2015-nay: tập trung mua sắm và sản xuất, dùng phần mềm kế toán, chấm công khuôn mặt, hệ thống quản lý OneOffice. Mở rộng Dạ Lan Event (2017), cải tạo sảnh Center (2021), VIP 6-8 (2025).
- Giải thưởng: Giải Vàng Chất lượng Quốc gia 2010, Huân chương Lao động hạng Ba/Nhì/Nhất, 3 sản phẩm OCOP 3 sao (rượu gạo, giò tai, cá diếc kho tộ), Top 10 nhà hàng phục vụ khách du lịch (2017, 2025).

Ý nghĩa cho phần mềm: đây là nhà hàng quy mô lớn, nhiều cơ sở, nhiều loại hình (ăn sáng,
gọi món, cơm văn phòng, định suất, tiệc cưới, sự kiện lớn, chay), có khách du lịch, đã có
kế toán và OneOffice nên cần xuất dữ liệu kết nối.

### 1.3 Các loại thực đơn trên website

| Loại thực đơn | Hình thức trên web | Ghi chú |
|---|---|---|
| Menu Breakfast | Ảnh, 2 bản khác nhau cho Center và Event | Event có thêm món bát đá, "Chợ quê" chỉ thứ 7 và Chủ nhật |
| Thực đơn chọn món | 16 trang ảnh, giá theo nghìn đồng | Chi tiết ở mục 1.4 |
| Thực đơn định suất | Trang trống | Cần nhà hàng cung cấp |
| Cơm trưa văn phòng | 1 ảnh menu cũ (2016) | 9 món cơm phần 60-80k |
| Tiệc cưới, tiệc ngọt, tiệc mặn, tiệc tự chọn | Trang trống | Cần nhà hàng cung cấp |
| Thực đơn chay | Trang trống | Cần nhà hàng cung cấp |
| Đồ uống | 1 ảnh menu café, trà, sinh tố, nước ép | Chưa có bia, rượu, nước ngọt (chắc chắn có bán) |

### 1.4 Đặc điểm thực đơn ảnh hưởng tới mô hình dữ liệu

Dữ liệu đầy đủ đã được nhập vào `data/seed/menu-dalan.json`. Các đặc điểm quan trọng:

1. **Đơn vị tính rất đa dạng**: đĩa, bát, tô, cái, con, nồi, kg, âu, xửng, thố, niêu, miếng, thuyền, quả, phần, ấm, set. Mỗi món phải có đơn vị riêng.
2. **Hai mức giá theo cỡ** cho cùng một món (Gà ri luộc rút xương 350/550; Dê núi tái chanh 400/650; Bò sốt vang 250/450). Cần khái niệm biến thể (variant) nhỏ/lớn.
3. **Món bán theo cân** (cua gạch 1.195k/kg, tôm hùm bông 2.050k/kg, ốc hương, cá mú, ba ba): giá cuối phụ thuộc trọng lượng cân thực tế. Cần luồng "cân hàng rồi chốt giá" trên đơn.
4. **Giá theo thời điểm** (Tôm Alaska): món không có giá cố định, nhân viên nhập giá khi bán.
5. **Một nguyên liệu nhiều cách chế biến** (Cá mú: gỏi phile, nấu thuyền chài, hấp xì dầu, chiên xù; Ba ba: rang muối, om chuối đậu, nấu rượu vang, hầm táo đỏ đẳng sâm). Cần tùy chọn chế biến (modifier) bắt buộc chọn.
6. **Lựa chọn trong tên món** (ngọn bí xào/luộc, cá thu sốt cà chua/chao hành, soup gà nấm hương/đông trùng): tùy chọn chế biến không đổi giá.
7. **Thực đơn theo cơ sở và theo thời gian**: menu ăn sáng Center khác Event; "Chợ quê" chỉ cuối tuần; cơm văn phòng chỉ buổi trưa.
8. **Món ăn kèm mặc định** (Hến xào kèm bánh đa và nước cốt; lợn mán kèm xôi nếp nương).
9. **Khoảng giá rất rộng**: từ 12k (bánh lá) tới 5.350k/kg (cua huỳnh đế). Giao diện gọi món cần hiển thị giá rõ, định dạng tiền Việt.
10. Tên món dùng tiếng Việt có dấu, nhiều từ địa phương xứ Thanh (giắt, nhệch, phi cầu Sài, bánh lá răng bừa). Cần hỗ trợ tên tiếng Anh và mô tả cho khách du lịch.

## 2. Chuẩn phần mềm nhà hàng trên thế giới

Khảo sát các hệ thống dẫn đầu: Toast, Square for Restaurants, Lightspeed Restaurant, Oracle
Simphony, TouchBistro (POS); me&u/Mr Yum, sunday, GoTab (gọi món và thanh toán bằng QR);
OpenTable, Resy, SevenRooms (đặt bàn và CRM); Tripleseat, Perfect Venue (tiệc và sự kiện).

### 2.1 Những năng lực đã thành chuẩn

| Nhóm | Năng lực chuẩn | Nguồn tham chiếu |
|---|---|---|
| Sơ đồ bàn | Sơ đồ trực quan theo khu vực và tầng, trạng thái bàn theo màu, gộp/tách/chuyển bàn, bàn chờ thanh toán | Toast, Lightspeed, Sapo |
| Gọi món | Gọi món trên tablet tại bàn, ghi chú món, gửi bếp ngay, gọi theo đợt (course), giữ món (hold) và bắn món (fire) | Toast release notes, StovePOS |
| Bếp (KDS) | Định tuyến món theo trạm (bếp nóng, bếp lạnh, bar), màn hình expo tổng hợp, chỉ expo được bump cả phiếu, đo thời gian từ fire tới bump, cảnh báo màu theo thời gian | GoTab, StovePOS, Dcorp |
| Khách tự gọi món | QR theo bàn, mở "tab" trong suốt bữa, nhiều người cùng gọi vào một bàn qua link chia sẻ, chia bill theo món/phần trăm/số tiền, thanh toán tại bàn | me&u/Mr Yum, Lightspeed |
| Đặt bàn | Đặt bàn online theo khung giờ và sức chứa, xác nhận, nhắc lịch, đặt cọc chống no-show, danh sách chờ, hồ sơ khách (sinh nhật, dị ứng, sở thích) | OpenTable, SevenRooms |
| Tiệc và sự kiện | Phiếu BEO (Banquet Event Order) gồm thông tin khách, timeline, thực đơn, sơ đồ, tài chính; đặt cọc nhiều đợt; số khách và số mâm thay đổi theo thời gian | Tripleseat, Perfect Venue |
| Thanh toán | Chia bill, tiền tip, nhiều hình thức trên một hóa đơn, hoàn tiền, đối soát cuối ca | Toast, Square |
| Quản trị | Đa chi nhánh với thực đơn gốc và điều chỉnh theo chi nhánh, phân quyền theo vai trò, báo cáo theo ca/ngày/món/nhân viên, định lượng và kho | Lightspeed, Simphony |
| Kiến trúc | Local-first: ghi cục bộ trước rồi đồng bộ; log sự kiện là nguồn chân lý; gộp theo dòng món khi xung đột (không dùng last-write-wins) | Ditto, OtterPOS, thực tiễn ngành |

### 2.2 Bài học triển khai QR tại bàn

- Rào cản lớn nhất không phải công nghệ mà là thói quen: nếu nhân viên vẫn nhận gọi món bằng miệng thì khách không quét. Cần quy trình đón khách giới thiệu quét QR.
- Menu phải nhẹ, tải nhanh, mô tả ngắn, có ảnh; in URL dự phòng dưới mã QR; QR phải "động" (đổi đích đến không cần in lại).
- Luôn có đường lui khi mất mạng hoặc khách không muốn dùng điện thoại: nhân viên gọi hộ trên cùng một đơn.
- Phiên (session) theo bàn: khách quét lại vẫn vào đúng phiên; nhân viên có thể duyệt phiên lạ.

## 3. Đặc thù Việt Nam

### 3.1 Thanh toán

- QR Pay bùng nổ: 9 tháng đầu 2025 giao dịch QR tăng 61,6% về số lượng và 150,7% về giá trị (NHNN); NAPAS xử lý khoảng 15 triệu giao dịch QR mỗi ngày (11/2025). Quán ăn là nơi chấp nhận QR sớm nhất.
- **VietQR (NAPAS 247, chuẩn EMVCo)**: mã QR chuyển khoản liên ngân hàng, hơn 40 ngân hàng và ví. Mã động chứa số tiền và nội dung (mã hóa đơn) nên đối soát tự động được. Phí gần như bằng không. Đây là hình thức khách Việt dùng nhiều nhất.
- **Cổng/ví**: VNPay (redirect và IPN, HMAC-SHA512), MoMo, ZaloPay có API công khai và sandbox. Phù hợp cho đặt cọc online và thanh toán trên Mini App.
- Khung pháp lý: Nghị định 52/2024 và Thông tư 40/2024 về thanh toán không dùng tiền mặt.

### 3.2 Hóa đơn điện tử

- Nghị định 70/2025/NĐ-CP (hiệu lực 01/06/2025, sửa NĐ 123/2020): cơ sở kinh doanh ăn uống và nhà hàng bán trực tiếp cho người tiêu dùng thuộc nhóm **bắt buộc dùng hóa đơn điện tử khởi tạo từ máy tính tiền** có kết nối chuyển dữ liệu với cơ quan thuế.
- Hóa đơn từ máy tính tiền có mã cơ quan thuế, không cần chữ ký số của người bán trên từng hóa đơn.
- Các nhà cung cấp phổ biến có API: MISA meInvoice (môi trường test testapp.meinvoice.vn), Viettel SInvoice, VNPT Invoice. Phần mềm cần có lớp tích hợp (adapter) để phát hành, hủy, thay thế, điều chỉnh hóa đơn và in thông tin tra cứu lên bill.

### 3.3 Kênh khách hàng

- Zalo là kênh nhắn tin chính. Zalo OA, ZNS (tin thông báo theo mẫu) dùng để xác nhận đặt bàn, nhắc lịch, chúc sinh nhật, gửi hóa đơn. Zalo Mini App (React, zmp-ui, zmp-sdk) cho phép khách đặt bàn, gọi món, tích điểm mà không cần cài ứng dụng riêng.
- Số điện thoại là định danh khách phổ biến nhất, phù hợp với tích điểm và CRM.

### 3.4 Văn hóa ăn uống và nghiệp vụ nhà hàng Việt

- Ăn theo nhóm, món dùng chung cho cả bàn; gọi món thành nhiều đợt trong suốt bữa; bia và nước thường tính theo số vỏ đếm cuối bữa; khăn lạnh và một số đồ ăn kèm tính tiền riêng.
- Phòng VIP, phòng riêng có thể có mức chi tiêu tối thiểu; tiệc tính theo mâm (6 hoặc 10 người) với đặt cọc và chốt số mâm trước ngày tiệc.
- Khách gọi "tính tiền" tại bàn; thu ngân in bill tạm tính, khách chuyển khoản hoặc trả tiền mặt tại bàn.
- Phần mềm nội địa (MISA CukCuk, iPOS, KiotViet, Sapo FnB, POS365) đều có: sơ đồ bàn, gọi món trên điện thoại, in phiếu bếp theo khu vực, tách/gộp/chuyển bàn, tạm tính, kho định lượng, báo cáo ca. Đây là mức tối thiểu khách hàng Việt kỳ vọng.

## 4. Hệ quả thiết kế (yêu cầu rút ra)

1. **Đa cơ sở ngay từ mô hình dữ liệu**: thực đơn gốc của công ty, mỗi cơ sở bật/tắt món, đổi giá, đặt khung giờ bán. Báo cáo gộp toàn công ty và theo cơ sở.
2. **Mô hình món linh hoạt**: đơn vị tính, biến thể cỡ, tùy chọn chế biến, món theo cân, món giá theo thời điểm, món ăn kèm, trạm bếp phụ trách, ảnh và tên song ngữ.
3. **Phiên bàn (table session) là trung tâm**: mọi đơn của khách và của nhân viên trong một lượt ngồi gộp vào một phiên; hỗ trợ gộp/tách/chuyển bàn, gọi nhiều đợt, tạm tính, chia bill, đếm vỏ bia khi chốt.
4. **Bếp theo trạm với expo**: định tuyến tự động, in phiếu bếp hoặc màn hình KDS, giữ/bắn món, đo thời gian.
5. **Thanh toán kiểu Việt**: tiền mặt, VietQR động có đối soát, ví/cổng, kết hợp nhiều hình thức; phát hành hóa đơn điện tử từ máy tính tiền.
6. **Khách hàng**: đặt bàn online, QR theo bàn với phiên chia sẻ, theo dõi món, gọi phục vụ, đánh giá; định danh bằng số điện thoại, tích điểm; thông báo qua Zalo.
7. **Tiệc và sự kiện** (Dạ Lan Event là mảng lớn): báo giá theo mâm, phiếu BEO, đặt cọc nhiều đợt, chốt số mâm, phục vụ ngày tiệc, quyết toán.
8. **Chịu mất mạng**: ứng dụng vẫn gọi món và in bếp được khi internet chập chờn; đồng bộ theo log sự kiện; không mất đơn.
9. **Vận hành**: phân quyền (chủ, quản lý cơ sở, thu ngân, phục vụ, bếp, lễ tân, kế toán), ca làm việc, kết ca, nhật ký thao tác, xuất dữ liệu cho kế toán.
10. **Giao diện**: tiếng Việt mặc định, tiếng Anh cho khách; tối ưu cho điện thoại (khách), tablet (phục vụ), màn hình lớn (bếp), PC (thu ngân và quản trị).

## 5. Thông tin còn thiếu cần nhà hàng cung cấp

- Thực đơn định suất, tiệc cưới, tiệc, chay; bảng giá bia, rượu, nước ngọt.
- Sơ đồ tầng, số bàn, số phòng VIP, sức chứa từng sảnh của ba cơ sở.
- Thiết bị hiện có: máy in bếp, máy in hóa đơn, máy POS, mạng và wifi.
- Nhà cung cấp hóa đơn điện tử đang dùng, phần mềm kế toán đang dùng, ngân hàng nhận tiền.
- Chính sách: phí phục vụ, VAT (8% hay 10%), đặt cọc tiệc, mức chi tiêu tối thiểu phòng VIP, tích điểm.

## Nguồn

- Dạ Lan: https://dalan.com.vn/ , https://dalan.com.vn/qua-trinh-hinh-thanh-va-phat-trien/ , các trang thực đơn.
- POS thế giới: https://www.expertmarket.com/pos/square-vs-toast-vs-lightspeed , https://www.upmenu.com/blog/best-restaurant-pos-systems
- KDS: https://gotab.com/latest/how-a-modern-kitchen-display-system-kds-works-the-end-to-end-workflow-explained , https://stovepos.com/products/kds , https://doc.toasttab.com/doc/relnotes/techReleaseNotes2_84.html
- QR tại bàn: https://www.hungryhungry.com/en/blogs/get-customers-to-use-qr-code-ordering-at-table , https://sundayapp.com/en-gb/?p=102305 , https://gotab.com/latest/how-to-set-up-qr-code-ordering-for-hospitality-in-2026 , https://www.lightspeedhq.com/au/integrations/meandu/ , https://techcrunch.com/?p=2240007
- Tiệc và sự kiện: https://tripleseat.com/blog/everything-you-need-to-know-about-tripleseats-beos , https://www.perfectvenue.com/post/beo-software-reviews
- Kiến trúc offline-first: https://www.ditto.com/documents/technical-guide-to-point-of-sale-at-the-edge , https://techblog.cloudkitchens.com/p/otterpos-outage-resilience
- Thanh toán VN: https://thuehaiquan.tapchikinhtetaichinh.vn/thanh-toan-so-tai-viet-nam-qr-pay-bung-no-nguoi-tieu-dung-chuyen-minh-manh-me-103929.html , https://developers.zalopay.vn/downloads/api/ZaloPay-APIs-Integration-Document.pdf , https://pub.dev/packages/vietqr_gen , https://vnpay.js.org/en/troubleshooting
- Hóa đơn điện tử: https://www.meinvoice.vn/tin-tuc/18021/tong-hop-cac-quy-dinh-ve-hoa-don-dien-tu-khoi-tao-tu-may-tinh-tien/ , https://xcyber.vn/hoa-don-khoi-tao-tu-may-tinh-tien/ , http://doc.meinvoice.vn/about/
- Zalo: https://github.com/Zalo-MiniApp/zaui-restaurant , https://advertisingvietnam.com/article/zalo-engagement-solution-cho-fb-xay-dung-kenh-ban-hang-va-cham-soc-khach-hang-toan-dien
- Phần mềm VN: https://amis.misa.vn/236515/phan-mem-quan-ly-nha-hang/ , https://www.sapo.vn/blog/phan-mem-order-tot-nhat , https://viindoo.com/blog/quan-tri-doanh-nghiep-3/phan-mem-quan-ly-nha-hang-544
