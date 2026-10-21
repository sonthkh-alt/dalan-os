# @dalan/showcase – Trang giới thiệu tĩnh Nhà hàng Dạ Lan

Website tĩnh đăng trên GitHub Pages: thực đơn số của ba cơ sở Dạ Lan (Center, Star, Event) và
giới thiệu hệ thống DaLan OS. Không có API, cơ sở dữ liệu hay máy chủ: mọi dữ liệu được nhúng vào
bundle lúc build.

Địa chỉ sau khi triển khai: https://sonthkh-alt.github.io/dalan-os/

## Trang và định tuyến

Định tuyến bằng hash để liên kết sâu chạy được trên GitHub Pages mà không cần rewrite phía máy chủ.

| Đường dẫn                                                  | Nội dung                                                                                                                                                                                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `#/`                                                       | Trang chủ: giới thiệu, lịch sử, giải thưởng, ba cơ sở, món đặc sản, dịch vụ                                                                                                                                               |
| `#/thuc-don/center`, `#/thuc-don/star`, `#/thuc-don/event` | Thực đơn theo cơ sở: tab thực đơn (chọn món, ăn sáng, cơm văn phòng, đồ uống) có nhãn "đang phục vụ" theo giờ Việt Nam, danh mục cố định khi cuộn, tìm kiếm không dấu, bộ lọc (món chay, đặc sản, hải sản, dưới 100.000đ) |
| `#/he-thong`                                               | Hệ thống DaLan OS: tính năng cho khách và nhà hàng, sơ đồ kiến trúc, công nghệ, liên kết mã nguồn                                                                                                                         |
| Hash khác                                                  | Quay về trang chủ (mã cơ sở sai quay về thực đơn Center)                                                                                                                                                                  |

## Nguồn dữ liệu

- Thực đơn: `data/seed/menu-dalan.json` (import trực tiếp trong `src/data/menu.ts`). Món chỉ bán ở
  một thực đơn (trường `menus` của món, `menu`/`alsoMenus` của danh mục) được lọc theo cơ sở giống
  logic seed trong `packages/db/prisma/seed.ts`.
- Định dạng tiền, tìm kiếm không dấu, lịch bán: `@dalan/domain` (`formatVnd`, `matchesSearch`,
  `isWithinSchedule`).
- Thông tin nhà hàng: `docs/research/01-nghien-cuu-nha-hang-da-lan.md` mục 1, chép vào
  `src/data/restaurant.ts`.

Giá món lấy từ ảnh thực đơn trên dalan.com.vn ngày 20/10/2026 và có thể thay đổi; trang hiển thị
lưu ý này ở thực đơn và chân trang.

## Chạy tại máy

```bash
pnpm install
pnpm --filter @dalan/domain build      # showcase dùng packages/domain/dist
pnpm --filter @dalan/showcase dev      # http://localhost:3003/dalan-os/
pnpm --filter @dalan/showcase typecheck
pnpm --filter @dalan/showcase build    # xuất ra apps/showcase/dist
pnpm --filter @dalan/showcase preview  # http://localhost:4173/dalan-os/
```

Đường dẫn gốc (`base` của Vite) lấy từ biến môi trường `SHOWCASE_BASE`, mặc định `/dalan-os/`.
Khi dùng tên miền riêng hoặc repo khác tên, build với `SHOWCASE_BASE=/` hoặc `SHOWCASE_BASE=/<ten-repo>/`.

## Triển khai

Workflow `.github/workflows/pages.yml` chạy khi đẩy lên `main` có thay đổi trong `apps/showcase/**`,
`data/seed/**`, `packages/domain/**` hoặc chính workflow, và có thể chạy tay (`workflow_dispatch`):

1. Cài pnpm (phiên bản đọc từ `packageManager` ở `package.json` gốc) và Node 24.
2. `pnpm install --frozen-lockfile`.
3. Build `@dalan/domain`, rồi build `@dalan/showcase` với `SHOWCASE_BASE=/dalan-os/`.
4. `actions/configure-pages`, `actions/upload-pages-artifact` (thư mục `apps/showcase/dist`),
   `actions/deploy-pages`.

Lần đầu cần bật Pages cho repo: Settings → Pages → Build and deployment → Source: **GitHub Actions**.
