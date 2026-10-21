# Hướng dẫn triển khai và vận hành

## 1. Kiến trúc triển khai giai đoạn 1

Một máy chủ ảo tại Việt Nam (khuyến nghị 4 vCPU, 8 GB RAM, 100 GB SSD; Viettel IDC, VNG Cloud,
FPT Cloud hoặc AWS ap-southeast-1) chạy Docker Compose:

| Dịch vụ | Vai trò | Tên miền |
|---|---|---|
| caddy | Reverse proxy, HTTPS tự động | api / app / menu.dalan.com.vn |
| api | NestJS + Socket.IO + relay outbox | api.dalan.com.vn |
| staff | App nhân viên (Next.js) | app.dalan.com.vn |
| guest | App khách (Next.js) | menu.dalan.com.vn (và /q/* đi tới API) |
| postgres | Dữ liệu | nội bộ |
| redis | Cache, pub/sub, hàng đợi | nội bộ |
| backup | pg_dump hằng ngày, giữ 30 ngày | nội bộ |

Tại mỗi cơ sở: một PC Windows chạy cầu in (`apps/print-bridge`) nối máy in ESC/POS qua LAN; router có
SIM 4G dự phòng.

## 2. Lần đầu triển khai

Cách nhanh nhất trên máy chủ Ubuntu mới (cài Docker, mở tường lửa, tạo khóa bí mật, build, khởi động):

```bash
# Có tên miền riêng: trỏ DNS A record api/app/menu về IP máy chủ trước, rồi:
curl -fsSL https://raw.githubusercontent.com/sonthkh-alt/dalan-os/main/infra/vps/install.sh | sudo DOMAIN_BASE=dalan.com.vn bash
# Chưa có tên miền: bỏ DOMAIN_BASE, script dùng api.<IP>.sslip.io (vẫn có HTTPS)
```

Hướng dẫn từng bước trên Oracle Cloud miễn phí: `docs/van-hanh/may-chu-mien-phi-oracle.md`.

Chạy tay (đã có `infra/.env.prod`, xem `infra/.env.prod.example`): API tự áp dụng migration và nạp dữ
liệu mẫu khi cơ sở dữ liệu còn trống, dùng `SEED_STAFF_PASSWORD` và `SEED_STAFF_PIN` trong tệp env.

```bash
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod up -d --build
```

Kiểm tra: `https://api.dalan.com.vn/health` trả `{"status":"ok"}`; `https://api.dalan.com.vn/docs` mở Swagger.

Ngay sau khi seed: đăng nhập ADMIN, **đổi mật khẩu và PIN mọi tài khoản mẫu**, cập nhật tài khoản
ngân hàng nhận VietQR thật cho từng cơ sở, cấu hình nhà cung cấp hóa đơn điện tử, Zalo OA và các cổng
thanh toán trong mục Tích hợp.

## 3. Cập nhật phiên bản

Chạy lại script `infra/vps/install.sh` (giữ nguyên dữ liệu và khóa bí mật), hoặc chạy tay:

```bash
git pull
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod up -d --build
```

API áp dụng migration mới mỗi lần khởi động.

Migration của Prisma chỉ thêm, không xóa cột trong cùng phiên bản (quy ước), nên có thể quay lại
image cũ nếu cần. Giữ ít nhất một bản sao lưu ngay trước khi cập nhật.

## 4. Sao lưu và khôi phục

- Tự động: container `backup` chạy `pg_dump` mỗi 24 giờ vào volume `backups`, giữ 30 ngày.
- Khuyến nghị đồng bộ thư mục sao lưu lên lưu trữ đối tượng (đặt `RCLONE_REMOTE`).
- Khôi phục:

```bash
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod stop api
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod exec -T postgres \
  sh -c 'gunzip -c /backups/dalan-YYYYMMDD-HHMMSS.sql.gz | psql -U dalan dalan'
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod start api
```

Kiểm tra khôi phục trên máy thử nghiệm mỗi tháng.

## 5. Giám sát

- `GET /health`: trạng thái DB và Redis. Cấu hình UptimeRobot hoặc tương đương gọi mỗi phút.
- Log JSON của container: `docker compose logs -f api`. Khi có nhiều máy chủ, gom về Loki/Grafana.
- Chỉ số cần theo dõi: thời gian relay outbox (sự kiện chưa `processedAt` quá 1 phút), lệnh in
  FAILED, hóa đơn điện tử FAILED, webhook thanh toán lỗi, đặt bàn chưa nhắc.

## 6. Bảo mật

- Chỉ mở cổng 80/443; PostgreSQL và Redis không công khai.
- Khóa JWT và mật khẩu DB trong `infra/.env.prod`, quyền 600, không commit.
- Bật cập nhật bảo mật tự động của hệ điều hành; xoay vòng khóa JWT khi có nghi ngờ (mọi phiên phải đăng nhập lại).
- Dữ liệu cá nhân khách hàng: chỉ nhân viên có quyền `customer.phone.view_full` thấy số điện thoại đầy đủ; xuất dữ liệu ghi nhật ký.

## 7. Cầu in tại cơ sở

Xem `apps/print-bridge/README.md`: đăng ký thiết bị loại PRINT_BRIDGE trong mục Quản trị → Thiết bị,
dán token vào `.env` của cầu in, cấu hình địa chỉ IP máy in theo trạm, in thử.

## 8. Môi trường phát triển

Xem README gốc. Lệnh hữu ích:

| Lệnh | Việc |
|---|---|
| `pnpm infra:up` | PostgreSQL + Redis dev |
| `pnpm --filter @dalan/db migrate:dev --name <ten>` | Tạo migration mới |
| `pnpm db:seed` | Seed lại (an toàn chạy nhiều lần) |
| `pnpm dev` | Chạy toàn bộ |
| `node apps/api/scripts/smoke.mjs` | Kiểm tra đầu-cuối API |
