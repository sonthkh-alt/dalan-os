#!/usr/bin/env bash
# Khởi động API trên Render: áp dụng migration, seed nếu cơ sở dữ liệu còn trống, rồi chạy API.
# Gói miễn phí không có pre-deploy command nên các bước này chạy mỗi lần khởi động (nhanh khi đã có dữ liệu).
set -euo pipefail

cd "$(dirname "$0")/.."

# Neon: migration và seed cần kết nối TRỰC TIẾP (không qua PgBouncer "-pooler"), và bỏ tham số
# channel_binding mà công cụ migration của Prisma có thể không hỗ trợ. API vẫn dùng DATABASE_URL gốc.
MIGRATE_URL="$(node -e '
  const u = new URL(process.env.DATABASE_URL);
  u.hostname = u.hostname.replace("-pooler.", ".");
  u.searchParams.delete("channel_binding");
  process.stdout.write(u.toString());
')"

(cd packages/db && DATABASE_URL="$MIGRATE_URL" npx prisma migrate deploy)

# Seed lần đầu. NODE_ENV=production buộc dùng SEED_STAFF_PASSWORD / SEED_STAFF_PIN do người triển khai đặt.
(cd packages/db && DATABASE_URL="$MIGRATE_URL" SEED_ONLY_IF_EMPTY=1 NODE_ENV=production npx tsx prisma/seed.ts)

export NODE_ENV=production
exec node apps/api/dist/main.js
