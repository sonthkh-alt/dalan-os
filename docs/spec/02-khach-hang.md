# Đặc tả nghiệp vụ: Khách hàng

Bao gồm ứng dụng khách (G), đặt bàn (H), thành viên và Zalo (I).

## G. Ứng dụng khách tại bàn

### G1. Vào bàn
- **G1.1** Khách quét QR trên bàn → trang web nhẹ (PWA, dưới 200 KB lần đầu, có bộ nhớ đệm), tự nhận ngôn ngữ thiết bị (tiếng Việt mặc định, tiếng Anh nếu máy đặt tiếng Anh), đổi được.
- **G1.2** Nếu bàn đang có phiên: khách tham gia phiên hiện có (theo cấu hình: tự do, hoặc cần mã 4 số hiển thị trên điện thoại người đầu tiên, hoặc nhân viên duyệt). Nếu bàn trống: tạo phiên chờ xác nhận.
- **G1.3** Khách đặt biệt danh (tùy chọn) để chia tiền theo người; không bắt buộc đăng nhập. Thiết bị nhớ phiên trong 6 giờ.
- **G1.4** Nếu QR bị in sai bàn hoặc khách đổi bàn, nhân viên có thể "gắn lại" phiên; khách không tự đổi bàn.

### G2. Thực đơn và gọi món
- **G2.1** Thực đơn theo cơ sở, theo khung giờ hiện tại; danh mục dạng tab cuộn ngang, tìm kiếm có dấu và không dấu, bộ lọc (chay, hải sản, đặc sản, món bán chạy, dưới 100k), ảnh món, mô tả ngắn, nhãn (cay, có hạt, đồ sống).
- **G2.2** Chi tiết món: ảnh lớn, mô tả, biến thể, nhóm tùy chọn bắt buộc và không bắt buộc, ghi chú tự do, số lượng; món theo cân hiển thị giá trên kg và ghi chú "giá chốt theo cân thực tế"; món giá theo thời điểm hiển thị "hỏi nhân viên".
- **G2.3** Giỏ chung theo phiên: mọi người trong bàn thấy giỏ cập nhật thời gian thực, mỗi dòng ghi ai thêm; ai cũng gửi được (cấu hình: chỉ người mở phiên được gửi).
- **G2.4** Gửi đơn → xác nhận → theo dõi trạng thái từng món (đã nhận, đang làm, sẵn sàng, đã ra bàn) với thời gian ước tính.
- **G2.5** Gợi ý: món bán chạy, món thường gọi cùng, món theo mùa, đồ uống khi giỏ chưa có đồ uống; không quá hai gợi ý một lần.
- **G2.6** Gọi nhân viên, xin thêm (đá, chén, khăn), xin tính tiền với một chạm; thấy trạng thái "nhân viên đang tới".

### G3. Thanh toán trên điện thoại
- **G3.1** Xem bill tạm tính thời gian thực; chọn trả toàn bộ, trả phần của mình, chia đều, hoặc số tiền tùy ý.
- **G3.2** Thanh toán bằng VietQR (hiện QR và nút "mở app ngân hàng" deeplink), VNPay, MoMo, ZaloPay, Apple Pay (trên iPhone, qua cổng hỗ trợ); trạng thái cập nhật tức thì khi webhook về.
- **G3.3** Nhập thông tin xuất hóa đơn điện tử trước khi trả; nhận link hóa đơn sau khi trả.
- **G3.4** Nhận biên nhận điện tử qua Zalo hoặc email nếu muốn; đánh giá bữa ăn (1-5 sao, nhận xét, chọn món thích), gửi riêng cho nhà hàng; điểm thấp tạo cảnh báo cho quản lý trong ngày.

### G4. Chất lượng
- Tải lần đầu dưới 2 giây trên 4G; thao tác tới gửi đơn không quá 4 chạm cho một món không tùy chọn.
- Chạy trên Safari iOS 15+, Chrome Android 8+, không cần cài; hoạt động tiếp khi mạng chập chờn (giỏ lưu cục bộ).
- Tuân thủ WCAG AA về tương phản và kích thước chạm (tối thiểu 44 px).

## H. Đặt bàn

- **H1.1** Khách chọn cơ sở, ngày, giờ (theo khung 15 phút), số khách, loại chỗ (sảnh chung, phòng VIP, ngoài trời), yêu cầu đặc biệt (sinh nhật, ghế trẻ em, dị ứng), số điện thoại và tên; đăng nhập Zalo để điền nhanh.
- **H1.2** Khả dụng tính theo sức chứa khu vực, thời lượng ngồi mặc định (90 phút sảnh, 150 phút phòng VIP, cấu hình), bàn đã đặt, phiên đang mở; gợi ý giờ gần nhất khi hết chỗ; danh sách chờ.
- **H1.3** Chính sách đặt cọc theo cơ sở: không cọc; cọc với nhóm từ N khách; cọc phòng VIP; cọc ngày lễ. Cọc thanh toán qua VNPay/MoMo/ZaloPay/VietQR, ghi nhận thành khoản đặt cọc và trừ vào bill khi dùng bữa; hoàn theo chính sách khi hủy đúng hạn.
- **H1.4** Xác nhận: tự động khi đủ điều kiện; hoặc lễ tân duyệt trong 15 phút. Gửi ZNS (hoặc SMS dự phòng) xác nhận, nhắc trước 24 giờ và 2 giờ với nút xác nhận lại hoặc hủy; nhắc lễ tân gọi điện với nhóm lớn.
- **H1.5** Lễ tân: lịch đặt bàn theo ngày và khung giờ, kéo thả gán bàn, xem trùng lịch, ghi chú khách (lần thứ mấy, sở thích, dị ứng), check-in mở phiên bàn kèm số khách thực tế, đánh dấu no-show.
- **H1.6** Đặt món trước cho đặt bàn (ví dụ đặt cả mâm cho đoàn 20 khách): các món vào phiên dưới dạng đơn đặt trước, bếp nhận lịch chuẩn bị, tự gửi khi check-in.
- **H1.7** Đoàn du lịch và cơm đoàn: đặt bàn số lượng lớn với thực đơn định suất theo mâm, hóa đơn cho công ty lữ hành (công nợ).

## I. Thành viên, chăm sóc khách hàng và Zalo

### I1. Hồ sơ khách
- **I1.1** Khách định danh bằng số điện thoại; gộp hồ sơ khi trùng; thuộc tính: tên, ngày sinh, giới tính, Zalo ID, email, công ty và mã số thuế (xuất hóa đơn), ghi chú dị ứng và sở thích, nhãn (VIP, doanh nghiệp, lữ hành), đồng ý nhận tin.
- **I1.2** Lịch sử: lần ghé, tổng chi tiêu, món hay gọi, đặt bàn, tiệc, đánh giá, voucher đã dùng.
- **I1.3** Bảo vệ dữ liệu cá nhân (Nghị định 13/2023): ghi nhận đồng ý, mục đích; khách yêu cầu xóa dữ liệu thì ẩn danh hóa; phân quyền xem số điện thoại đầy đủ.

### I2. Tích điểm và ưu đãi
- **I2.1** Tích điểm theo chi tiêu (cấu hình: 10.000đ = 1 điểm), hạng thành viên (Bạc, Vàng, Kim cương) theo chi tiêu 12 tháng với hệ số tích điểm và quyền lợi riêng; điểm hết hạn theo cấu hình.
- **I2.2** Đổi điểm thành giảm giá trên bill hoặc đổi món; voucher theo mã hoặc theo hồ sơ, điều kiện (giá trị tối thiểu, cơ sở, khung giờ, món áp dụng), giới hạn số lần.
- **I2.3** Chiến dịch: sinh nhật (tặng voucher trước 3 ngày qua ZNS), khách lâu không quay lại, khách mới sau lần đầu, mời đánh giá.
- **I2.4** Nhân viên thấy hạng và ghi chú khách ngay khi mở bàn hoặc check-in (cả khi khách quét QR và đăng nhập).

### I3. Zalo
- **I3.1** Zalo OA: gửi ZNS theo mẫu đã duyệt cho các sự kiện: xác nhận đặt bàn, nhắc lịch, biên nhận thanh toán, hóa đơn điện tử, xác nhận đặt cọc tiệc, sinh nhật, mời đánh giá. SMS dự phòng khi ZNS không gửi được.
- **I3.2** Zalo Mini App "Dạ Lan": đăng nhập bằng Zalo, xem thực đơn, đặt bàn, gọi món khi quét QR trong Zalo, xem điểm và voucher, lịch sử, gửi yêu cầu tiệc; dùng chung API với web khách.
- **I3.3** Chat OA: tin nhắn khách gửi tới OA hiển thị cho lễ tân trong app nhân viên (giai đoạn sau).
