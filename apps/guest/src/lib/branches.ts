/** Ba cơ sở Dạ Lan (dùng cho trang chủ và đặt bàn khi chưa có API công khai). */
export interface BranchInfo {
  code: string;
  name: string;
  address: string;
  phone: string;
  capacity: number | null;
  highlight: { vi: string; en: string };
}

export const BRANCHES: BranchInfo[] = [
  {
    code: 'CENTER',
    name: 'Dạ Lan Center',
    address: 'Ngã tư phía Bắc, P. Hạc Thành, TP. Thanh Hóa (QL1A)',
    phone: '02373852004',
    capacity: 600,
    highlight: { vi: 'Nhà hàng 5 tầng, phòng VIP, ăn sáng và cơm văn phòng', en: '5-floor restaurant, private rooms, breakfast and office lunch' },
  },
  {
    code: 'STAR',
    name: 'Dạ Lan Star',
    address: '630 Quang Trung 2, P. Hạc Thành, TP. Thanh Hóa',
    phone: '02376615678',
    capacity: null,
    highlight: { vi: 'Cửa ngõ phía Nam thành phố, phòng VIP và sảnh tiệc', en: 'Southern gateway of the city, private rooms and banquet hall' },
  },
  {
    code: 'EVENT',
    name: 'Dạ Lan Event',
    address: 'Lô 28 Công viên Hội An, P. Hạc Thành, TP. Thanh Hóa',
    phone: '02378886999',
    capacity: 1100,
    highlight: { vi: '11.000 m², tiệc cưới và sự kiện tới 1.100 khách, ăn sáng Chợ quê cuối tuần', en: '11,000 m², weddings and events up to 1,100 guests, weekend countryside breakfast' },
  },
];

export function findBranch(code: string): BranchInfo | undefined {
  return BRANCHES.find((b) => b.code === code.toUpperCase());
}
