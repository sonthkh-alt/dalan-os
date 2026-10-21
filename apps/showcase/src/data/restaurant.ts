import type { BranchCode } from './menu';

// Dữ kiện tổng hợp từ docs/research/01-nghien-cuu-nha-hang-da-lan.md, mục 1 (nguồn dalan.com.vn, truy cập 2026-10-20).

export const SLOGAN = 'Tinh hoa ẩm thực xứ Thanh';
export const COMPANY = 'Công ty Cổ phần Dạ Lan';
export const HEAD_OFFICE = 'Số 01 Phan Chu Trinh, P. Điện Biên, TP. Thanh Hóa';
export const EMAIL = 'dalanthanhhoa@dalan.com.vn';
export const PRICE_DATE = '20/10/2026';

export const REPO_URL = 'https://github.com/sonthkh-alt/dalan-os';
export const DOCS_URL = `${REPO_URL}/tree/main/docs`;

export interface Phone {
  label: string;
  tel: string;
}

export interface Venue {
  code: BranchCode;
  name: string;
  tagline: string;
  address: string;
  phones: Phone[];
  capacity: string;
  highlights: string[];
}

export const venues: Venue[] = [
  {
    code: 'CENTER',
    name: 'Dạ Lan Center',
    tagline: 'Nhà hàng 5 tầng ở ngã tư phía Bắc thành phố',
    address: 'Ngã tư phía Bắc, P. Hạc Thành, TP. Thanh Hóa (QL1A)',
    phones: [
      { label: '0237 385 2004', tel: '+842373852004' },
      { label: '098 405 8966', tel: '+84984058966' },
    ],
    capacity: 'Trên 600 khách',
    highlights: ['Phòng VIP (VIP 6–8 cải tạo năm 2025)', 'Thang máy', 'Ăn sáng và cơm văn phòng'],
  },
  {
    code: 'STAR',
    name: 'Dạ Lan Star',
    tagline: 'Cửa ngõ phía Nam QL1A, xây trên nền Dạ Lan 2 cũ',
    address: '630 Quang Trung 2, P. Hạc Thành, TP. Thanh Hóa',
    phones: [{ label: '0237 661 5678', tel: '+842376615678' }],
    capacity: 'Nhà hàng chọn món',
    highlights: ['Thực đơn chọn món', 'Cơm văn phòng buổi trưa', 'Đồ uống'],
  },
  {
    code: 'EVENT',
    name: 'Dạ Lan Event',
    tagline: 'Trung tâm tiệc cưới và sự kiện rộng 11.000 m²',
    address: 'Lô 28 Công viên Hội An, P. Hạc Thành, TP. Thanh Hóa',
    phones: [
      { label: '0237 888 6999', tel: '+842378886999' },
      { label: '0969 637 069', tel: '+84969637069' },
    ],
    capacity: 'Khoảng 1.100 khách',
    highlights: [
      'Tiệc cưới, hội nghị, gala',
      'Từng tổ chức tiệc 3.000–4.000 khách',
      'Ăn sáng, "Chợ quê" cuối tuần',
    ],
  },
];

export const history: { period: string; text: string }[] = [
  {
    period: '2000–2005',
    text: 'Khởi đầu với 2 cơ sở dưới 900 m² và 52 nhân viên, chuyển đổi từ doanh nghiệp nhà nước.',
  },
  {
    period: '2005–2010',
    text: 'Hơn 200 nhân viên, 5 cơ sở trên 22.000 m², đạt ISO 22000:2005, bắt đầu tổ chức sự kiện từ 2008. Doanh thu năm 2010 đạt 62 tỷ đồng.',
  },
  {
    period: '2010–2015',
    text: 'Mua lại Toàn Hà (2012) làm trung tâm sự kiện, tổng đầu tư gần 150 tỷ đồng.',
  },
  {
    period: '2015 – nay',
    text: 'Tập trung sản xuất và mua sắm; mở rộng Dạ Lan Event (2017), cải tạo sảnh Center (2021), phòng VIP 6–8 (2025).',
  },
];

export const awards: string[] = [
  'Giải Vàng Chất lượng Quốc gia 2010',
  'Huân chương Lao động hạng Ba, hạng Nhì, hạng Nhất',
  '3 sản phẩm OCOP 3 sao: rượu gạo, giò tai, cá diếc kho tộ',
  'Top 10 nhà hàng phục vụ khách du lịch (2017, 2025)',
];

export interface Service {
  title: string;
  where: string;
  text: string;
  menuLink?: { branch: string; label: string };
}

export const services: Service[] = [
  {
    title: 'Tiệc cưới',
    where: 'Dạ Lan Event',
    text: 'Sức chứa khoảng 1.100 khách, đã phục vụ những tiệc 3.000–4.000 khách. Thực đơn tiệc và báo giá theo mâm được nhà hàng tư vấn trực tiếp.',
  },
  {
    title: 'Sự kiện và hội nghị',
    where: 'Dạ Lan Event',
    text: 'Hội nghị, gala, tất niên, liên hoan doanh nghiệp. Tổ chức sự kiện từ năm 2008 với mặt bằng 11.000 m².',
  },
  {
    title: 'Cơm văn phòng',
    where: 'Dạ Lan Center, Dạ Lan Star',
    text: 'Cơm phần buổi trưa 10:30–13:30, từ Thứ 2 đến Thứ 7, phù hợp nhân viên văn phòng quanh khu vực.',
    menuLink: { branch: 'center', label: 'Xem cơm văn phòng' },
  },
  {
    title: 'Ăn sáng',
    where: 'Dạ Lan Center, Dạ Lan Event',
    text: 'Phở, bún, miến, xôi, cháo từ 06:00 đến 10:00 hằng ngày. Dạ Lan Event có thêm món bát đá và phiên "Chợ quê" vào Thứ 7, Chủ nhật.',
    menuLink: { branch: 'event', label: 'Xem thực đơn ăn sáng' },
  },
];
