# Đặc tả nghiệp vụ: Vận hành nhà hàng

Bao gồm thực đơn (B), vận hành bàn (C), bếp và bar (D), thanh toán (E), hóa đơn điện tử (F),
in ấn (M). Mỗi yêu cầu có mã để truy vết sang mã nguồn và kiểm thử.

## B. Thực đơn

### B1. Mô hình món
- **B1.1** Mỗi *món* (MenuItem) có: mã, tên tiếng Việt, tên tiếng Anh, mô tả song ngữ, ảnh, danh mục, đơn vị tính (đĩa, bát, tô, con, kg, nồi, phần...), trạm bếp mặc định, cờ ăn chay, cờ đặc sản, cờ đếm vỏ (bia, nước, khăn lạnh), thời gian chế biến ước tính, thứ tự hiển thị, trạng thái (đang bán, tạm ẩn, ngừng).
- **B1.2** *Chế độ giá* (pricingMode): `fixed` (giá cố định), `variant` (chọn cỡ: nhỏ/lớn với giá riêng), `weight` (theo cân, giá trên kg, chốt trọng lượng khi bán), `market` (giá theo thời điểm, nhân viên nhập giá khi gọi, cần quyền), `open` (món tự do, nhập tên và giá, cần quyền).
- **B1.3** *Nhóm tùy chọn* (ModifierGroup): bắt buộc hoặc không, chọn một hoặc nhiều, min/max; mỗi *tùy chọn* có giá cộng thêm (có thể bằng 0). Dùng cho cách chế biến (hấp, rang me), độ cay, ít đá, size đồ uống, đồ ăn kèm.
- **B1.4** *Combo và định suất* (SetMenu): gồm nhiều thành phần, mỗi thành phần là một món cố định hoặc một nhóm cho khách chọn; giá trọn gói theo suất hoặc theo mâm; áp dụng cho thực đơn định suất, cơm văn phòng, tiệc.
- **B1.5** *Thực đơn* (Menu) là tập hợp danh mục và món, có lịch bán (ngày trong tuần, khung giờ), áp dụng cho một hoặc nhiều cơ sở. Ví dụ: ăn sáng 06:00-10:00, cơm văn phòng thứ 2-7 10:30-13:30, Chợ quê thứ 7 và Chủ nhật.
- **B1.6** *Điều chỉnh theo cơ sở* (BranchItemOverride): giá riêng, trạm bếp riêng, bật/tắt, hết món theo ngày.
- **B1.7** Lịch sử giá: mọi thay đổi giá lưu phiên bản với người sửa và thời điểm; dòng món trên đơn luôn chụp lại giá tại thời điểm gọi.
- **B1.8** Nhập liệu nhanh: nhập từ Excel/CSV theo mẫu; nhập hàng loạt ảnh; nhân bản món.

### B2. Hết món (86)
- **B2.1** Bếp hoặc quản lý đánh dấu hết món trong ngày (tự mở lại vào ngày kinh doanh mới) hoặc hết vô thời hạn.
- **B2.2** Món hết hiển thị mờ kèm nhãn "Hết món" ở app khách và POS; không cho thêm vào giỏ; giỏ đang chứa món vừa hết được cảnh báo khi gửi.
- **B2.3** Có thể giới hạn số suất còn lại (ví dụ còn 5 con vịt Cổ Lũng); mỗi dòng gọi trừ dần, về 0 thì tự hết.

### B3. Tiêu chí nghiệm thu
- Tạo món "Gà ri luộc rút xương" với 2 biến thể 350k/550k; gọi biến thể lớn thì dòng đơn ghi 550k.
- Tạo "Cua gạch" chế độ cân 1.195k/kg với nhóm chế biến bắt buộc; gọi 1,2 kg chọn "Rang me" thì giá dòng 1.434.000đ và phiếu bếp in "Cua gạch 1,2kg - Rang me".
- "Chợ quê" chỉ xuất hiện ở Event vào thứ 7, Chủ nhật 06:00-10:00.

## C. Vận hành bàn

### C1. Sơ đồ bàn
- **C1.1** Mỗi cơ sở có nhiều *khu vực* (tầng, sảnh, sân vườn, dãy phòng VIP); mỗi khu vực có *bàn* với tên, sức chứa tối thiểu và tối đa, hình dạng và tọa độ trên sơ đồ, cờ phòng riêng, mức chi tiêu tối thiểu, phí phục vụ riêng.
- **C1.2** Trình soạn sơ đồ kéo thả cho quản lý; bàn có thể là ảo (mang về, giao hàng, quầy).
- **C1.3** Trạng thái bàn hiển thị theo màu: trống, đã đặt trước (sắp đến), đang phục vụ, đã gọi món chờ bếp, đã lên hết món, yêu cầu thanh toán, đã thanh toán chờ dọn, đang dọn. Hiển thị thời gian ngồi, số khách, tổng tạm tính, cảnh báo yêu cầu khách chưa xử lý.
- **C1.4** Mỗi bàn có mã QR động: QR trỏ tới `/q/{tableToken}`; token đổi được bất cứ lúc nào mà không in lại nhờ lớp chuyển hướng; in kèm URL ngắn dự phòng.

### C2. Phiên bàn (TableSession)
- **C2.1** Phiên bàn mở khi: nhân viên xếp khách; khách check-in từ đặt bàn; khách quét QR ở bàn trống (phiên ở trạng thái *chờ xác nhận* cho tới khi nhân viên duyệt hoặc gửi đơn đầu tiên, theo cấu hình).
- **C2.2** Phiên có: cơ sở, danh sách bàn (một hoặc nhiều khi gộp), số khách, nhân viên phụ trách, khách hàng gắn (nếu có), nguồn (walk-in, đặt bàn, tiệc), ghi chú, trạng thái: `PENDING` → `OPEN` → `BILL_REQUESTED` → `CLOSED`; hoặc `CANCELLED` nếu không phát sinh đơn.
- **C2.3** *Gộp bàn*: hai phiên thành một, giữ lịch sử mọi đơn, bill tính chung; *tách bàn*: chuyển các dòng món chọn sang phiên mới ở bàn khác; *chuyển bàn*: đổi bàn giữ nguyên phiên. Mọi thao tác ghi nhật ký và thông báo bếp (phiếu bếp cập nhật tên bàn).
- **C2.4** Phiên có thể gắn nhiều *khách quét QR* (GuestParticipant) với biệt danh; mỗi dòng món ghi ai gọi để chia tiền theo người.
- **C2.5** Khăn lạnh, đồ ăn kèm tự động theo số khách (cấu hình theo cơ sở), nhân viên chỉnh lại được.

### C3. Gọi món
- **C3.1** Một phiên có nhiều *đơn* (Order) tương ứng mỗi lần gửi bếp. Mỗi đơn có nguồn (nhân viên, khách QR, đặt trước), người gửi, thời điểm.
- **C3.2** *Dòng món* (OrderLine): món, biến thể, tùy chọn, số lượng (hỗ trợ số thập phân cho kg), đơn giá chụp, ghi chú bếp (không hành, ít cay), course (đợt lên món 1, 2, 3), trạng thái: `DRAFT` → `SENT` → `PREPARING` → `READY` → `SERVED`; `VOIDED` (hủy sau khi gửi bếp, cần lý do và quyền) hoặc `CANCELLED` (hủy trước khi gửi).
- **C3.3** Món theo cân: gọi với trọng lượng dự kiến, bếp hoặc nhân viên nhập trọng lượng cân thực tế trước khi gửi bếp hoặc trước khi tính tiền; dòng ghi cả hai số.
- **C3.4** Giữ và bắn món theo course: nhân viên gửi cả đơn nhưng bếp chỉ làm course 1; nhân viên hoặc expo bấm "lên course 2". Cấu hình tự bắn sau N phút.
- **C3.5** Đơn từ khách QR: cấu hình theo cơ sở là *gửi thẳng bếp* hoặc *chờ nhân viên xác nhận*; nhân viên thấy thông báo và một chạm để xác nhận hoặc sửa.
- **C3.6** Hủy món sau khi gửi bếp: chọn lý do (khách đổi ý, bếp hết, làm sai, khách phàn nàn), có hoặc không trừ kho (món đã nấu), yêu cầu PIN quản lý khi vượt hạn mức; bếp nhận thông báo hủy nổi bật.
- **C3.7** Chuyển món giữa các bàn (gọi nhầm bàn) có nhật ký.
- **C3.8** Yêu cầu phục vụ từ khách (gọi nhân viên, xin thêm đá, xin tính tiền) hiện trên app nhân viên theo bàn, có thời gian chờ và nút "đã xử lý".

### C4. Tiêu chí nghiệm thu
- Khách quét QR bàn 12 (trống) → phiên PENDING; khách gửi 3 món → nhân viên xác nhận → phiên OPEN, bếp nhận phiếu trong dưới 2 giây.
- Hai bàn 5 và 6 đang mở, gộp → một phiên hai bàn, bill chung; bếp thấy phiếu đổi "Bàn 5+6".
- Hủy món đã gửi bếp quá 200.000đ yêu cầu PIN quản lý và ghi lý do.
- Mất mạng trên tablet 60 giây, nhân viên vẫn thêm 2 món và bấm gửi; khi có mạng, đơn tới bếp đúng một lần.

## D. Bếp và bar

- **D1.1** *Trạm* (Station) theo cơ sở: bếp nóng, bếp nguội, nướng, lẩu, cơm xôi, hải sản sống, bar, bếp ăn sáng... Mỗi món có trạm mặc định; cơ sở ghi đè được. Mỗi trạm chọn chế độ: màn hình KDS, in phiếu, hoặc cả hai.
- **D1.2** Khi đơn gửi, hệ thống tách thành *phiếu bếp* (KitchenTicket) theo trạm; phiếu gồm bàn, số khách, giờ gửi, nhân viên, các dòng với số lượng, tùy chọn, ghi chú, course, cờ VIP/ưu tiên.
- **D1.3** KDS: danh sách phiếu theo thời gian, màu theo tuổi phiếu (xanh dưới 10 phút, vàng 10-20, đỏ trên 20, cấu hình được), gom theo món (tổng số "Gà quay" đang chờ), bấm từng dòng hoặc cả phiếu để chuyển `PREPARING` → `READY`; nút gọi lại (recall) phiếu vừa bump; chế độ expo xem tất cả trạm và báo `SERVED` khi món ra bàn.
- **D1.4** Nhân viên phục vụ nhận thông báo "món sẵn sàng" theo bàn của mình.
- **D1.5** Đo thời gian: gửi → bắt đầu → xong → ra bàn, theo món và trạm; báo cáo món chậm.
- **D1.6** Hết món từ KDS (B2).
- **D1.7** Màn hình bếp dùng được trên tablet Android rẻ, màn hình cảm ứng lớn hoặc TV với bàn phím số; chữ to, tương phản cao, hoạt động khi wifi chập chờn (tự kết nối lại và tải bù).

## E. Thanh toán

### E1. Bill (Check)
- **E1.1** Một phiên có một hoặc nhiều *bill*. Mặc định một bill gồm toàn bộ dòng chưa thanh toán. *Chia bill*: theo món (kéo dòng sang bill khác), theo người (dòng gắn khách QR nào), chia đều N phần, hoặc theo số tiền tùy ý.
- **E1.2** Bill tính: tổng hàng → giảm giá dòng → giảm giá bill (phần trăm hoặc số tiền, có lý do và quyền) → khuyến mãi tự động và voucher → phí phục vụ → VAT (gồm hoặc chưa gồm theo cấu hình) → làm tròn (cấu hình, mặc định không) → tổng phải trả. Mọi con số in trên bill tạm tính.
- **E1.3** *Đếm vỏ*: với dòng món có cờ đếm vỏ, khi tạm tính nhân viên nhập số vỏ thực đếm; hệ thống đối chiếu với số đã gọi, chênh lệch tạo dòng điều chỉnh có nhật ký (thêm hoặc bớt), bếp/bar được thông báo.
- **E1.4** Mức chi tiêu tối thiểu phòng VIP: nếu tổng hàng thấp hơn, tự thêm dòng "Phụ thu phòng" bằng phần chênh.
- **E1.5** Bill tạm tính in được nhiều lần (ghi số lần in); bill chính thức chốt khi thanh toán đủ.

### E2. Phương thức thanh toán
| Phương thức | Kênh | Xác nhận |
|---|---|---|
| Tiền mặt | Quầy / tại bàn | Nhân viên nhập tiền nhận, hệ thống tính tiền thừa |
| Chuyển khoản VietQR động | QR hiển thị trên POS, bill in, màn hình khách và điện thoại khách | Tự động qua webhook ngân hàng/cổng đối soát nếu có; nếu không, thu ngân xác nhận tay sau khi thấy tiền về, có ghi mã giao dịch |
| Thẻ, Apple Pay, Google Pay tại quầy | Máy POS ngân hàng (contactless) | Nhập 4 số cuối và mã chuẩn chi; tích hợp máy POS qua bộ chuyển đổi khi ngân hàng cung cấp API |
| VNPay, MoMo, ZaloPay | Khách thanh toán trên điện thoại từ app khách hoặc link | Webhook IPN từ cổng, có truy vấn lại trạng thái |
| Apple Pay online | Qua cổng hỗ trợ Apple Pay (OnePay, VNPay theo lộ trình NAPAS) trong app khách | Webhook IPN từ cổng |
| Đặt cọc | Trừ từ cọc đặt bàn hoặc cọc tiệc | Tự động |
| Voucher, điểm | Mã voucher, điểm thành viên | Tự động |
| Công nợ | Khách doanh nghiệp được duyệt | Quyền quản lý |

- **E2.1** Một bill nhận nhiều thanh toán (một phần tiền mặt, một phần chuyển khoản). Bill đóng khi tổng thanh toán thành công bằng tổng phải trả.
- **E2.2** *VietQR động*: sinh chuỗi EMVCo theo chuẩn NAPAS 247 với BIN ngân hàng, số tài khoản, số tiền, nội dung `DL{mãBill}`; tạo mới mỗi lần số tiền đổi; hiển thị kèm số tài khoản và nội dung để khách nhập tay nếu không quét được.
- **E2.3** Đối soát: mọi thanh toán điện tử có mã tham chiếu bên ngoài; màn hình đối soát cuối ngày so khớp với sao kê hoặc báo cáo cổng; chênh lệch được đánh dấu.
- **E2.4** Hoàn tiền: tiền mặt (ghi phiếu chi), cổng (gọi API hoàn), chuyển khoản (ghi nhận hoàn tay). Cần quyền và lý do.
- **E2.5** Mỗi thanh toán thành công tạo sự kiện để in bill, phát hành hóa đơn điện tử, cộng điểm, trừ kho (nếu trừ khi thanh toán) và gửi ZNS cảm ơn (nếu khách cho phép).

### E3. Ca và két tiền
- **E3.1** Thu ngân mở ca với tiền đầu ca; mọi thu chi tiền mặt gắn ca; kết ca nhập tiền đếm thực tế, hệ thống tính chênh lệch; báo cáo Z theo ca gồm doanh thu theo phương thức, số bill, giảm giá, hủy món, hoàn tiền.
- **E3.2** Phiếu thu, phiếu chi tiền mặt ngoài bán hàng (mua đá, trả shipper) có lý do và chứng từ ảnh.

### E4. Tiêu chí nghiệm thu
- Bill 1.000.000đ, giảm 10% có lý do, phí phục vụ 5%, VAT 8% gồm trong giá → tổng phải trả 945.000đ; VietQR sinh ra với số tiền 945000 và nội dung đúng; quét bằng app ngân hàng ra đúng số tiền.
- Chia bill theo người: 3 khách QR, mỗi người thấy phần của mình và tự thanh toán qua ví; bill đóng khi cả 3 thành công.
- Đếm vỏ: gọi 10 bia, đếm 12 vỏ → thêm dòng 2 bia có nhật ký; bar nhận thông báo.

## F. Hóa đơn điện tử (từ máy tính tiền)

- **F1.1** Mỗi cơ sở cấu hình nhà cung cấp (MISA meInvoice, Viettel SInvoice, VNPT Invoice), ký hiệu và mẫu hóa đơn máy tính tiền, chế độ phát hành: tự động khi bill đóng, hoặc theo yêu cầu khách.
- **F1.2** Khách nhập thông tin xuất hóa đơn (tên đơn vị, mã số thuế, địa chỉ, email) ngay trên app khách trước khi thanh toán hoặc thu ngân nhập; hệ thống tra cứu mã số thuế để điền tự động (khi có API).
- **F1.3** Hóa đơn gồm các dòng theo bill đã chốt, thuế suất từng dòng, giảm giá, phí phục vụ; gửi nhà cung cấp để cấp mã cơ quan thuế; lưu số hóa đơn, mã CQT, link tra cứu, file PDF/XML.
- **F1.4** In mã tra cứu và QR tra cứu hóa đơn lên bill giấy; gửi link qua ZNS/email.
- **F1.5** Nghiệp vụ sai sót: hủy, thay thế, điều chỉnh theo quy định, có lý do; khóa bill sau khi đã phát hành (sửa phải qua điều chỉnh).
- **F1.6** Hàng đợi và thử lại khi nhà cung cấp lỗi; báo cáo hóa đơn chưa phát hành; đối chiếu số lượng bill và số hóa đơn theo ngày.

## M. In ấn

- **M1.1** *Cầu in* (print-bridge) là dịch vụ nhỏ chạy trên một máy tính tại cơ sở, kết nối máy in ESC/POS qua mạng LAN hoặc USB, nhận lệnh in từ máy chủ qua kết nối WebSocket và xếp hàng khi mất mạng; đồng thời nhận lệnh trực tiếp từ các thiết bị trong LAN khi internet đứt (chế độ khẩn cấp).
- **M1.2** Mẫu in tiếng Việt có dấu (font bitmap hoặc chế độ ảnh), khổ 58 và 80 mm: phiếu bếp theo trạm (chữ to, tách dòng rõ, ghi chú in đậm, phiếu hủy in đảo màu), bill tạm tính, bill thanh toán có VietQR, phiếu đặt cọc, phiếu kết ca, nhãn món (tùy chọn).
- **M1.3** Quản lý máy in: tên, địa chỉ IP, khổ giấy, trạm gắn, in thử, trạng thái online.
