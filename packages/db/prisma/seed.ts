/**
 * Seed dữ liệu Dạ Lan: tổ chức, 3 cơ sở, vai trò, nhân sự mẫu, trạm bếp, máy in, sơ đồ bàn,
 * thực đơn thật (data/seed/menu-dalan.json), hạng thành viên, sảnh tiệc, danh mục dịch vụ,
 * kho và định lượng mẫu, khách hàng mẫu. Chạy lại an toàn (upsert theo mã).
 */
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { createPrismaClient, hashSecret } from '../src/index.js';

loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

type SeedItem = {
  name: string;
  nameEn?: string;
  unit: string;
  price?: number | null;
  variants?: { name: string; price: number }[];
  modifiers?: { name: string; required: boolean; options: string[] }[];
  pricingMode?: 'weight' | 'market';
  station?: string;
  signature?: boolean;
  vegetarian?: boolean;
  countEmpties?: boolean;
  ownBrand?: boolean;
  description?: string;
  note?: string;
  menus?: string[];
};
type SeedCategory = {
  code: string;
  name: string;
  menu: string;
  alsoMenus?: string[];
  station: string;
  sort: number;
  availability?: { days: number[]; from: string; to: string } | null;
  note?: string;
  items: SeedItem[];
};
type SeedFile = {
  branches: { code: string; name: string; address: string; phone: string; capacity: number | null }[];
  stations: { code: string; name: string }[];
  menus: { code: string; name: string; branches: string[]; availability: { days: number[]; from: string; to: string } | null }[];
  categories: SeedCategory[];
};

const prisma = createPrismaClient({ max: 4 });
const money = (n: number) => BigInt(n);

function removeDiacritics(input: string): string {
  return input.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}
function codify(input: string, max = 48): string {
  return removeDiacritics(input)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}
function qrToken(): string {
  return randomBytes(9).toString('base64url');
}

/** Gộp menu ăn sáng của Center và Event thành một menu BREAKFAST, ẩn món theo cơ sở. */
const MENU_ALIAS: Record<string, string> = {
  BREAKFAST_CENTER: 'BREAKFAST',
  BREAKFAST_EVENT: 'BREAKFAST',
};
const MENU_KIND: Record<string, 'ALACARTE' | 'BREAKFAST' | 'LUNCH' | 'DRINKS'> = {
  ALACARTE: 'ALACARTE',
  BREAKFAST: 'BREAKFAST',
  OFFICE_LUNCH: 'LUNCH',
  DRINKS: 'DRINKS',
};

function resolveSeedCredentials(): { password?: string; pin?: string } {
  const password = process.env.SEED_STAFF_PASSWORD;
  const pin = process.env.SEED_STAFF_PIN;
  if (process.env.NODE_ENV === 'production') {
    if (!password || password.length < 10 || password === 'Dalan@2026') {
      throw new Error('Production: đặt SEED_STAFF_PASSWORD (tối thiểu 10 ký tự, không dùng mật khẩu mẫu) trước khi seed');
    }
    if (!pin || !/^\d{4,6}$/.test(pin) || ['1234', '1111', '2222', '9999', '0000'].includes(pin)) {
      throw new Error('Production: đặt SEED_STAFF_PIN (4-6 chữ số, không dùng PIN mẫu) trước khi seed');
    }
  }
  return { password, pin };
}

async function main() {
  // Kiểm tra mật khẩu/PIN TRƯỚC mọi thao tác ghi, để không để lại dữ liệu dở dang khi thiếu cấu hình.
  // Mật khẩu/PIN mẫu công khai trong kho mã, chỉ dùng cho môi trường phát triển; production bắt buộc
  // đặt SEED_STAFF_PASSWORD (tối thiểu 10 ký tự) và SEED_STAFF_PIN (4-6 số).
  const credentials = resolveSeedCredentials();
  // Khi khởi động trên nền tảng đám mây: chỉ seed lần đầu (cơ sở dữ liệu trống)
  if (process.env.SEED_ONLY_IF_EMPTY === '1' && (await prisma.organization.count()) > 0) {
    console.log('Đã có dữ liệu, bỏ qua seed.');
    return;
  }
  const seedPath = fileURLToPath(new URL('../../../data/seed/menu-dalan.json', import.meta.url));
  const seed = JSON.parse(readFileSync(seedPath, 'utf8')) as SeedFile;

  // 1. Tổ chức
  const org = await prisma.organization.upsert({
    where: { code: 'DALAN' },
    update: {},
    create: {
      code: 'DALAN',
      name: 'Nhà hàng Dạ Lan',
      legalName: 'Công ty Cổ phần Dạ Lan',
      address: 'Số 01 Phan Chu Trinh, P. Điện Biên, TP. Thanh Hóa',
      phone: '02373852004',
      email: 'dalanthanhhoa@dalan.com.vn',
      settings: { slogan: 'Tinh hoa ẩm thực xứ Thanh', website: 'https://dalan.com.vn' },
    },
  });

  // 2. Cơ sở
  const branches = new Map<string, { id: string }>();
  for (const b of seed.branches) {
    const branch = await prisma.branch.upsert({
      where: { orgId_code: { orgId: org.id, code: b.code } },
      update: { name: b.name, address: b.address, phone: b.phone },
      create: {
        orgId: org.id,
        code: b.code,
        name: b.name,
        address: b.address,
        phone: b.phone,
        // Tài khoản nhận VietQR mẫu: thay bằng tài khoản thật của nhà hàng khi triển khai.
        bankBin: '970436',
        bankAccountNo: '0011001234567',
        bankAccountName: 'CONG TY CO PHAN DA LAN',
        receiptHeader: 'Nhà hàng Dạ Lan - Tinh hoa ẩm thực xứ Thanh',
        receiptFooter: 'Cảm ơn quý khách. Hẹn gặp lại!',
        openingHours: { default: { from: '06:00', to: '22:00' } },
        settings: { demoBankAccount: true, capacity: b.capacity },
      },
    });
    branches.set(b.code, branch);
  }

  // 3. Vai trò và nhân sự
  const roleDefs: Record<string, { name: string; permissions: string[] }> = {
    ADMIN: { name: 'Quản trị hệ thống', permissions: ['*'] },
    DIRECTOR: { name: 'Ban giám đốc', permissions: ['report.*', 'branch.read', 'menu.read', 'event.read', 'customer.read', 'audit.read'] },
    BRANCH_MANAGER: {
      name: 'Quản lý cơ sở',
      permissions: ['branch.*', 'menu.*', 'dining.*', 'kitchen.*', 'billing.*', 'shift.*', 'reservation.*', 'customer.*', 'inventory.*', 'report.branch', 'staff.read', 'event.read', 'print.*', 'invoice.*'],
    },
    // Không dùng 'dining.*' / 'billing.*' cho nhân viên: ký tự đại diện bao gồm cả quyền vượt hạn mức
    // (hủy món lớn, giảm giá sâu, hoàn tiền), vốn phải cần PIN quản lý.
    WAITER: {
      name: 'Phục vụ',
      permissions: ['dining.read', 'dining.open', 'dining.order', 'dining.void', 'dining.move', 'kitchen.read', 'billing.read', 'billing.provisional', 'reservation.read', 'customer.read', 'print.kitchen'],
    },
    HOST: { name: 'Lễ tân', permissions: ['reservation.*', 'dining.open', 'dining.read', 'customer.read', 'customer.manage'] },
    CASHIER: {
      name: 'Thu ngân',
      permissions: ['billing.read', 'billing.provisional', 'billing.collect', 'billing.discount', 'shift.*', 'dining.read', 'invoice.issue', 'customer.read', 'print.bill', 'print.kitchen'],
    },
    KITCHEN: { name: 'Bếp', permissions: ['kitchen.*', 'menu.soldout'] },
    BAR: { name: 'Bar', permissions: ['kitchen.*', 'menu.soldout'] },
    EVENT_SALES: { name: 'Kinh doanh tiệc', permissions: ['event.*', 'customer.*', 'menu.read', 'report.event'] },
    STOCK: { name: 'Thủ kho', permissions: ['inventory.*', 'menu.read'] },
    ACCOUNTANT: { name: 'Kế toán', permissions: ['billing.read', 'invoice.*', 'report.*', 'inventory.read', 'event.read', 'audit.read'] },
  };
  const roles = new Map<string, { id: string }>();
  for (const [code, def] of Object.entries(roleDefs)) {
    const role = await prisma.role.upsert({
      where: { orgId_code: { orgId: org.id, code } },
      update: { name: def.name, permissions: def.permissions, isSystem: true },
      create: { orgId: org.id, code, name: def.name, permissions: def.permissions, isSystem: true },
    });
    roles.set(code, role);
  }

  const staffDefs: { code: string; fullName: string; role: string; pin: string; password?: string; branches: string[] }[] = [
    { code: 'ADMIN', fullName: 'Quản trị hệ thống', role: 'ADMIN', pin: '1234', password: 'Dalan@2026', branches: ['CENTER', 'STAR', 'EVENT'] },
    { code: 'GD01', fullName: 'Ban giám đốc', role: 'DIRECTOR', pin: '9999', password: 'Dalan@2026', branches: ['CENTER', 'STAR', 'EVENT'] },
  ];
  for (const code of ['CENTER', 'STAR', 'EVENT']) {
    const suffix = code.slice(0, 1);
    staffDefs.push(
      { code: `QL-${suffix}`, fullName: `Quản lý ${code}`, role: 'BRANCH_MANAGER', pin: '2222', password: 'Dalan@2026', branches: [code] },
      { code: `PV1-${suffix}`, fullName: `Phục vụ 1 ${code}`, role: 'WAITER', pin: '1111', branches: [code] },
      { code: `PV2-${suffix}`, fullName: `Phục vụ 2 ${code}`, role: 'WAITER', pin: '1112', branches: [code] },
      { code: `TN-${suffix}`, fullName: `Thu ngân ${code}`, role: 'CASHIER', pin: '3333', branches: [code] },
      { code: `BEP-${suffix}`, fullName: `Bếp ${code}`, role: 'KITCHEN', pin: '4444', branches: [code] },
      { code: `LT-${suffix}`, fullName: `Lễ tân ${code}`, role: 'HOST', pin: '5555', branches: [code] },
    );
  }
  staffDefs.push({ code: 'KDT01', fullName: 'Kinh doanh tiệc', role: 'EVENT_SALES', pin: '6666', password: 'Dalan@2026', branches: ['EVENT', 'CENTER', 'STAR'] });
  for (const s of staffDefs) {
    const staff = await prisma.staff.upsert({
      where: { orgId_code: { orgId: org.id, code: s.code } },
      update: { fullName: s.fullName, roleId: roles.get(s.role)!.id },
      create: {
        orgId: org.id,
        code: s.code,
        fullName: s.fullName,
        roleId: roles.get(s.role)!.id,
        pinHash: hashSecret(credentials.pin ?? s.pin),
        passwordHash: s.password ? hashSecret(credentials.password ?? s.password) : null,
      },
    });
    for (const [i, bc] of s.branches.entries()) {
      await prisma.staffBranch.upsert({
        where: { staffId_branchId: { staffId: staff.id, branchId: branches.get(bc)!.id } },
        update: { isDefault: i === 0 },
        create: { staffId: staff.id, branchId: branches.get(bc)!.id, isDefault: i === 0 },
      });
    }
  }

  // 4. Máy in và trạm bếp theo cơ sở
  for (const [bc, branch] of branches) {
    const printerDefs = [
      { code: 'RECEIPT-1', name: 'Máy in hóa đơn quầy', kind: 'RECEIPT' as const, address: '192.168.1.200' },
      { code: 'KITCHEN-1', name: 'Máy in bếp nóng', kind: 'KITCHEN' as const, address: '192.168.1.201' },
      { code: 'BAR-1', name: 'Máy in quầy bar', kind: 'KITCHEN' as const, address: '192.168.1.202' },
    ];
    const printers = new Map<string, { id: string }>();
    for (const p of printerDefs) {
      const printer = await prisma.printer.upsert({
        where: { branchId_code: { branchId: branch.id, code: p.code } },
        update: { name: p.name },
        create: { branchId: branch.id, code: p.code, name: p.name, kind: p.kind, address: p.address, paperWidthMm: 80 },
      });
      printers.set(p.code, printer);
    }
    for (const [i, st] of seed.stations.entries()) {
      const printer = st.code === 'BAR' ? printers.get('BAR-1') : printers.get('KITCHEN-1');
      await prisma.station.upsert({
        where: { branchId_code: { branchId: branch.id, code: st.code } },
        update: { name: st.name, printerId: printer?.id ?? null, sortOrder: i },
        create: { branchId: branch.id, code: st.code, name: st.name, mode: 'BOTH', printerId: printer?.id ?? null, sortOrder: i },
      });
    }
    void bc;
  }

  // 5. Khu vực và bàn mẫu (nhà hàng sẽ thay bằng sơ đồ thật)
  const layouts: Record<string, { code: string; name: string; kind: 'HALL' | 'VIP_ROOM' | 'OUTDOOR' | 'VIRTUAL'; floor: number; tables: number; prefix: string; seats: [number, number]; minSpend?: number }[]> = {
    CENTER: [
      { code: 'T1', name: 'Tầng 1 - Sảnh A', kind: 'HALL', floor: 1, tables: 20, prefix: 'A', seats: [4, 8] },
      { code: 'T2', name: 'Tầng 2 - Sảnh B', kind: 'HALL', floor: 2, tables: 20, prefix: 'B', seats: [4, 10] },
      { code: 'VIP', name: 'Tầng 3 - Phòng VIP', kind: 'VIP_ROOM', floor: 3, tables: 8, prefix: 'VIP', seats: [8, 20], minSpend: 3_000_000 },
      { code: 'TAKEAWAY', name: 'Mang về', kind: 'VIRTUAL', floor: 0, tables: 2, prefix: 'MV', seats: [1, 1] },
    ],
    STAR: [
      { code: 'SC', name: 'Sảnh chính', kind: 'HALL', floor: 1, tables: 24, prefix: 'S', seats: [4, 8] },
      { code: 'VIP', name: 'Phòng VIP', kind: 'VIP_ROOM', floor: 2, tables: 6, prefix: 'VIP', seats: [8, 16], minSpend: 2_000_000 },
      { code: 'TAKEAWAY', name: 'Mang về', kind: 'VIRTUAL', floor: 0, tables: 2, prefix: 'MV', seats: [1, 1] },
    ],
    EVENT: [
      { code: 'HA', name: 'Sảnh Hội An', kind: 'HALL', floor: 1, tables: 60, prefix: 'HA', seats: [10, 10] },
      { code: 'LS', name: 'Sảnh Lam Sơn', kind: 'HALL', floor: 1, tables: 40, prefix: 'LS', seats: [10, 10] },
      { code: 'VIP', name: 'Phòng VIP', kind: 'VIP_ROOM', floor: 2, tables: 4, prefix: 'VIP', seats: [10, 24], minSpend: 3_000_000 },
      { code: 'SANG', name: 'Khu ăn sáng', kind: 'HALL', floor: 1, tables: 16, prefix: 'AS', seats: [2, 6] },
    ],
  };
  for (const [bc, areas] of Object.entries(layouts)) {
    const branch = branches.get(bc)!;
    for (const [ai, a] of areas.entries()) {
      const area = await prisma.area.upsert({
        where: { branchId_code: { branchId: branch.id, code: a.code } },
        update: { name: a.name, kind: a.kind, floor: a.floor, sortOrder: ai, minSpend: a.minSpend ? money(a.minSpend) : null },
        create: { branchId: branch.id, code: a.code, name: a.name, kind: a.kind, floor: a.floor, sortOrder: ai, minSpend: a.minSpend ? money(a.minSpend) : null },
      });
      const cols = 5;
      for (let i = 1; i <= a.tables; i++) {
        const code = `${a.prefix}${i.toString().padStart(2, '0')}`;
        await prisma.diningTable.upsert({
          where: { branchId_code: { branchId: branch.id, code } },
          update: { areaId: area.id, name: a.kind === 'VIP_ROOM' ? `Phòng ${a.prefix} ${i}` : `Bàn ${code}` },
          create: {
            branchId: branch.id,
            areaId: area.id,
            code,
            name: a.kind === 'VIP_ROOM' ? `Phòng ${a.prefix} ${i}` : `Bàn ${code}`,
            minSeats: a.seats[0],
            maxSeats: a.seats[1],
            shape: a.kind === 'VIP_ROOM' ? 'RECT' : 'ROUND',
            posX: 40 + ((i - 1) % cols) * 140,
            posY: 40 + Math.floor((i - 1) / cols) * 140,
            width: a.kind === 'VIP_ROOM' ? 160 : 100,
            height: 100,
            isPrivateRoom: a.kind === 'VIP_ROOM',
            minSpend: a.minSpend ? money(a.minSpend) : null,
            qrToken: qrToken(),
            sortOrder: i,
          },
        });
      }
    }
  }

  // 6. Thực đơn
  const menuIds = new Map<string, string>();
  const menuBranchCodes = new Map<string, Set<string>>();
  for (const m of seed.menus) {
    const code = MENU_ALIAS[m.code] ?? m.code;
    const set = menuBranchCodes.get(code) ?? new Set<string>();
    m.branches.forEach((b) => set.add(b));
    menuBranchCodes.set(code, set);
    if (menuIds.has(code)) continue;
    const name = code === 'BREAKFAST' ? 'Menu Breakfast' : m.name;
    const menu = await prisma.menu.upsert({
      where: { orgId_code: { orgId: org.id, code } },
      update: { name, kind: MENU_KIND[code] ?? 'OTHER', schedule: m.availability ?? {} },
      create: { orgId: org.id, code, name, kind: MENU_KIND[code] ?? 'OTHER', schedule: m.availability ?? {}, sortOrder: menuIds.size },
    });
    menuIds.set(code, menu.id);
  }
  for (const [code, set] of menuBranchCodes) {
    for (const bc of set) {
      await prisma.menuBranch.upsert({
        where: { menuId_branchId: { menuId: menuIds.get(code)!, branchId: branches.get(bc)!.id } },
        update: {},
        create: { menuId: menuIds.get(code)!, branchId: branches.get(bc)!.id },
      });
    }
  }

  let itemCount = 0;
  for (const cat of seed.categories) {
    const menuCode = MENU_ALIAS[cat.menu] ?? cat.menu;
    const menuId = menuIds.get(menuCode)!;
    const category = await prisma.menuCategory.upsert({
      where: { menuId_code: { menuId, code: cat.code } },
      update: { name: cat.name, defaultStationCode: cat.station, sortOrder: cat.sort, schedule: cat.availability ?? {} },
      create: { menuId, code: cat.code, name: cat.name, defaultStationCode: cat.station, sortOrder: cat.sort, schedule: cat.availability ?? {} },
    });
    // Danh mục chỉ bán ở một số cơ sở (Chợ quê chỉ ở Event)
    const categoryOnlyBranches = cat.menu === 'BREAKFAST_EVENT' && !cat.alsoMenus ? ['EVENT'] : cat.menu === 'BREAKFAST_CENTER' && !cat.alsoMenus ? ['CENTER'] : null;

    for (const [ii, it] of cat.items.entries()) {
      const code = `${cat.code}-${codify(it.name, 40)}`;
      const pricingMode = it.variants?.length ? 'VARIANT' : it.pricingMode === 'weight' ? 'WEIGHT' : it.pricingMode === 'market' ? 'MARKET' : 'FIXED';
      const basePrice = pricingMode === 'FIXED' || pricingMode === 'WEIGHT' ? (it.price ?? null) : null;
      const item = await prisma.menuItem.upsert({
        where: { orgId_code: { orgId: org.id, code } },
        update: {
          categoryId: category.id,
          name: it.name,
          unit: it.unit,
          pricingMode,
          basePrice: basePrice !== null ? money(basePrice) : null,
          defaultStationCode: it.station ?? cat.station,
          sortOrder: ii,
        },
        create: {
          orgId: org.id,
          categoryId: category.id,
          code,
          name: it.name,
          nameEn: it.nameEn ?? null,
          description: it.description ?? it.note ?? null,
          unit: it.unit,
          pricingMode,
          basePrice: basePrice !== null ? money(basePrice) : null,
          defaultStationCode: it.station ?? cat.station,
          isVegetarian: it.vegetarian ?? false,
          isSignature: it.signature ?? false,
          countEmpties: it.countEmpties ?? false,
          ownBrand: it.ownBrand ?? false,
          sortOrder: ii,
          tags: it.signature ? ['dac-san'] : [],
        },
      });
      itemCount++;

      for (const [vi, v] of (it.variants ?? []).entries()) {
        const vcode = codify(v.name, 20);
        await prisma.menuItemVariant.upsert({
          where: { itemId_code: { itemId: item.id, code: vcode } },
          update: { name: v.name, price: money(v.price), sortOrder: vi, isDefault: vi === 0 },
          create: { itemId: item.id, code: vcode, name: v.name, price: money(v.price), sortOrder: vi, isDefault: vi === 0 },
        });
      }

      for (const [gi, g] of (it.modifiers ?? []).entries()) {
        const gcode = `${code}-${codify(g.name, 16)}`;
        const group = await prisma.modifierGroup.upsert({
          where: { orgId_code: { orgId: org.id, code: gcode } },
          update: { name: g.name, isRequired: g.required, minSelect: g.required ? 1 : 0, maxSelect: 1, sortOrder: gi },
          create: { orgId: org.id, code: gcode, name: g.name, isRequired: g.required, minSelect: g.required ? 1 : 0, maxSelect: 1, sortOrder: gi },
        });
        for (const [oi, opt] of g.options.entries()) {
          const ocode = codify(opt, 24);
          await prisma.modifierOption.upsert({
            where: { groupId_code: { groupId: group.id, code: ocode } },
            update: { name: opt, sortOrder: oi, isDefault: oi === 0 },
            create: { groupId: group.id, code: ocode, name: opt, sortOrder: oi, isDefault: oi === 0 },
          });
        }
        await prisma.menuItemModifierGroup.upsert({
          where: { itemId_groupId: { itemId: item.id, groupId: group.id } },
          update: { sortOrder: gi },
          create: { itemId: item.id, groupId: group.id, sortOrder: gi },
        });
      }

      // Ẩn món theo cơ sở với menu ăn sáng gộp
      const onlyBranches = it.menus?.map((m) => (m === 'BREAKFAST_EVENT' ? 'EVENT' : m === 'BREAKFAST_CENTER' ? 'CENTER' : m)) ?? categoryOnlyBranches;
      if (onlyBranches) {
        for (const bc of menuBranchCodes.get(menuCode) ?? []) {
          if (onlyBranches.includes(bc)) continue;
          await prisma.branchItemOverride.upsert({
            where: { branchId_itemId: { branchId: branches.get(bc)!.id, itemId: item.id } },
            update: { isAvailable: false },
            create: { branchId: branches.get(bc)!.id, itemId: item.id, isAvailable: false },
          });
        }
      }
    }
  }

  // 7. Hạng thành viên
  const tiers = [
    { code: 'MEMBER', name: 'Thành viên', minSpend12m: 0, earnMultiplierBps: 10_000 },
    { code: 'SILVER', name: 'Bạc', minSpend12m: 10_000_000, earnMultiplierBps: 12_000 },
    { code: 'GOLD', name: 'Vàng', minSpend12m: 30_000_000, earnMultiplierBps: 15_000 },
    { code: 'DIAMOND', name: 'Kim cương', minSpend12m: 100_000_000, earnMultiplierBps: 20_000 },
  ];
  for (const [i, t] of tiers.entries()) {
    await prisma.loyaltyTier.upsert({
      where: { orgId_code: { orgId: org.id, code: t.code } },
      update: { name: t.name, minSpend12m: money(t.minSpend12m), earnMultiplierBps: t.earnMultiplierBps, sortOrder: i },
      create: { orgId: org.id, code: t.code, name: t.name, minSpend12m: money(t.minSpend12m), earnMultiplierBps: t.earnMultiplierBps, sortOrder: i },
    });
  }

  // 8. Sảnh tiệc và danh mục dịch vụ
  const halls = [
    { branch: 'EVENT', code: 'HOI-AN', name: 'Sảnh Hội An', capacityByLayout: { round10: 110, round6: 150, theater: 900, standing: 1100 } },
    { branch: 'EVENT', code: 'LAM-SON', name: 'Sảnh Lam Sơn', capacityByLayout: { round10: 50, round6: 70, theater: 400, standing: 500 } },
    { branch: 'CENTER', code: 'TIEC-T4', name: 'Sảnh tiệc tầng 4', capacityByLayout: { round10: 40, round6: 55, theater: 300 } },
    { branch: 'STAR', code: 'TIEC-STAR', name: 'Sảnh tiệc Dạ Lan Star', capacityByLayout: { round10: 30, round6: 40, theater: 200 } },
  ];
  for (const h of halls) {
    await prisma.hall.upsert({
      where: { branchId_code: { branchId: branches.get(h.branch)!.id, code: h.code } },
      update: { name: h.name, capacityByLayout: h.capacityByLayout },
      create: { branchId: branches.get(h.branch)!.id, code: h.code, name: h.name, capacityByLayout: h.capacityByLayout },
    });
  }
  const services = [
    { code: 'MC', name: 'MC dẫn chương trình', category: 'Nhân sự', unit: 'chương trình', price: 3_000_000 },
    { code: 'CA-SI', name: 'Ca sĩ', category: 'Nhân sự', unit: 'tiết mục', price: 2_000_000 },
    { code: 'BAN-NHAC', name: 'Ban nhạc', category: 'Nhân sự', unit: 'chương trình', price: 8_000_000 },
    { code: 'TRANG-TRI-CB', name: 'Trang trí sân khấu cơ bản', category: 'Trang trí', unit: 'gói', price: 10_000_000 },
    { code: 'CONG-HOA', name: 'Cổng hoa tươi', category: 'Trang trí', unit: 'cổng', price: 5_000_000 },
    { code: 'BANH-CUOI', name: 'Bánh cưới 3 tầng', category: 'Trang trí', unit: 'bánh', price: 2_500_000 },
    { code: 'THAP-LY', name: 'Tháp ly rượu vang', category: 'Trang trí', unit: 'tháp', price: 1_500_000 },
    { code: 'PHAO-KIM-TUYEN', name: 'Pháo kim tuyến', category: 'Hiệu ứng', unit: 'bộ', price: 1_200_000 },
    { code: 'MAN-LED', name: 'Màn hình LED', category: 'Kỹ thuật', unit: 'gói', price: 12_000_000 },
    { code: 'AM-THANH', name: 'Âm thanh ánh sáng', category: 'Kỹ thuật', unit: 'gói', price: 6_000_000 },
    { code: 'PHUC-VU-THEM', name: 'Nhân viên phục vụ thêm', category: 'Nhân sự', unit: 'người', price: 400_000 },
    { code: 'CHUP-ANH', name: 'Chụp ảnh, quay phim', category: 'Nhân sự', unit: 'gói', price: 7_000_000 },
    { code: 'PHI-KHUI', name: 'Phí phục vụ đồ uống khách mang vào', category: 'Đồ uống', unit: 'bàn', price: 100_000 },
  ];
  for (const s of services) {
    await prisma.eventServiceCatalog.upsert({
      where: { orgId_code: { orgId: org.id, code: s.code } },
      update: { name: s.name, category: s.category, unit: s.unit, price: money(s.price) },
      create: { orgId: org.id, code: s.code, name: s.name, category: s.category, unit: s.unit, price: money(s.price) },
    });
  }

  // 9. Kho, nguyên liệu, định lượng mẫu (Nem Dạ Lan)
  await prisma.warehouse.upsert({ where: { code: 'CENTRAL' }, update: {}, create: { code: 'CENTRAL', name: 'Kho trung tâm', kind: 'CENTRAL' } });
  const warehouses = new Map<string, string>();
  for (const [bc, branch] of branches) {
    for (const w of [
      { code: `${bc}-MAIN`, name: `Kho chính ${bc}`, kind: 'MAIN' as const },
      { code: `${bc}-BAR`, name: `Kho bar ${bc}`, kind: 'BAR' as const },
    ]) {
      const wh = await prisma.warehouse.upsert({ where: { code: w.code }, update: { name: w.name }, create: { branchId: branch.id, code: w.code, name: w.name, kind: w.kind } });
      warehouses.set(w.code, wh.id);
    }
  }
  const stockItems = [
    { code: 'THIT-LON-XAY', name: 'Thịt lợn xay', category: 'Thịt', baseUnit: 'g', purchaseUnit: 'kg', factor: 1000, cost: 120 },
    { code: 'MIEN-DONG', name: 'Miến dong', category: 'Khô', baseUnit: 'g', purchaseUnit: 'kg', factor: 1000, cost: 60 },
    { code: 'BANH-DA-NEM', name: 'Bánh đa nem', category: 'Khô', baseUnit: 'cái', purchaseUnit: 'tập 100', factor: 100, cost: 300 },
    { code: 'BIA-TIGER', name: 'Bia Tiger lon', category: 'Đồ uống', baseUnit: 'lon', purchaseUnit: 'thùng 24', factor: 24, cost: 16_000 },
    { code: 'NUOC-DA-LAN', name: 'Nước tinh khiết Dạ Lan', category: 'Đồ uống', baseUnit: 'chai', purchaseUnit: 'thùng 24', factor: 24, cost: 4_000 },
    { code: 'GA-RI', name: 'Gà ri nguyên con', category: 'Thịt', baseUnit: 'g', purchaseUnit: 'kg', factor: 1000, cost: 130 },
  ];
  const stockIds = new Map<string, string>();
  for (const s of stockItems) {
    const si = await prisma.stockItem.upsert({
      where: { orgId_code: { orgId: org.id, code: s.code } },
      update: { name: s.name, costPerBaseUnit: s.cost },
      create: { orgId: org.id, code: s.code, name: s.name, category: s.category, baseUnit: s.baseUnit, purchaseUnit: s.purchaseUnit, purchaseUnitFactor: s.factor, costPerBaseUnit: s.cost, minStock: 0 },
    });
    stockIds.set(s.code, si.id);
  }
  const nem = await prisma.menuItem.findUnique({ where: { orgId_code: { orgId: org.id, code: 'KHAI_VI-NEM-DA-LAN' } } });
  if (nem) {
    const existing = await prisma.recipe.findFirst({ where: { itemId: nem.id, variantId: null, modifierOptionId: null } });
    const recipe = existing ?? (await prisma.recipe.create({ data: { itemId: nem.id, yieldQty: 1 } }));
    await prisma.recipeLine.deleteMany({ where: { recipeId: recipe.id } });
    await prisma.recipeLine.createMany({
      data: [
        { recipeId: recipe.id, stockItemId: stockIds.get('THIT-LON-XAY')!, quantity: 35, wastageBps: 500 },
        { recipeId: recipe.id, stockItemId: stockIds.get('MIEN-DONG')!, quantity: 10, wastageBps: 0 },
        { recipeId: recipe.id, stockItemId: stockIds.get('BANH-DA-NEM')!, quantity: 1, wastageBps: 0 },
      ],
    });
  }

  // 10. Khách hàng mẫu
  const customers = [
    { phone: '+84912000001', fullName: 'Nguyễn Văn An', tier: 'GOLD', tags: ['VIP'] },
    { phone: '+84912000002', fullName: 'Trần Thị Bình', tier: 'MEMBER', tags: [] },
    { phone: '+84912000003', fullName: 'Công ty Du lịch Xứ Thanh', tier: 'SILVER', tags: ['lu-hanh', 'doanh-nghiep'], companyName: 'Công ty TNHH Du lịch Xứ Thanh', taxCode: '2800123456' },
  ];
  const tierRows = await prisma.loyaltyTier.findMany({ where: { orgId: org.id } });
  for (const c of customers) {
    await prisma.customer.upsert({
      where: { orgId_phone: { orgId: org.id, phone: c.phone } },
      update: { fullName: c.fullName },
      create: {
        orgId: org.id,
        phone: c.phone,
        fullName: c.fullName,
        tags: c.tags,
        tierId: tierRows.find((t) => t.code === c.tier)?.id ?? null,
        companyName: c.companyName ?? null,
        taxCode: c.taxCode ?? null,
        marketingConsent: true,
        consentAt: new Date(),
        source: 'seed',
      },
    });
  }

  console.log(`Seed xong: ${branches.size} cơ sở, ${roles.size} vai trò, ${staffDefs.length} nhân sự, ${menuIds.size} thực đơn, ${seed.categories.length} danh mục, ${itemCount} món.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
