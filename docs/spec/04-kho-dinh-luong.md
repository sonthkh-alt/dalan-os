# Đặc tả nghiệp vụ: Kho và định lượng (K)

Dạ Lan đã tập trung mua sắm và sản xuất (nhà máy Hoàng Long, bếp trung tâm). Mô-đun kho phục
vụ ba mục tiêu: biết giá vốn từng món, phát hiện thất thoát theo ngày, và lập kế hoạch
nguyên liệu cho tiệc lớn.

## K1. Dữ liệu

- **Kho** (Warehouse): mỗi cơ sở có kho chính và các kho con (bếp, bar, kho lạnh); kho trung tâm và nhà máy.
- **Nguyên liệu** (StockItem): mã, tên, nhóm (thịt, hải sản, rau, gia vị, đồ uống, bao bì, vật tư), đơn vị cơ sở (g, ml, cái), đơn vị mua (kg, thùng 24 lon, két 20 chai) với hệ số quy đổi, tồn tối thiểu, hạn sử dụng theo lô (tùy chọn), nhà cung cấp mặc định, giá vốn bình quân.
- **Định lượng** (Recipe): theo món, biến thể và tùy chọn; danh sách nguyên liệu với lượng dùng và tỷ lệ hao hụt sơ chế; bán thành phẩm (nước dùng, nem gói sẵn) có định lượng riêng và được sản xuất nhập kho.
- **Chứng từ**: đơn đặt hàng NCC (PurchaseOrder), phiếu nhập (GoodsReceipt), phiếu xuất (Issue), chuyển kho (Transfer) giữa cơ sở hoặc từ kho trung tâm, kiểm kê (Stocktake), hao hụt và hủy (Waste), sản xuất bán thành phẩm (Production).
- **Phát sinh tồn** (StockMovement): mọi biến động ghi theo dòng, loại, tham chiếu chứng từ hoặc bill, số lượng theo đơn vị cơ sở, giá vốn.

## K2. Chức năng

- **K2.1** Trừ kho tự động theo định lượng khi dòng món chuyển `SENT` (cấu hình: hoặc khi thanh toán); hủy món "đã nấu" không hoàn kho, hủy "chưa nấu" hoàn kho. Đồ uống đếm vỏ trừ theo số thực đếm.
- **K2.2** Nhập hàng: tạo đơn đặt hàng từ gợi ý theo tồn tối thiểu và dự báo (bình quân 7 ngày + tiệc sắp tới), gửi NCC qua Zalo/email, nhận hàng theo đơn với chênh lệch, chụp hóa đơn NCC, cập nhật giá vốn bình quân.
- **K2.3** Chuyển kho giữa cơ sở có xác nhận hai đầu; kho trung tâm phân phối theo yêu cầu hằng ngày của bếp.
- **K2.4** Kiểm kê: theo nhóm hoặc toàn kho, nhập bằng điện thoại, so với tồn lý thuyết, chênh lệch theo số lượng và giá trị, duyệt điều chỉnh; kiểm kê nhanh cuối ngày cho bar (bia, nước).
- **K2.5** Cảnh báo tồn dưới mức, hàng sắp hết hạn, biến động bất thường (hao hụt trên X%).
- **K2.6** Kế hoạch nguyên liệu cho tiệc: từ BEO (số mâm × định lượng) ra nhu cầu, trừ tồn hiện có, ra đề xuất đặt hàng theo ngày giao.
- **K2.7** Báo cáo: giá vốn và biên lợi nhuận theo món và danh mục, tỷ lệ COGS theo ngày và cơ sở, chênh lệch kiểm kê, top nguyên liệu tiêu hao, lịch sử giá mua theo NCC.

## K3. Tiêu chí nghiệm thu

- Định lượng "Nem Dạ Lan" 1 cái = 35 g thịt, 10 g miến, 1 bánh đa nem; gọi 10 cái → tồn thịt giảm 350 g, miến 100 g, bánh đa 10 cái; giá vốn dòng hiển thị trên báo cáo biên lợi nhuận.
- Kiểm kê bar cuối ngày: lý thuyết 120 lon Tiger, đếm 117 → chênh -3 lon, giá trị theo giá vốn, chờ quản lý duyệt.
