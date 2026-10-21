/** Ba cơ sở Dạ Lan (dữ liệu tĩnh hiển thị khi API chưa sẵn sàng; id thật lấy từ /public/branches). */
export interface BranchInfo {
  code: string;
  name: string;
  address: string;
  phone: string;
  capacity: number | null;
  highlight: string;
}

export const BRANCHES: BranchInfo[] = [
  {
    code: 'CENTER',
    name: 'Dạ Lan Center',
    address: 'Ngã tư phía Bắc, P. Hạc Thành, TP. Thanh Hóa (QL1A)',
    phone: '02373852004',
    capacity: 600,
    highlight: 'Nhà hàng 5 tầng, phòng VIP, ăn sáng và cơm văn phòng',
  },
  {
    code: 'STAR',
    name: 'Dạ Lan Star',
    address: '630 Quang Trung 2, P. Hạc Thành, TP. Thanh Hóa',
    phone: '02376615678',
    capacity: null,
    highlight: 'Cửa ngõ phía Nam thành phố, phòng VIP và sảnh tiệc',
  },
  {
    code: 'EVENT',
    name: 'Dạ Lan Event',
    address: 'Lô 28 Công viên Hội An, P. Hạc Thành, TP. Thanh Hóa',
    phone: '02378886999',
    capacity: 1100,
    highlight: '11.000 m², tiệc cưới và sự kiện tới 1.100 khách, ăn sáng Chợ quê cuối tuần',
  },
];

export function findBranch(code: string | undefined): BranchInfo | undefined {
  if (!code) return undefined;
  return BRANCHES.find((b) => b.code === code.toUpperCase());
}

export function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length === 11) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  return phone;
}
