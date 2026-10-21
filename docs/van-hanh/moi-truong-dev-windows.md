# Môi trường phát triển trên Windows (máy hiện tại)

Ghi lại cách máy này đã được thiết lập ngày 2026-10-20 để người khác lặp lại được.

## Công cụ

| Công cụ | Vị trí / phiên bản | Ghi chú |
|---|---|---|
| Node.js 24.22 LTS | `C:\Users\Son Ha\.local\node` (bản portable, đã thêm vào PATH người dùng) | Không cần quyền quản trị; xóa thư mục là gỡ. Nếu terminal mới chưa thấy `node`, mở lại terminal. |
| pnpm 12.14 | qua `corepack` của Node | `corepack enable pnpm` |
| Docker Desktop 29 | đã cài sẵn | Phải mở Docker Desktop trước khi `pnpm infra:up`. Container có `restart: unless-stopped` nên tự chạy lại khi Docker khởi động. |
| Git 2.56 | đã cài sẵn | Kho mã mới chỉ `git init`, chưa có commit. |

## Lưu ý quan trọng về OneDrive

Dự án đang nằm trong thư mục OneDrive. `node_modules` có hàng chục nghìn tệp và thay đổi liên tục,
OneDrive sẽ đồng bộ chậm, chiếm CPU và đôi khi khóa tệp làm build lỗi. Hai cách xử lý:

1. **Khuyến nghị**: chuyển kho mã ra ngoài OneDrive, ví dụ `C:\dev\dalan`, và dùng Git (GitHub/GitLab
   riêng) để sao lưu thay vì OneDrive.
2. Tạm thời: trong OneDrive → Cài đặt → Đồng bộ và sao lưu → Quản lý sao lưu, hoặc chuột phải thư
   mục `node_modules`, `.next`, `dist` → "Luôn giữ trên thiết bị này" và loại trừ khỏi đồng bộ (OneDrive
   không hỗ trợ loại trừ thư mục con trực tiếp, nên cách 1 vẫn tốt hơn).

Cấu hình pnpm đã đặt `nodeLinker: hoisted` để tránh junction/symlink gây lỗi với OneDrive.

## Cổng dùng trong dev

| Cổng | Dịch vụ |
|---|---|
| 4000 | API (Swagger tại /docs) |
| 3000 | App nhân viên |
| 3001 | App khách |
| 5432 | PostgreSQL (Docker) |
| 6379 | Redis (Docker) |

Lưu ý: dùng `127.0.0.1` thay vì `localhost` trong `DATABASE_URL`/`REDIS_URL` vì Node 24 ưu tiên IPv6
cho `localhost` trong khi Docker chỉ mở IPv4.

## Lệnh hằng ngày

```powershell
pnpm infra:up                                  # bật DB + Redis
pnpm --filter @dalan/api build; pnpm --filter @dalan/api start   # API
pnpm --filter @dalan/staff dev                 # app nhân viên
pnpm --filter @dalan/guest dev                 # app khách
node apps/api/scripts/smoke.mjs                # kiểm tra đầu-cuối
pnpm --filter @dalan/db studio                 # xem dữ liệu
```

Khi đổi `schema.prisma`: `pnpm --filter @dalan/db migrate:dev --name <ten-thay-doi>` rồi
`pnpm --filter @dalan/db build`.

## Tài khoản mẫu (chỉ dev)

ADMIN / Dalan@2026 (PIN 1234); GD01 (giám đốc) / Dalan@2026; QL-C, QL-S, QL-E (quản lý từng cơ sở) /
Dalan@2026, PIN 2222; PV1-C PIN 1111; TN-C PIN 3333; BEP-C PIN 4444; LT-C PIN 5555; KDT01 (kinh doanh
tiệc) / Dalan@2026. Đăng nhập PIN cần thiết bị đã đăng ký (`POST /api/v1/auth/devices`).
