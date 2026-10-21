/** Danh mục quyền. Vai trò lưu mảng chuỗi; `*` là toàn quyền, `tai_nguyen.*` là toàn bộ nhóm. */
export const PERMISSION_GROUPS = [
  {
    resource: 'branch',
    name: 'Cơ sở và cấu hình',
    actions: [
      ['read', 'Xem cấu hình cơ sở'],
      ['update', 'Sửa cấu hình cơ sở, khu vực, bàn, trạm, máy in'],
    ],
  },
  {
    resource: 'staff',
    name: 'Nhân sự',
    actions: [
      ['read', 'Xem danh sách nhân sự'],
      ['manage', 'Thêm, sửa, khóa nhân sự, đặt PIN, phân vai trò'],
      ['device', 'Đăng ký và thu hồi thiết bị'],
    ],
  },
  {
    resource: 'menu',
    name: 'Thực đơn',
    actions: [
      ['read', 'Xem thực đơn'],
      ['manage', 'Thêm, sửa món, giá, tùy chọn, thực đơn'],
      ['soldout', 'Đánh dấu hết món'],
    ],
  },
  {
    resource: 'dining',
    name: 'Phục vụ bàn',
    actions: [
      ['read', 'Xem sơ đồ bàn và phiên'],
      ['open', 'Mở bàn, xếp khách'],
      ['order', 'Gọi món, gửi bếp'],
      ['void', 'Hủy món đã gửi bếp (trong hạn mức)'],
      ['void.over_limit', 'Hủy món vượt hạn mức'],
      ['move', 'Gộp, tách, chuyển bàn'],
      ['price.enter', 'Nhập giá món theo thời điểm, món tự do'],
    ],
  },
  {
    resource: 'kitchen',
    name: 'Bếp và bar',
    actions: [
      ['read', 'Xem phiếu bếp'],
      ['bump', 'Báo đang làm, xong, gọi lại phiếu'],
    ],
  },
  {
    resource: 'billing',
    name: 'Thanh toán',
    actions: [
      ['read', 'Xem bill'],
      ['provisional', 'In tạm tính'],
      ['collect', 'Thu tiền, xác nhận chuyển khoản'],
      ['discount', 'Giảm giá trong hạn mức'],
      ['discount.over_limit', 'Giảm giá vượt hạn mức'],
      ['refund', 'Hoàn tiền'],
      ['void', 'Hủy bill'],
    ],
  },
  {
    resource: 'shift',
    name: 'Ca và két tiền',
    actions: [
      ['open', 'Mở ca'],
      ['close', 'Kết ca'],
      ['cash', 'Phiếu thu chi tiền mặt'],
    ],
  },
  {
    resource: 'invoice',
    name: 'Hóa đơn điện tử',
    actions: [
      ['issue', 'Phát hành'],
      ['cancel', 'Hủy, thay thế, điều chỉnh'],
    ],
  },
  {
    resource: 'reservation',
    name: 'Đặt bàn',
    actions: [
      ['read', 'Xem đặt bàn'],
      ['manage', 'Tạo, xác nhận, xếp bàn, hủy, no-show'],
    ],
  },
  {
    resource: 'customer',
    name: 'Khách hàng',
    actions: [
      ['read', 'Xem hồ sơ (số điện thoại che)'],
      ['phone.view_full', 'Xem số điện thoại đầy đủ'],
      ['manage', 'Sửa hồ sơ, điểm, voucher'],
      ['export', 'Xuất danh sách'],
    ],
  },
  {
    resource: 'event',
    name: 'Tiệc và sự kiện',
    actions: [
      ['read', 'Xem tiệc'],
      ['manage', 'Lead, báo giá, hợp đồng, BEO'],
      ['settle', 'Quyết toán'],
    ],
  },
  {
    resource: 'inventory',
    name: 'Kho',
    actions: [
      ['read', 'Xem tồn kho'],
      ['manage', 'Nhập, xuất, chuyển, kiểm kê'],
      ['approve', 'Duyệt kiểm kê và điều chỉnh'],
    ],
  },
  {
    resource: 'report',
    name: 'Báo cáo',
    actions: [
      ['branch', 'Báo cáo cơ sở của mình'],
      ['all', 'Báo cáo toàn công ty'],
      ['event', 'Báo cáo tiệc'],
      ['export', 'Xuất Excel'],
    ],
  },
  {
    resource: 'print',
    name: 'In ấn',
    actions: [
      ['kitchen', 'In phiếu bếp'],
      ['bill', 'In bill'],
      ['manage', 'Cấu hình máy in'],
    ],
  },
  {
    resource: 'audit',
    name: 'Nhật ký',
    actions: [['read', 'Xem nhật ký thao tác']],
  },
] as const;

export const ALL_PERMISSIONS: string[] = PERMISSION_GROUPS.flatMap((g) => g.actions.map(([a]) => `${g.resource}.${a}`));
