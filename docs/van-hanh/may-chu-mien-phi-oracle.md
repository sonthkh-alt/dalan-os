# Chạy DaLan OS miễn phí, liên tục 24/7 trên Oracle Cloud

Khác với Render, cách này cho bạn **một máy chủ ảo riêng chạy liên tục, không ngủ**. Toàn bộ hệ thống
(API, app nhân viên, app khách, PostgreSQL, Redis, sao lưu, HTTPS) chạy trên máy đó, cài bằng **một
lệnh**.

| | Oracle Cloud Always Free | Render miễn phí |
|---|---|---|
| Ngủ khi không dùng | Không | Có (sau 15 phút, thức dậy ~1 phút) |
| Cấu hình | ARM Ampere, tới 2 nhân và 12 GB RAM miễn phí | 512 MB mỗi dịch vụ |
| Cơ sở dữ liệu | Chạy ngay trên máy, không giới hạn thời gian | Phải dùng Neon |
| Cần thẻ thanh toán | Có, để xác minh danh tính (không bị trừ tiền nếu ở trong gói miễn phí) | Không |
| Công sức | Khoảng 30-45 phút lần đầu | Khoảng 20 phút |

## Bước 1: Đăng ký Oracle Cloud

1. Vào https://signup.cloud.oracle.com, đăng ký tài khoản **Free Tier**.
2. **Home Region** chọn **Singapore** (gần Việt Nam). Vùng này không đổi được sau khi tạo tài khoản.
3. Nhập thẻ Visa/Mastercard để xác minh. Oracle có thể tạm giữ một khoản nhỏ rồi hoàn lại.
4. Chờ email báo tài khoản sẵn sàng (vài phút đến vài giờ).

## Bước 2: Tạo máy chủ ảo

1. Vào **Menu → Compute → Instances → Create instance**.
2. **Name:** `dalan-os`.
3. **Image:** bấm *Change image* → **Canonical Ubuntu 24.04**.
4. **Shape:** bấm *Change shape* → **Ampere** → **VM.Standard.A1.Flex**, chọn **1 OCPU** và **6 GB** RAM.
   - Đủ cho toàn bộ hệ thống, và giúp tránh bị Oracle thu hồi máy "nhàn rỗi" (xem phần lưu ý).
   - Nếu báo *Out of capacity*: thử *Availability domain* khác, hoặc thử lại sau vài giờ.
5. **Networking:** giữ mặc định (tạo VCN mới), đảm bảo **Assign a public IPv4 address** được bật.
6. **Add SSH keys:** chọn **Generate a key pair for me** → bấm **Save private key** (tệp `.key`). Giữ tệp
   này cẩn thận: đây là chìa khóa vào máy chủ.
7. **Boot volume:** giữ mặc định (khoảng 50 GB, trong hạn mức miễn phí).
8. Bấm **Create**, chờ trạng thái **Running**, ghi lại **Public IP address**.

## Bước 3: Mở cổng web (80 và 443)

1. Ở trang instance, bấm vào **Virtual cloud network** (VCN) → **Security** (hoặc *Security Lists*) →
   **Default Security List**.
2. **Add Ingress Rules**, thêm hai luật:

   | Source CIDR | IP Protocol | Destination Port |
   |---|---|---|
   | `0.0.0.0/0` | TCP | `80` |
   | `0.0.0.0/0` | TCP | `443` |

Tường lửa bên trong Ubuntu của Oracle cũng chặn sẵn hai cổng này; script cài đặt ở bước 4 tự mở.

## Bước 4: Cài DaLan OS bằng một lệnh

Trên Windows, mở **PowerShell** ở thư mục chứa tệp khóa vừa tải (thay đường dẫn và IP):

```powershell
ssh -i .\ssh-key-dalan.key ubuntu@<PUBLIC_IP>
```

Nếu báo lỗi quyền tệp khóa, chạy một lần:
`icacls .\ssh-key-dalan.key /inheritance:r /grant:r "$($env:USERNAME):R"`.

Khi đã vào máy chủ, chạy:

```bash
curl -fsSL https://raw.githubusercontent.com/sonthkh-alt/dalan-os/main/infra/vps/install.sh | sudo bash
```

Script hỏi **mật khẩu** cho các tài khoản quản lý mẫu (từ 10 ký tự) và **mã PIN** 4-6 số cho nhân viên,
rồi tự cài Docker, tải mã nguồn, tạo khóa bí mật ngẫu nhiên, build và khởi động. Lần đầu mất 15-30
phút trên máy 1 nhân. Khi xong, script in ra địa chỉ, dạng:

```
App nhân viên : https://app.<IP-gạch-ngang>.sslip.io
App khách     : https://menu.<IP-gạch-ngang>.sslip.io
API, Swagger  : https://api.<IP-gạch-ngang>.sslip.io/docs
```

Tên miền `sslip.io` là dịch vụ miễn phí tự trỏ về IP của bạn, nên chưa cần mua tên miền mà vẫn có
HTTPS. Đăng nhập app nhân viên bằng mã `ADMIN` và mật khẩu bạn vừa đặt.

## Dùng tên miền riêng (khi có)

Trỏ 3 bản ghi DNS loại A `api`, `app`, `menu` của tên miền (ví dụ `dalan.com.vn`) về IP máy chủ, rồi
trên máy chủ:

```bash
sudo sed -i 's/^DOMAIN_API=.*/DOMAIN_API=api.dalan.com.vn/; s/^DOMAIN_STAFF=.*/DOMAIN_STAFF=app.dalan.com.vn/; s/^DOMAIN_GUEST=.*/DOMAIN_GUEST=menu.dalan.com.vn/' /opt/dalan-os/infra/.env.prod
curl -fsSL https://raw.githubusercontent.com/sonthkh-alt/dalan-os/main/infra/vps/install.sh | sudo bash
```

Sau khi đổi tên miền, in lại tờ mã QR bàn (Quản trị → Sơ đồ bàn → In mã QR).

## Vận hành hằng ngày

| Việc | Lệnh (trên máy chủ) |
|---|---|
| Cập nhật phiên bản mới từ GitHub | chạy lại lệnh cài đặt ở bước 4 (giữ nguyên dữ liệu) |
| Xem log API | `cd /opt/dalan-os && sudo docker compose -f infra/docker-compose.prod.yml logs -f api` |
| Khởi động lại | `cd /opt/dalan-os && sudo docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod restart` |
| Bản sao lưu cơ sở dữ liệu | tự động mỗi ngày, giữ 14 ngày, trong volume `dalan_backups` |
| Trạng thái | mở `https://api.<...>/health`, phải thấy `"status":"ok"` |

Máy chủ khởi động lại thì các dịch vụ tự chạy lại (Docker `restart: unless-stopped`).

## Lưu ý quan trọng

- **Oracle thu hồi máy "nhàn rỗi":** với tài khoản Free Tier, Oracle có thể thu hồi máy Always Free nếu
  trong 7 ngày liền CPU, mạng **và** RAM đều dùng dưới khoảng 20%. Chọn 1 OCPU và 6 GB (bước 2) giúp RAM
  dùng thường xuyên trên 20%, nên máy không bị coi là nhàn rỗi. Cách chắc chắn nhất là nâng tài khoản
  lên **Pay As You Go** (Billing → Upgrade): vẫn miễn phí trong hạn mức Always Free, nhưng không bị thu
  hồi. Khi đó nên đặt **Budget** cảnh báo ở mức 1 USD để không bị tính tiền ngoài ý muốn.
- **Hạn mức miễn phí có thể thay đổi:** từ tháng 6/2026 Oracle được cho là đã giảm Ampere miễn phí còn
  2 OCPU và 12 GB. Cấu hình 1 OCPU và 6 GB nằm trong hạn mức này.
- **Đây vẫn là bản dùng thử:** thanh toán, hóa đơn điện tử và tin nhắn Zalo đang ở chế độ mô phỏng.
  Khi vận hành thật, cấu hình tích hợp theo `docs/van-hanh/can-chuan-bi-truoc-khi-van-hanh.md`.
- **Không dùng được Oracle:** script cài đặt chạy trên mọi VPS Ubuntu 22.04/24.04 có từ 2 GB RAM, kể cả
  VPS giá rẻ tại Việt Nam (khoảng 100.000-150.000đ/tháng), với cùng một lệnh.
