/** Mã BIN (NAPAS) của các ngân hàng phổ biến tại Việt Nam dùng cho VietQR. */
export interface VietBank {
  bin: string;
  code: string;
  shortName: string;
  name: string;
}

export const VIET_BANKS: readonly VietBank[] = [
  { bin: '970436', code: 'VCB', shortName: 'Vietcombank', name: 'Ngân hàng TMCP Ngoại thương Việt Nam' },
  { bin: '970415', code: 'ICB', shortName: 'VietinBank', name: 'Ngân hàng TMCP Công thương Việt Nam' },
  { bin: '970418', code: 'BIDV', shortName: 'BIDV', name: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam' },
  { bin: '970405', code: 'VBA', shortName: 'Agribank', name: 'Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam' },
  { bin: '970407', code: 'TCB', shortName: 'Techcombank', name: 'Ngân hàng TMCP Kỹ thương Việt Nam' },
  { bin: '970422', code: 'MB', shortName: 'MB Bank', name: 'Ngân hàng TMCP Quân đội' },
  { bin: '970416', code: 'ACB', shortName: 'ACB', name: 'Ngân hàng TMCP Á Châu' },
  { bin: '970432', code: 'VPB', shortName: 'VPBank', name: 'Ngân hàng TMCP Việt Nam Thịnh Vượng' },
  { bin: '970403', code: 'STB', shortName: 'Sacombank', name: 'Ngân hàng TMCP Sài Gòn Thương Tín' },
  { bin: '970423', code: 'TPB', shortName: 'TPBank', name: 'Ngân hàng TMCP Tiên Phong' },
  { bin: '970437', code: 'HDB', shortName: 'HDBank', name: 'Ngân hàng TMCP Phát triển TP.HCM' },
  { bin: '970441', code: 'VIB', shortName: 'VIB', name: 'Ngân hàng TMCP Quốc tế Việt Nam' },
  { bin: '970443', code: 'SHB', shortName: 'SHB', name: 'Ngân hàng TMCP Sài Gòn - Hà Nội' },
  { bin: '970448', code: 'OCB', shortName: 'OCB', name: 'Ngân hàng TMCP Phương Đông' },
  { bin: '970426', code: 'MSB', shortName: 'MSB', name: 'Ngân hàng TMCP Hàng Hải' },
  { bin: '970440', code: 'SEAB', shortName: 'SeABank', name: 'Ngân hàng TMCP Đông Nam Á' },
  { bin: '970449', code: 'LPB', shortName: 'LPBank', name: 'Ngân hàng TMCP Lộc Phát Việt Nam' },
  { bin: '970431', code: 'EIB', shortName: 'Eximbank', name: 'Ngân hàng TMCP Xuất Nhập khẩu Việt Nam' },
  { bin: '970428', code: 'NAB', shortName: 'Nam A Bank', name: 'Ngân hàng TMCP Nam Á' },
  { bin: '970454', code: 'BVB', shortName: 'BVBank', name: 'Ngân hàng TMCP Bản Việt' },
  { bin: '970427', code: 'VAB', shortName: 'VietABank', name: 'Ngân hàng TMCP Việt Á' },
  { bin: '970409', code: 'BAB', shortName: 'Bac A Bank', name: 'Ngân hàng TMCP Bắc Á' },
  { bin: '970412', code: 'PVCB', shortName: 'PVcomBank', name: 'Ngân hàng TMCP Đại Chúng Việt Nam' },
  { bin: '970425', code: 'ABB', shortName: 'ABBANK', name: 'Ngân hàng TMCP An Bình' },
  { bin: '970419', code: 'NCB', shortName: 'NCB', name: 'Ngân hàng TMCP Quốc Dân' },
  { bin: '970452', code: 'KLB', shortName: 'KienlongBank', name: 'Ngân hàng TMCP Kiên Long' },
  { bin: '970429', code: 'SCB', shortName: 'SCB', name: 'Ngân hàng TMCP Sài Gòn' },
  { bin: '970400', code: 'SGICB', shortName: 'SaigonBank', name: 'Ngân hàng TMCP Sài Gòn Công Thương' },
  { bin: '970433', code: 'VIETBANK', shortName: 'VietBank', name: 'Ngân hàng TMCP Việt Nam Thương Tín' },
  { bin: '970430', code: 'PGB', shortName: 'PGBank', name: 'Ngân hàng TMCP Thịnh vượng và Phát triển' },
  { bin: '970406', code: 'DOB', shortName: 'DongA Bank', name: 'Ngân hàng TMCP Đông Á' },
  { bin: '546034', code: 'CAKE', shortName: 'CAKE', name: 'Ngân hàng số CAKE by VPBank' },
  { bin: '546035', code: 'UBANK', shortName: 'Ubank', name: 'Ngân hàng số Ubank by VPBank' },
  { bin: '963388', code: 'TIMO', shortName: 'Timo', name: 'Ngân hàng số Timo by BVBank' },
];

export function findBankByBin(bin: string): VietBank | undefined {
  return VIET_BANKS.find((b) => b.bin === bin);
}

export function findBankByCode(code: string): VietBank | undefined {
  const upper = code.toUpperCase();
  return VIET_BANKS.find((b) => b.code === upper || b.shortName.toUpperCase() === upper);
}
