# Đặc tả nghiệp vụ: Tiệc cưới và sự kiện (J)

Dạ Lan Event (1.100 khách, tiệc tới 3.000-4.000 khách) và các sảnh của Center, Star là
mảng doanh thu lớn. Mô-đun này thay thế Excel và sổ tay bằng một quy trình từ lead tới
quyết toán, theo chuẩn Banquet Event Order (BEO) của ngành.

## J1. Quy trình và trạng thái

```
LEAD → QUOTED → CONTRACTED → CONFIRMED → BEO_ISSUED → IN_PROGRESS → SETTLED → CLOSED
                     ↘ CANCELLED (ở bất kỳ bước nào trước IN_PROGRESS, có chính sách hoàn cọc)
```

| Bước | Việc | Ai |
|---|---|---|
| LEAD | Ghi nhận yêu cầu (từ form web, Zalo, điện thoại, walk-in): loại tiệc, ngày dự kiến, số mâm hoặc số khách, ngân sách, liên hệ | Kinh doanh tiệc |
| QUOTED | Lập báo giá: chọn sảnh, thực đơn theo mâm, dịch vụ kèm, chính sách đồ uống; xuất PDF báo giá gửi khách qua Zalo/email; nhiều phiên bản | Kinh doanh |
| CONTRACTED | Ký hợp đồng, ghi lịch đặt cọc (đợt 1 khi ký, đợt 2 trước N ngày, còn lại sau tiệc), thu cọc đợt 1, khóa lịch sảnh | Kinh doanh, thu ngân |
| CONFIRMED | Chốt thực đơn cuối, số mâm chính thức và mâm dự phòng, sơ đồ bàn tiệc, kịch bản chương trình, thu cọc đợt 2 | Kinh doanh, khách |
| BEO_ISSUED | Phát hành BEO (bản 1, 2, 3...) cho bếp, phục vụ, kỹ thuật, kho; bếp nhận bảng định lượng = số mâm × suất | Kinh doanh, quản lý |
| IN_PROGRESS | Ngày tiệc: check-in, mâm phát sinh, đồ uống thực dùng, dịch vụ phát sinh, sự cố | Quản lý tiệc |
| SETTLED | Quyết toán: mâm thực tế, đồ uống theo vỏ, phát sinh, trừ cọc, thanh toán còn lại, hóa đơn điện tử | Thu ngân, kế toán |
| CLOSED | Lưu hồ sơ, chăm sóc sau tiệc (cảm ơn, mời đánh giá, kỷ niệm ngày cưới năm sau) | CRM |

## J2. Dữ liệu

- **Sảnh** (Hall): thuộc cơ sở, sức chứa theo kiểu bố trí (bàn tròn 10, bàn tròn 6, hội nghị, tiệc đứng), thời gian dọn giữa hai tiệc, giá thuê (nếu tách), thiết bị cố định.
- **Sự kiện** (EventBooking): mã, loại (cưới, hỏi, hội nghị, gala, khai trương, kỷ niệm, sinh nhật, họp lớp, liên hoan), khách hàng, sảnh (một hoặc nhiều), ngày, giờ bắt đầu và kết thúc, số mâm dự kiến, số mâm chốt, mâm dự phòng, số khách mỗi mâm (6 hoặc 10), ghi chú, nhân viên phụ trách, trạng thái.
- **Thực đơn tiệc** (EventMenu): một hoặc nhiều set theo mâm (tiệc mặn, tiệc ngọt, tự chọn, chay) với các món và số lượng mỗi mâm; giá mỗi mâm; cho phép thay món và điều chỉnh giá; snapshot khi chốt.
- **Dịch vụ kèm** (EventService): MC, ca sĩ, ban nhạc, trang trí sân khấu, cổng hoa, bánh cưới, tháp ly, rượu khai tiệc, pháo kim tuyến, màn hình LED, âm thanh ánh sáng, nhân sự phục vụ thêm, chụp ảnh, xe đưa đón... với đơn giá và số lượng; danh mục dịch vụ chuẩn có giá niêm yết.
- **Chính sách đồ uống**: gói trọn (bao gồm N chai mỗi mâm), tính theo thực tế (đếm vỏ cuối tiệc), khách mang vào (phí khui), kết hợp.
- **Lịch đặt cọc** (DepositSchedule): các đợt với số tiền (hoặc phần trăm), hạn, trạng thái, thanh toán gắn.
- **BEO** (EventOrderSheet): phiên bản, ngày phát hành, nội dung đầy đủ: thông tin khách, timeline chương trình, sơ đồ sảnh, thực đơn và số mâm, bảng định lượng cho bếp, dịch vụ, phân công nhân sự, lưu ý đặc biệt (dị ứng, khách VIP, tôn giáo), điều khoản tài chính. Xuất PDF và in.
- **Phát sinh ngày tiệc** (EventAdjustment): mâm thêm, đồ uống thực dùng, dịch vụ thêm, hỏng vỡ, giảm giá thiện chí; mỗi dòng có người ghi và thời điểm.

## J3. Chức năng

- **J3.1** Lịch sảnh theo tháng/tuần/ngày với trạng thái (giữ chỗ tạm, đã ký, đã chốt), cảnh báo trùng và thời gian dọn; giữ chỗ tạm hết hạn tự động sau 48 giờ nếu chưa cọc.
- **J3.2** Báo giá nhanh: chọn mẫu theo loại tiệc, nhập số mâm, hệ thống tính tổng, đề xuất gói; so sánh 2-3 phương án trong một báo giá.
- **J3.3** Hợp đồng: sinh từ mẫu Word/PDF với dữ liệu điền sẵn; lưu bản ký (ảnh/PDF).
- **J3.4** Bảng định lượng bếp: từ thực đơn × số mâm (gồm dự phòng) ra số lượng nguyên liệu (kết nối mô-đun kho); lịch chuẩn bị theo giờ.
- **J3.5** Ngày tiệc trên tablet: danh sách mâm theo sơ đồ, đánh dấu mâm đã dọn, mâm phát sinh, ghi đồ uống theo bàn hoặc toàn tiệc, yêu cầu phát sinh; đồng bộ với bếp.
- **J3.6** Quyết toán: bảng tổng hợp mâm, đồ uống, dịch vụ, phát sinh, giảm giá, cọc đã thu, còn phải thu; thanh toán nhiều hình thức; hóa đơn điện tử theo thông tin công ty hoặc cá nhân; biên bản nghiệm thu.
- **J3.7** Báo cáo tiệc: pipeline theo tháng (lead, tỷ lệ chốt), doanh thu theo loại tiệc và sảnh, công suất sảnh, công nợ cọc, tiệc sắp tới trong 7/30 ngày.
- **J3.8** Form yêu cầu tiệc trên web khách và Zalo Mini App tạo lead tự động; ZNS xác nhận đã nhận yêu cầu, nhắc lịch cọc, xác nhận BEO.

## J4. Tiêu chí nghiệm thu

- Tạo tiệc cưới 80 mâm × 10 khách, set 3.500.000đ/mâm, dịch vụ 25.000.000đ, cọc 30% khi ký và 40% trước 7 ngày; hệ thống tính tổng 305.000.000đ, lịch cọc 91.500.000đ và 122.000.000đ; lịch sảnh khóa đúng ngày; BEO v1 xuất PDF đầy đủ.
- Ngày tiệc phát sinh 4 mâm và 30 chai bia; quyết toán ra số còn phải thu đúng; hóa đơn điện tử phát hành với mã số thuế công ty.
