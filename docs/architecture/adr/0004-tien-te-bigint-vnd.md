# ADR 0004: Tiền tệ lưu BigInt VND, snapshot giá trên dòng

Ngày: 2026-10-20. Trạng thái: Chấp nhận.

## Bối cảnh
VND không có phần lẻ. Một hóa đơn tiệc 300 mâm × 5.000.000đ = 1,5 tỷ, cộng dịch vụ có thể vượt
2.147.483.647 (giới hạn `INTEGER` 32-bit). Thực đơn đổi giá thường xuyên nhưng báo cáo lịch sử
phải bất biến.

## Quyết định
- Mọi cột tiền là `BIGINT` (Prisma `BigInt`), đơn vị đồng. Ở biên API chuyển sang `number`
  (an toàn tới 9×10^15) và JSON serialize dạng số.
- Phần trăm (giảm giá, phí phục vụ, thuế) lưu theo *phần vạn* (basis points, 10% = 1000) dạng
  số nguyên để tránh số thực.
- Phép tính tiền thực hiện trong `packages/domain` bằng số nguyên; làm tròn theo quy tắc cấu
  hình (`none`, `nearest_500`, `nearest_1000`), và luôn làm tròn **sau cùng**, chỉ trên tổng.
- Dòng đơn chụp lại: tên món, biến thể, tùy chọn, đơn giá, thuế suất, trạm tại thời điểm gọi.

## Hệ quả
- Không bao giờ sai số do số thực; báo cáo không đổi khi sửa thực đơn.
- Cần tiện ích định dạng tiền Việt (`1.234.000 ₫`) dùng chung.
