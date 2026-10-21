# Dùng thử miễn phí DaLan OS trên Internet (Neon + Render)

Cách này chạy **toàn bộ hệ thống** miễn phí, không cần thẻ thanh toán:

| Thành phần | Dịch vụ | Gói |
|---|---|---|
| Cơ sở dữ liệu PostgreSQL | [Neon](https://neon.tech) | Miễn phí, không hết hạn, 0,5 GB |
| API, app nhân viên, app khách, Redis | [Render](https://render.com) | Miễn phí |

Mất khoảng 20 phút, phần lớn là chờ Render build.

## Bước 1: Tạo cơ sở dữ liệu trên Neon

1. Vào https://console.neon.tech, đăng ký bằng tài khoản GitHub hoặc Google.
2. Tạo project mới:
   - **Project name:** `dalan-os`
   - **Postgres version:** 17 hoặc 18
   - **Region:** **AWS Asia Pacific (Singapore)** (gần Việt Nam và cùng vùng với Render)
3. Ở trang project, bấm **Connect**. Tắt **Connection pooling** để lấy kết nối trực tiếp (bật cũng
   được, hệ thống tự xử lý), rồi sao chép chuỗi kết nối. Chuỗi có dạng:

   ```
   postgresql://neondb_owner:matkhau@ep-ten-ngau-nhien.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```

   Giữ chuỗi này cho bước 2. Đây là thông tin bí mật: không gửi cho người khác.

## Bước 2: Triển khai trên Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/sonthkh-alt/dalan-os)

1. Bấm nút **Deploy to Render** ở trên (hoặc mở
   `https://render.com/deploy?repo=https://github.com/sonthkh-alt/dalan-os`).
2. Đăng ký hoặc đăng nhập Render bằng tài khoản GitHub.
3. Render đọc tệp `render.yaml` và liệt kê 4 tài nguyên: `dalanos-redis`, `dalanos-sonthkh-api`,
   `dalanos-sonthkh-staff`, `dalanos-sonthkh-guest`.
4. Render hỏi ba giá trị:
   - `DATABASE_URL`: dán chuỗi kết nối Neon ở bước 1.
   - `SEED_STAFF_PASSWORD`: mật khẩu cho mọi tài khoản quản lý mẫu, tối thiểu 10 ký tự, không dùng
     `Dalan@2026`.
   - `SEED_STAFF_PIN`: mã PIN 4-6 số cho mọi nhân viên mẫu, không dùng 1234, 1111, 2222, 9999, 0000.
5. Bấm **Apply** (hoặc **Deploy Blueprint**) và chờ cả 3 dịch vụ web chuyển sang trạng thái *Live*.
   Lần đầu API tự tạo bảng trên Neon và nạp dữ liệu Dạ Lan (3 cơ sở, 273 món, nhân sự mẫu).

## Địa chỉ sau khi triển khai

| Ứng dụng | Địa chỉ |
|---|---|
| App nhân viên (POS, bếp, thu ngân, quản trị) | https://dalanos-sonthkh-staff.onrender.com |
| App khách (thực đơn, gọi món QR, đặt bàn) | https://dalanos-sonthkh-guest.onrender.com |
| API và tài liệu Swagger | https://dalanos-sonthkh-api.onrender.com/docs |

Kiểm tra API: mở `https://dalanos-sonthkh-api.onrender.com/health`, phải thấy `"status":"ok"`.
Trên Neon, mục **Tables** sẽ hiện các bảng như `Branch`, `MenuItem`, `TableSession`.

## Tài khoản dùng thử

Đăng nhập app nhân viên bằng mã nhân viên và mật khẩu bạn đặt ở bước 2:

| Mã | Vai trò |
|---|---|
| `ADMIN` | Quản trị toàn hệ thống (vào được mục Quản trị) |
| `GD01` | Ban giám đốc (báo cáo toàn công ty) |
| `QL-C`, `QL-S`, `QL-E` | Quản lý cơ sở Center, Star, Event |
| `KDT01` | Kinh doanh tiệc |

Nhân viên phục vụ, thu ngân, bếp đăng nhập bằng PIN trên thiết bị đã đăng ký: vào Quản trị → Nhân
sự → Thiết bị, đăng ký thiết bị, dán token thiết bị ở màn hình đăng nhập, rồi chọn nhân viên và nhập
PIN đã đặt ở bước 2.

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
| Dịch vụ web Render ngủ sau 15 phút không có truy cập | Lần mở đầu tiên sau khi ngủ chờ khoảng 1 phút mỗi dịch vụ. Mở API trước (`/health`), rồi đến app |
| 750 giờ chạy miễn phí mỗi tháng cho cả tài khoản Render | Đủ cho dùng thử; 3 dịch vụ chạy liên tục cả tháng sẽ vượt |
| Neon: 0,5 GB lưu trữ, 100 giờ tính toán (CU-hour) mỗi tháng | Dư cho dùng thử. Neon tự ngủ sau 5 phút không truy vấn và thức dậy trong chưa tới 1 giây. Dữ liệu được giữ, không hết hạn |
| Redis miễn phí không lưu bền | Chỉ mất bộ nhớ đệm, không mất dữ liệu nghiệp vụ |
| Ổ đĩa tạm trên Render | Ảnh món tải lên mất khi dịch vụ khởi động lại |
| Chỉ 1 Redis miễn phí mỗi tài khoản Render | Tài khoản đã có sẵn Redis miễn phí thì Blueprint sẽ báo lỗi; xóa cái cũ hoặc dùng tài khoản khác |

Bản này dùng để **trình diễn và dùng thử**, không dùng cho vận hành thật. Vận hành thật cần máy chủ
riêng (xem `docs/van-hanh/trien-khai.md`).

## Xử lý sự cố

- **API không lên, log báo lỗi kết nối cơ sở dữ liệu:** kiểm tra `DATABASE_URL` trong Dashboard của
  `dalanos-sonthkh-api` đúng chuỗi Neon (bắt đầu bằng `postgresql://`, có `sslmode=require`) và
  project Neon chưa bị xóa hoặc vượt hạn mức. Sửa xong bấm **Manual Deploy**.
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
- **Muốn làm lại từ đầu:** trên Neon, vào **Branches → main → Reset** (hoặc xóa và tạo lại database),
  rồi **Manual Deploy** API trên Render; API sẽ tạo bảng và nạp dữ liệu mẫu lại.
