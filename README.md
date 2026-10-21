# DaLan OS – Hệ thống quản lý và đặt món Nhà hàng Dạ Lan

Monorepo TypeScript cho Nhà hàng Dạ Lan (Thanh Hóa): API, ứng dụng nhân viên (POS, bếp, thu ngân,
lễ tân, quản trị), ứng dụng khách (QR tại bàn, đặt bàn, thành viên), Zalo Mini App và cầu in.

Tài liệu: [docs/spec](docs/spec) (đặc tả nghiệp vụ), [docs/architecture](docs/architecture)
(kiến trúc, ADR), [docs/research](docs/research) (nghiên cứu nền tảng).

## Dùng thử miễn phí trên Internet

Website giới thiệu và thực đơn (tĩnh): https://sonthkh-alt.github.io/dalan-os/

Chạy toàn bộ hệ thống miễn phí: cơ sở dữ liệu trên Neon, ứng dụng trên Render (triển khai bằng một nút bấm,
đăng nhập bằng GitHub). Hướng dẫn chi tiết, tài khoản dùng thử và giới hạn: [docs/van-hanh/dung-thu-mien-phi.md](docs/van-hanh/dung-thu-mien-phi.md).

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/sonthkh-alt/dalan-os)

## Yêu cầu

- Node.js 24 LTS, pnpm 12 (`corepack enable pnpm`)
- Docker Desktop (PostgreSQL 18, Redis 8 cho môi trường dev)

## Khởi động nhanh

```bash
cp .env.example .env              # chỉnh nếu cần
pnpm install
pnpm infra:up                     # PostgreSQL + Redis
pnpm --filter @dalan/db migrate:dev   # tạo bảng
pnpm --filter @dalan/domain --filter @dalan/contracts --filter @dalan/db build
pnpm db:seed                      # dữ liệu Dạ Lan: 3 cơ sở, 273 món, nhân sự mẫu
pnpm --filter @dalan/api build && pnpm --filter @dalan/api start   # API tại http://localhost:4000
node apps/api/scripts/smoke.mjs   # kiểm tra luồng đầu-cuối
```

Bộ kiểm thử đầy đủ và trạng thái từng tiêu chí nghiệm thu: [docs/van-hanh/nghiem-thu.md](docs/van-hanh/nghiem-thu.md).

Quy ước quan trọng khi viết schema sửa (PATCH): dùng `patchSchema()` trong `packages/contracts/src/common.ts`,
không dùng `.partial()`. Với Zod 4, `.partial()` vẫn áp giá trị mặc định nên sẽ ghi đè các trường client không gửi.

Swagger: http://localhost:4000/docs. Tài khoản mẫu: `ADMIN` / `Dalan@2026` (PIN 1234); phục vụ PIN
1111, thu ngân 3333, bếp 4444 (đăng nhập PIN cần thiết bị đã đăng ký qua `POST /api/v1/auth/devices`).

Chạy toàn bộ ở chế độ phát triển: `pnpm dev` (Turborepo chạy API, app nhân viên cổng 3000, app
khách cổng 3001, cầu in).

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| `apps/api` | NestJS 12 (Fastify) + Socket.IO + outbox; mô-đun auth, org, menu, dining, kitchen, billing, printing, ... |
| `apps/staff` | Next.js 16 PWA cho nhân viên: sơ đồ bàn, gọi món, bếp (KDS), thu ngân, ca; đặt bàn, khách hàng, tiệc, kho; quản trị `/admin` (thực đơn, sơ đồ bàn, in QR, nhân sự, cấu hình, báo cáo, nhật ký) |
| `apps/guest` | Next.js 16 PWA song ngữ cho khách: QR tại bàn, gọi món, bill, VietQR, đặt bàn, thành viên |
| `apps/print-bridge` | Dịch vụ in ESC/POS tiếng Việt tại cơ sở (xem README riêng) |
| `apps/zalo-mini` | Zalo Mini App (xem README riêng: cần App ID và tài khoản Zalo OA) |
| `packages/domain` | Logic nghiệp vụ thuần (tiền tệ, VietQR, tính bill, máy trạng thái, lịch bán) + kiểm thử |
| `packages/db` | Prisma 7 schema, migrations, seed |
| `packages/contracts` | Schema Zod và kiểu dữ liệu dùng chung |
| `packages/config` | tsconfig, eslint dùng chung |
| `data/seed` | Thực đơn thật của Dạ Lan trích từ website |
| `infra` | Docker Compose |

## Quy ước

- Tiền tệ: số nguyên đồng (BigInt trong DB), phần trăm theo basis points (10% = 1000).
- Mọi thay đổi trạng thái ghi sự kiện outbox (`DomainEvent`) trong cùng giao dịch; realtime, in, thông báo tiêu thụ từ đó.
- Lệnh ghi từ client gửi header `Idempotency-Key` để gửi lại an toàn khi mất mạng.
- Tiếng Việt là ngôn ngữ gốc của dữ liệu, giao diện và thông báo; tiếng Anh cho khách.
