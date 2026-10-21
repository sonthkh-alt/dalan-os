# ADR 0003: NestJS trên Fastify, Prisma 7, PostgreSQL 18, Redis 8

Ngày: 2026-10-20. Trạng thái: Chấp nhận.

## Quyết định
- **NestJS 12** với adapter Fastify: cấu trúc mô-đun rõ cho hệ thống lớn nhiều người bảo trì,
  Guard/Interceptor cho phân quyền và khóa chống trùng, Gateway cho Socket.IO, Swagger sẵn.
- **Prisma 7** với driver adapter `pg`: schema khai báo dễ đọc, migration có kiểm soát, kiểu
  TypeScript sinh tự động. Truy vấn báo cáo phức tạp dùng SQL thuần qua `$queryRaw`/TypedSQL.
- **PostgreSQL 18**: giao dịch ACID cho tiền, JSONB cho snapshot và cấu hình, chỉ mục mạnh,
  phổ biến tại Việt Nam.
- **Redis 8**: pub/sub cho realtime đa bản API, BullMQ cho hàng đợi (in, HĐĐT, ZNS, báo cáo),
  cache thực đơn công khai, giới hạn tần suất, khóa chống trùng ngắn hạn.

## Lựa chọn đã cân nhắc
- Fastify thuần hoặc Hono: nhẹ hơn nhưng thiếu khung mô-đun cho đội lớn.
- Drizzle ORM: tốt nhưng Prisma có migration và tài liệu phổ biến hơn với đội Việt Nam.
- MySQL: kém hơn về JSONB, kiểu thời gian có múi giờ, và CTE.

## Hệ quả
- Prisma 7 yêu cầu `prisma.config.ts`, generator `prisma-client` với `output`, và adapter khi
  khởi tạo client; không tự nạp `.env`.
- Pin TypeScript 5.9 vì NestJS cần `emitDecoratorMetadata`.
