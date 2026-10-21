# Cầu in DaLan OS (print-bridge)

Dịch vụ nhỏ chạy trên một máy tính tại mỗi cơ sở. Nó nhận lệnh in từ máy chủ DaLan OS, vẽ phiếu
bếp, bill, báo cáo ca thành ảnh (để in tiếng Việt có dấu trên máy in nhiệt không có font Unicode),
mã hóa ESC/POS và gửi tới máy in LAN hoặc USB. Hàng đợi được lưu trên đĩa nên không mất lệnh in
khi mất mạng, mất điện hoặc máy in kẹt giấy.

## Cách hoạt động

1. Kết nối realtime tới API (`/rt`, xác thực bằng token thiết bị). Khi có `print.job.created`,
   cầu in kéo ngay lệnh mới; đồng thời vẫn kéo định kỳ (`POLL_INTERVAL_MS`) để phòng realtime lỗi.
2. Mỗi lệnh in được lưu vào `data/queue.json`, render theo loại (phiếu bếp, phiếu hủy, tạm tính,
   hóa đơn, báo cáo ca, phiếu cọc, in thử, nhãn), gửi tới máy in theo cấu hình trên máy chủ
   (`Printer.connection`, `Printer.address`, khổ giấy 58/80 mm), rồi báo kết quả về API.
3. Máy in lỗi: thử lại 3 lần mỗi lượt, lùi thời gian tăng dần, tối đa `MAX_PRINT_ATTEMPTS` lượt
   rồi báo FAILED để quản lý thấy trên màn hình in ấn.
4. Trang trạng thái và in khẩn cấp trong LAN tại `http://<máy cầu in>:LOCAL_PORT/`.

## Cài đặt trên PC Windows tại cơ sở

Yêu cầu: Windows 10/11, Node.js 24 LTS (https://nodejs.org), máy tính nối cùng mạng LAN với máy in.

1. Lấy mã nguồn đã build: sao chép thư mục `apps/print-bridge` (gồm `dist/`, `package.json`) và
   `node_modules` của monorepo, hoặc trên máy phát triển chạy `pnpm --filter @dalan/print-bridge build`
   rồi đóng gói. Cách đơn giản nhất: cài toàn bộ monorepo lên máy đó và chạy `pnpm install`.
2. Đăng ký thiết bị trên máy chủ (quản lý đăng nhập app nhân viên → Quản trị → Thiết bị → Thêm
   loại **Cầu in**, hoặc gọi `POST /api/v1/auth/devices` với `kind: "PRINT_BRIDGE"`). Sao chép
   **token thiết bị** (chỉ hiển thị một lần).
3. Tạo tệp `apps/print-bridge/.env` từ `.env.example`:

   ```
   API_URL=https://api.dalan.com.vn
   DEVICE_TOKEN=dev_xxxxxxxx
   DATA_DIR=C:\DaLanPrintBridge\data
   LOCAL_PORT=9100
   ```

4. Chạy thử: `node dist/main.js`. Nhật ký phải hiện "Đã kết nối realtime" và danh sách máy in.
   Vào app nhân viên → Quản trị → Máy in → **In thử** để kiểm tra từng máy in.
5. Chạy như dịch vụ Windows (tự khởi động cùng máy) bằng NSSM (https://nssm.cc):

   ```
   nssm install DaLanPrintBridge "C:\Program Files\nodejs\node.exe" "C:\dalan\apps\print-bridge\dist\main.js"
   nssm set DaLanPrintBridge AppDirectory C:\dalan\apps\print-bridge
   nssm set DaLanPrintBridge AppStdout C:\DaLanPrintBridge\bridge.log
   nssm set DaLanPrintBridge AppStderr C:\DaLanPrintBridge\bridge.log
   nssm set DaLanPrintBridge AppRestartDelay 5000
   nssm start DaLanPrintBridge
   ```

   Hoặc Task Scheduler: tác vụ "Khi khởi động", chạy `node.exe dist/main.js` trong thư mục
   `apps/print-bridge`, tích "Chạy dù người dùng không đăng nhập" và "Khởi động lại nếu lỗi".
6. Mở cổng `LOCAL_PORT` trên Windows Firewall nếu muốn tablet trong LAN dùng in khẩn cấp.

## Cấu hình máy in

| Loại kết nối | Địa chỉ (`Printer.address`) | Ghi chú |
|---|---|---|
| NETWORK (LAN) | `192.168.1.201` hoặc `192.168.1.201:9100` | Đặt IP tĩnh cho máy in (qua tiện ích của hãng hoặc DHCP reservation). Cổng RAW 9100 là chuẩn của Xprinter, Epson, Gprinter, Sewoo |
| USB | `\\TENMAY\TenMayInChiaSe` (Windows, máy in đã chia sẻ) hoặc `/dev/usb/lp0` (Linux) | Trên Windows, chia sẻ máy in rồi dùng đường dẫn UNC; nếu không được, dùng bộ chuyển USB→LAN hoặc máy in có cổng LAN |
| BLUETOOTH | – | Chưa hỗ trợ |

Khổ giấy: 80 mm in 576 điểm/dòng, 58 mm in 384 điểm/dòng (203 dpi). Phiếu bếp nên dùng 80 mm
để chữ to; mở két tiền qua cổng DK của máy in hóa đơn (lệnh ESC p) khi in hóa đơn có tiền mặt.

Font: dùng font hệ thống hỗ trợ tiếng Việt (Segoe UI, Arial trên Windows; DejaVu Sans trên Linux).
Có thể đặt tệp `.ttf` vào `apps/print-bridge/assets/fonts/` để dùng font riêng (ví dụ Roboto) và
chỉ định `FONT_FAMILY`.

## Chế độ mô phỏng (không có máy in)

Đặt `SIMULATOR_DIR=C:\DaLanPrintBridge\sim`. Thay vì gửi tới máy in, mỗi lệnh in xuất ba tệp:
`.png` (ảnh phiếu để xem), `.bin` (dữ liệu ESC/POS thô, có thể gửi tới máy in bằng
`copy /b file.bin \\PC\MayIn`), `.json` (payload). Dùng để nghiệm thu mẫu in trước khi mua máy.

## In khẩn cấp khi mất internet

Thiết bị trong LAN gửi `POST http://<cầu in>:9100/print` với JSON
`{ "kind": "KITCHEN_TICKET", "printerCode": "KITCHEN-1", "payload": { ... } }`
(payload cùng dạng API tạo). Cầu in render và in ngay, không báo về API. App nhân viên dùng đường
này khi máy chủ không liên lạc được.

## Xử lý sự cố

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| "Thiết bị chưa đăng ký hoặc đã bị thu hồi" | Sai DEVICE_TOKEN hoặc thiết bị bị thu hồi | Tạo thiết bị mới, cập nhật `.env`, khởi động lại dịch vụ |
| "Hết thời gian chờ 192.168.x.x:9100" | Máy in tắt, sai IP, khác mạng | Ping IP máy in; in trang cấu hình của máy in (giữ nút FEED khi bật) để xem IP |
| In ra ký tự lạ thay vì phiếu | Máy in không hiểu lệnh raster GS v 0 | Kiểm tra máy in hỗ trợ ESC/POS; một số máy chỉ nhận `ESC *` (liên hệ kỹ thuật) |
| Phiếu bị cắt giữa chừng | Bộ đệm máy in nhỏ | Giảm `chunkRows` trong `src/render/escpos.ts` (mặc định 512 hàng) |
| Lệnh in lặp lại | Cầu in chưa báo được kết quả về API (mất mạng) | Bình thường: cầu in không in lại job đã có trong hàng đợi; kết quả sẽ báo khi có mạng |
| Trang trạng thái không mở | Cổng bị chặn hoặc trùng | Đổi `LOCAL_PORT`, mở Firewall |

Nhật ký in: `data/history.jsonl` (mỗi dòng một lệnh in: giờ, loại, máy in, kết quả).

## Phát triển

```
pnpm --filter @dalan/print-bridge dev      # chạy với tsx, tự tải lại
pnpm --filter @dalan/print-bridge test     # kiểm thử bộ mã hóa ESC/POS, định dạng
pnpm --filter @dalan/print-bridge build
```

Mã nguồn: `src/main.ts` (vòng lặp), `src/api.ts`, `src/queue.ts` (hàng đợi bền vững),
`src/render/` (khối → canvas → bitmap → ESC/POS, QR), `src/templates/` (mẫu phiếu),
`src/transports/` (LAN, USB, mô phỏng), `src/local-server.ts` (trạng thái, in khẩn cấp).
