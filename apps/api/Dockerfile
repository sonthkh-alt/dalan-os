# API DaLan OS. Build từ gốc kho mã: docker build -f apps/api/Dockerfile .
# Chạy được trên x86_64 và ARM64 (Oracle Cloud Ampere).
FROM node:24-alpine
RUN apk add --no-cache bash libc6-compat openssl
WORKDIR /repo

# Cài toàn bộ workspace (lockfile tham chiếu mọi app). Giữ devDependencies vì lúc khởi động
# cần prisma (migrate) và tsx (seed lần đầu).
COPY . .
# prisma generate chỉ đọc schema, không kết nối: DATABASE_URL giả cho riêng bước build
RUN export DATABASE_URL=postgresql://build:build@localhost:5432/build \
 && npx --yes pnpm@12.14.0 install --frozen-lockfile \
 && npx --yes pnpm@12.14.0 --filter @dalan/domain --filter @dalan/contracts --filter @dalan/db build \
 && npx --yes pnpm@12.14.0 --filter @dalan/api build \
 && mkdir -p /repo/storage && chown -R node:node /repo/storage

ENV NODE_ENV=production \
    API_PORT=4000 \
    STORAGE_LOCAL_DIR=/repo/storage
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/health || exit 1
# Áp dụng migration, seed nếu cơ sở dữ liệu trống, rồi chạy API
CMD ["bash", "scripts/render-start-api.sh"]
