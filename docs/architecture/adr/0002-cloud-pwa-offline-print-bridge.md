# ADR 0002: Máy chủ cloud, PWA chịu mất mạng, cầu in cục bộ, log sự kiện

Ngày: 2026-10-20. Trạng thái: Chấp nhận. Người dùng ủy quyền cho Claude quyết định.

## Bối cảnh
Hai lựa chọn: (A) máy chủ cloud duy nhất với ứng dụng web; (B) máy chủ tại từng cơ sở đồng bộ
lên cloud. Dạ Lan có ba cơ sở lớn; mất internet vài phút là chuyện có thể xảy ra, nhưng duy trì
ba máy chủ tại chỗ cần nhân sự kỹ thuật thường trực.

## Quyết định
Chọn (A) kèm ba biện pháp chịu lỗi:
1. Ứng dụng nhân viên là PWA với hàng đợi lệnh offline (IndexedDB) và khóa chống trùng; thực đơn,
   sơ đồ bàn, phiên đang mở được đệm cục bộ.
2. Cầu in tại mỗi cơ sở nhận lệnh in từ máy chủ và cả từ thiết bị trong LAN khi internet đứt,
   nên bếp vẫn nhận phiếu giấy.
3. Mọi thay đổi trạng thái ghi vào bảng sự kiện (outbox) có số thứ tự theo cơ sở; realtime, in,
   HĐĐT, kho, điểm đều tiêu thụ từ đó.

Khuyến nghị hạ tầng tại cơ sở: router có SIM 4G dự phòng tự chuyển mạng.

## Hệ quả
- Vận hành đơn giản, một nơi nâng cấp, chi phí thấp.
- Khi mất internet, các tính năng cần máy chủ (thanh toán điện tử, HĐĐT, đặt bàn online) tạm dừng;
  gọi món và in bếp vẫn chạy ở mức cơ bản.
- Nhờ outbox và khóa chống trùng, sau này có thể bổ sung máy chủ cơ sở (phương án B) bằng cách
  chạy cùng mã API tại chỗ và đồng bộ sự kiện hai chiều, không phải viết lại nghiệp vụ.
