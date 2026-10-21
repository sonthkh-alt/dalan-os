# Dùng thử miễn phí DaLan OS trên Internet (Render)

Cách này chạy **toàn bộ hệ thống** (API, app nhân viên, app khách, PostgreSQL, Redis) trên gói miễn
phí của [Render](https://render.com), không cần thẻ thanh toán. Mất khoảng 15-20 phút, phần lớn là
chờ Render build.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/sonthkh-alt/dalan-os)

## Các bước

1. Bấm nút **Deploy to Render** ở trên (hoặc mở
   `https://render.com/deploy?repo=https://github.com/sonthkh-alt/dalan-os`).
2. Đăng ký hoặc đăng nhập Render bằng tài khoản GitHub.
3. Render đọc tệp `render.yaml` và liệt kê 5 tài nguyên: `dalanos-db`, `dalanos-redis`,
   `dalanos-sonthkh-api`, `dalanos-sonthkh-staff`, `dalanos-sonthkh-guest`.
4. Render hỏi hai giá trị, bạn tự đặt và ghi nhớ:
   - `SEED_STAFF_PASSWORD`: mật khẩu cho mọi tài khoản quản lý mẫu, tối thiểu 10 ký tự, không dùng
     `Dalan@2026`.
   - `SEED_STAFF_PIN`: mã PIN 4-6 số cho mọi nhân viên mẫu, không dùng 1234, 1111, 2222, 9999, 0000.
5. Bấm **Apply** (hoặc **Deploy Blueprint**) và chờ cả 3 dịch vụ web chuyển sang trạng thái *Live*.
   Lần đầu API tự tạo bảng và nạp dữ liệu Dạ Lan (3 cơ sở, 273 món, nhân sự mẫu).

## Địa chỉ sau khi triển khai

| Ứng dụng | Địa chỉ |
|---|---|
| App nhân viên (POS, bếp, thu ngân, quản trị) | https://dalanos-sonthkh-staff.onrender.com |
| App khách (thực đơn, gọi món QR, đặt bàn) | https://dalanos-sonthkh-guest.onrender.com |
| API và tài liệu Swagger | https://dalanos-sonthkh-api.onrender.com/docs |

Kiểm tra API: mở `https://dalanos-sonthkh-api.onrender.com/health`, phải thấy `"status":"ok"`.

## Tài khoản dùng thử

Đăng nhập app nhân viên bằng mã nhân viên và mật khẩu bạn đặt ở bước 4:

| Mã | Vai trò |
|---|---|
| `ADMIN` | Quản trị toàn hệ thống (vào được mục Quản trị) |
| `GD01` | Ban giám đốc (báo cáo toàn công ty) |
| `QL-C`, `QL-S`, `QL-E` | Quản lý cơ sở Center, Star, Event |
| `KDT01` | Kinh doanh tiệc |

Nhân viên phục vụ, thu ngân, bếp đăng nhập bằng PIN trên thiết bị đã đăng ký: vào Quản trị → Nhân
sự → Thiết bị, đăng ký thiết bị, dán token thiết bị ở màn hình đăng nhập, rồi chọn nhân viên và nhập
PIN đã đặt ở bước 4.

## Thử luồng khách gọi món bằng QR

1. Đăng nhập app nhân viên bằng `ADMIN`, vào **Quản trị → Sơ đồ bàn → In mã QR**.
2. Quét một mã QR bằng điện thoại (hoặc mở đường dẫn in dưới mã). Mã trỏ tới app khách.
3. Gọi món trên điện thoại; trên app nhân viên, bàn đó hiện yêu cầu xác nhận đơn.
4. Mở màn hình **Bếp** để báo món xong, rồi vào bàn để tính tiền và thử VietQR.

Thanh toán ví/cổng, hóa đơn điện tử và tin nhắn Zalo chạy ở **chế độ mô phỏng**: không có giao dịch
thật. Mã OTP đăng nhập khách thành viên luôn là `123456`.

## Giới hạn của gói miễn phí

| Giới hạn | Ảnh hưởng |
|---|---|
| Dịch vụ web ngủ sau 15 phút không có truy cập | Lần mở đầu tiên sau khi ngủ chờ khoảng 1 phút mỗi dịch vụ. Mở API trước (`/health`), rồi đến app |
| 750 giờ chạy miễn phí mỗi tháng cho cả tài khoản | Đủ cho dùng thử; 3 dịch vụ chạy liên tục cả tháng sẽ vượt |
| PostgreSQL miễn phí hết hạn sau 30 ngày | Sau 30 ngày dữ liệu bị xóa (có 14 ngày ân hạn). Muốn giữ lâu, chuyển sang [Neon](https://neon.tech) miễn phí: tạo cơ sở dữ liệu, rồi thay `DATABASE_URL` của `dalanos-sonthkh-api` bằng chuỗi kết nối Neon |
| Redis miễn phí không lưu bền | Chỉ mất bộ nhớ đệm, không mất dữ liệu nghiệp vụ |
| Ổ đĩa tạm | Ảnh món tải lên mất khi dịch vụ khởi động lại |
| Chỉ 1 PostgreSQL và 1 Redis miễn phí mỗi tài khoản | Tài khoản đã có sẵn cái miễn phí thì Blueprint sẽ báo lỗi; xóa cái cũ hoặc dùng tài khoản khác |

Bản này dùng để **trình diễn và dùng thử**, không dùng cho vận hành thật. Vận hành thật cần máy chủ
riêng (xem `docs/van-hanh/trien-khai.md`).

## Xử lý sự cố

- **Tên dịch vụ đã có người dùng:** Render thêm hậu tố, ví dụ `dalanos-sonthkh-api-x1y2.onrender.com`.
  Khi đó vào Dashboard sửa các biến theo địa chỉ thực tế:
  - `dalanos-sonthkh-api`: `STAFF_APP_URL`, `GUEST_APP_URL`;
  - `dalanos-sonthkh-staff`: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_GUEST_URL`;
  - `dalanos-sonthkh-guest`: `NEXT_PUBLIC_API_URL`;
  rồi bấm **Manual Deploy → Deploy latest commit** cho app nhân viên và app khách (biến
  `NEXT_PUBLIC_*` được nhúng lúc build).
- **API báo lỗi "đặt SEED_STAFF_PASSWORD":** mật khẩu quá ngắn hoặc trùng mật khẩu mẫu. Sửa biến trong
  Dashboard của `dalanos-sonthkh-api` rồi deploy lại.
- **Trang đăng nhập báo lỗi mạng:** API đang ngủ hoặc chưa build xong; mở `/health` của API, chờ
  "ok" rồi thử lại.
