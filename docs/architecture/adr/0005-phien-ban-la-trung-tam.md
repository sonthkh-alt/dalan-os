# ADR 0005: Phiên bàn là đơn vị gom mọi đơn của một lượt khách

Ngày: 2026-10-20. Trạng thái: Chấp nhận.

## Bối cảnh
Khách Việt gọi món nhiều đợt, nhiều người cùng gọi, bàn gộp tách thường xuyên, bia tính theo vỏ
cuối bữa, bill chia nhiều cách. Mô hình "một đơn hàng = một giao dịch" của thương mại điện tử
không phù hợp.

## Quyết định
Mô hình ba tầng:
- **TableSession** (phiên bàn): một lượt khách ngồi, gắn một hoặc nhiều bàn, nhiều người tham gia
  (nhân viên và khách QR), có trạng thái vòng đời. Phiên là phòng realtime, là phạm vi của token
  khách, là đối tượng gộp/tách/chuyển.
- **Order** (đơn): một lần gửi bếp trong phiên, có nguồn và người gửi.
- **OrderLine** (dòng): một món với biến thể, tùy chọn, số lượng, giá snapshot, course, trạng thái
  bếp riêng, người gọi (để chia tiền theo người).
- **Bill** tham chiếu các dòng (hoặc phần của dòng khi chia đều) chứ không tham chiếu đơn; một
  phiên có nhiều bill.
- **KitchenTicket** sinh từ đơn theo trạm; là hình chiếu phục vụ bếp, không phải nguồn sự thật.

## Hệ quả
- Gộp bàn chỉ là đổi `sessionId` của các đơn và cập nhật danh sách bàn; lịch sử nguyên vẹn.
- Đếm vỏ tạo dòng điều chỉnh trong một đơn hệ thống của phiên, có nhật ký.
- Báo cáo lượt bàn, thời gian ngồi, doanh thu mỗi khách tính trực tiếp từ phiên.
