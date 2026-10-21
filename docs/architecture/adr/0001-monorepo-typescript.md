# ADR 0001: Monorepo TypeScript với pnpm và Turborepo

Ngày: 2026-10-20. Trạng thái: Chấp nhận.

## Bối cảnh
Hệ thống có năm ứng dụng (API, web nhân viên, web khách, Zalo Mini App, cầu in) và nhiều phần
logic dùng chung (tính bill, VietQR, kiểu dữ liệu, giao diện). Người dùng chọn TypeScript cho
toàn bộ.

## Quyết định
Một kho mã duy nhất, pnpm workspaces, Turborepo điều phối build/test/lint có cache. Logic
nghiệp vụ tách vào `packages/domain` không phụ thuộc framework; hợp đồng dữ liệu (Zod) trong
`packages/contracts` dùng cho cả API và client.

## Hệ quả
- Một thay đổi nghiệp vụ (ví dụ cách tính VAT) sửa một chỗ, kiểm thử một chỗ, mọi app dùng chung.
- Cần kỷ luật về ranh giới gói: app không import trực tiếp từ app khác.
- pnpm 12 chặn script cài đặt mặc định; phải khai báo gói được phép build (argon2, esbuild, prisma, sharp).
