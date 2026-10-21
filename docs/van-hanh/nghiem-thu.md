# Bản đồ nghiệm thu

Mỗi tiêu chí nghiệm thu trong đặc tả được gắn với kiểm thử tự động hoặc bước kiểm tra tay.
Trạng thái cập nhật 2026-10-21.

## Kết quả kiểm thử tự động

| Bộ kiểm thử | Phạm vi | Kết quả |
|---|---|---|
| `packages/domain` (Vitest) | Tiền tệ, VietQR, tính bill, giá dòng món, máy trạng thái, lịch bán, tích điểm, tiệc | 52/52 đạt |
| `packages/contracts` (Vitest) | Schema PATCH không áp giá trị mặc định | 5/5 đạt |
| `apps/print-bridge` (Vitest) | Mã hóa ESC/POS raster, định dạng tiền | 14/14 đạt |
| `apps/staff`, `apps/guest` (Vitest) | Client API, giỏ hàng | 3/3, 2/2 đạt |
| `apps/api/scripts/smoke.mjs` | Lõi vận hành: bàn, gọi món, bếp, bill, VietQR, khách QR, VIP, ca | 48/48 đạt |
| `apps/api/scripts/smoke-reservations.mjs` | Đặt bàn, danh sách chờ, nhắc lịch, khách hàng, điểm, voucher, sinh nhật, ZNS (mock) | 61/61 đạt |
| `apps/api/scripts/smoke-payments.mjs` | Cổng thanh toán (mock) và hóa đơn điện tử (mock) | 30/30 đạt |
| `apps/api/scripts/smoke-events-inventory.mjs` | Tiệc 80 mâm, kho, định lượng, kiểm kê, báo cáo, CSV | 60/60 đạt |
| `apps/api/scripts/smoke-dining-extra.mjs` | Gộp bàn, chia bill theo khách, hủy món vượt hạn mức cần PIN quản lý | 14/14 đạt |
| `apps/api/scripts/smoke-regressions.mjs` | Không lộ mã băm, PATCH không ghi đè, cọc đặt bàn, danh sách chờ, chuyển kho thiếu, QUOTED → LEAD, đăng nhập Zalo | 19/19 đạt |

## Theo tiêu chí đặc tả

| Mã | Tiêu chí (tóm tắt) | Kiểm thử | Trạng thái |
|---|---|---|---|
| B3 | Gà ri luộc rút xương 2 biến thể, gọi cỡ lớn ghi 550k | pricing.test; smoke | Đạt |
| B3 | Cua gạch 1,2 kg rang me = 1.434.000đ, phiếu bếp ghi cân và cách chế biến | pricing.test; smoke; PNG mô phỏng cầu in | Đạt |
| B3 | Chợ quê chỉ ở Event thứ 7, CN 06:00-10:00 | business-date.test; seed ẩn món theo cơ sở | Đạt |
| C4 | Khách quét QR → PENDING; gửi món → nhân viên xác nhận → bếp nhận phiếu | smoke mục 13 | Đạt |
| C4 | Gộp bàn → một phiên hai bàn, bill chung | smoke-dining-extra mục 1 | Đạt |
| C4 | Hủy món đã gửi bếp trên 200.000đ yêu cầu PIN quản lý | smoke-dining-extra mục 3 (tài khoản phục vụ, PIN sai, PIN quản lý) | Đạt |
| C4 | Mất mạng vẫn gọi món, đơn tới bếp đúng một lần | Idempotency-Key (smoke) + hàng đợi offline app nhân viên | Đạt API; UI chưa thử trên trình duyệt |
| D | KDS màu theo tuổi, bump, recall, expo | smoke "bump phiếu"; app nhân viên `/kds` | Đạt API; UI build đạt |
| E4 | 1.000.000đ, giảm 10%, phí phục vụ 5%, VAT 8% gồm giá → 945.000đ; VietQR đúng số tiền | billing.test; vietqr.test; smoke | Đạt |
| E4 | Chia bill theo người, mỗi khách tự trả | smoke-dining-extra mục 2 | Đạt |
| E4 | Đếm vỏ 10 gọi, 12 đếm → thêm 2 bia có nhật ký | empties.test; smoke | Đạt |
| E | Phòng VIP dưới mức tối thiểu có phụ thu | smoke mục 14; PNG bill mô phỏng | Đạt |
| E | VNPay, MoMo, ZaloPay, OnePay (Apple Pay) | smoke-payments với nhà cung cấp mock | Đạt (mock); cần hợp đồng merchant để thử sandbox thật |
| E3 | Mở ca, kết ca, chênh lệch | smoke mục 15 | Đạt |
| F | Hóa đơn điện tử phát hành, hủy, thay thế, tra cứu | smoke-payments (mock) | Đạt (mock); MISA/Viettel/VNPT cần tài khoản và tài liệu nhà cung cấp |
| G4 | App khách tải dưới 2 giây trên 4G, 4 chạm gửi món | Lighthouse trên bản build | Chưa đo |
| H | Đặt bàn, nhắc lịch ZNS, no-show, danh sách chờ | smoke-reservations | Đạt (ZNS mock) |
| I | Tích điểm, hạng, voucher, sinh nhật, biên nhận | loyalty.test; smoke-reservations | Đạt |
| J4 | Tiệc 80 mâm × 3,5tr + 25tr = 305tr; cọc 91,5tr và 122tr; BEO | events.test; smoke-events-inventory | Đạt (BEO dạng JSON; xuất PDF chưa làm) |
| K3 | 10 nem trừ 350 g thịt, hoàn kho khi hủy không hao phí | smoke-events-inventory | Đạt |
| K3 | Kiểm kê: chênh -100 g, duyệt điều chỉnh tồn | smoke-events-inventory | Đạt |
| M | In phiếu bếp, bill tiếng Việt có dấu, VietQR | cầu in chế độ mô phỏng, xem PNG | Đạt (mô phỏng); chưa thử máy in thật |

## Cách chạy

```bash
pnpm --filter @dalan/domain --filter @dalan/contracts test
node apps/api/scripts/smoke.mjs                    # cần API đang chạy và DB đã seed
node apps/api/scripts/smoke-reservations.mjs http://localhost:4000
node apps/api/scripts/smoke-payments.mjs http://localhost:4000
node apps/api/scripts/smoke-events-inventory.mjs http://localhost:4000
node apps/api/scripts/smoke-dining-extra.mjs http://localhost:4000
node apps/api/scripts/smoke-regressions.mjs http://localhost:4000
```
