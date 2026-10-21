# ADR 0008: Xác thực và phân quyền

Ngày: 2026-10-20. Trạng thái: Chấp nhận.

## Quyết định
- **Nhân viên**: đăng nhập bằng tài khoản + mật khẩu (quản lý) hoặc **mã PIN** trên thiết bị đã
  đăng ký (phục vụ, thu ngân, bếp). Thiết bị đăng ký một lần bởi quản lý và nhận `deviceToken`
  dài hạn gắn cơ sở; PIN chỉ hợp lệ kèm deviceToken. JWT access 15 phút, refresh 30 ngày xoay vòng,
  thu hồi theo thiết bị.
- **Khách QR**: khi quét QR, API cấp **token phiên khách** (JWT ký riêng, 6 giờ) chứa `sessionId`,
  `participantId`; chỉ có quyền đọc và ghi trên phiên đó. Không cần đăng nhập.
- **Khách thành viên**: OTP qua ZNS/SMS tới số điện thoại, hoặc đăng nhập Zalo (Mini App cung cấp
  token Zalo, API đổi lấy JWT). Hồ sơ gắn theo số điện thoại.
- **Phân quyền**: vai trò → tập quyền chi tiết (chuỗi `tai_nguyen.hanh_dong[.rang_buoc]`), gắn
  theo cơ sở. Guard ở API kiểm tra quyền và `branchId` của tài nguyên. Hành động nhạy cảm vượt hạn
  mức yêu cầu **PIN quản lý** ngay trên thiết bị (ủy quyền tại chỗ), ghi nhật ký cả hai người.
- **Webhook**: xác thực chữ ký HMAC theo từng cổng; đường dẫn riêng, không qua JWT.

## Hệ quả
- Thiết bị chung đổi người nhanh (gõ PIN), vẫn truy vết được ai làm gì.
- Khách không bị ép cài app hay đăng ký; vẫn chia tiền theo người được nhờ `participantId`.
