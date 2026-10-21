#!/usr/bin/env node
/**
 * Kiểm chứng mô-đun tiệc, kho, báo cáo, tải tệp trên API đang chạy (dữ liệu seed Dạ Lan).
 * Dùng: node scripts/smoke-events-inventory.mjs [http://localhost:4300]
 */
const BASE = process.argv[2] ?? process.env.API_URL ?? 'http://localhost:4300';
const API = `${BASE}/api/v1`;
let token = '';
let failures = 0;

async function call(method, path, body, extraHeaders = {}) {
  const res = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}), ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // Giữ nguyên BOM (res.text() tự bỏ BOM nên không kiểm tra được CSV cho Excel)
  const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(await res.arrayBuffer());
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json, text, headers: res.headers };
}
function check(label, ok, detail) {
  if (ok) console.log(`  ✔ ${label}`);
  else {
    failures++;
    console.log(`  ✘ ${label}${detail !== undefined ? ` → ${typeof detail === 'string' ? detail.slice(0, 400) : JSON.stringify(detail).slice(0, 400)}` : ''}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (n) => Number(n).toLocaleString('vi-VN');

console.log(`Smoke tiệc/kho/báo cáo tại ${BASE}`);
const login = await call('POST', '/auth/staff/login', { login: 'ADMIN', password: 'Dalan@2026' });
check('đăng nhập ADMIN', login.status === 200, login.json);
token = login.json?.accessToken ?? '';
const branches = (await call('GET', '/branches')).json;
const eventBranch = branches.find((b) => b.code === 'EVENT');
const center = branches.find((b) => b.code === 'CENTER');

// ───────────── TIỆC ─────────────
console.log('\n[Tiệc]');
const halls = await call('GET', `/branches/${eventBranch.id}/halls`);
check('sảnh Event có Hội An và Lam Sơn', halls.status === 200 && halls.json.some((h) => h.code === 'HOI-AN'), halls.json);
const hoiAn = halls.json.find((h) => h.code === 'HOI-AN');
const catalog = await call('GET', '/event-services-catalog');
const mc = catalog.json.find((c) => c.code === 'MC');
check('danh mục dịch vụ có MC 3.000.000', mc && Number(mc.price) === 3_000_000, catalog.json?.length);

const menuView = await call('GET', `/branches/${eventBranch.id}/menu`);
const items = menuView.json.menus.flatMap((m) => m.categories.flatMap((c) => c.items));
const menuItems = items.filter((i) => i.pricingMode === 'FIXED' && i.price).slice(0, 5);
const eventDate = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
const created = await call('POST', `/branches/${eventBranch.id}/events`, {
  kind: 'WEDDING',
  contactName: 'Lê Văn Cưới',
  contactPhone: '0912 345 678',
  companyName: undefined,
  taxCode: '2800999999',
  eventDate,
  startTime: '18:00',
  endTime: '21:00',
  halls: [{ hallId: hoiAn.id, layout: 'round10' }],
  holdHalls: true,
  expectedTables: 80,
  guestsPerTable: 10,
  beveragePolicy: 'ACTUAL',
  notes: 'Tiệc cưới 80 mâm',
});
check('tạo lead tiệc cưới (LEAD, giữ chỗ 48h)', created.status === 201 && created.json?.status === 'LEAD' && !!created.json.holdExpiresAt, created.json);
const ev = created.json;
check('khách hàng được tạo theo số điện thoại', !!ev.customer?.id && ev.customer.phone === '+84912345678', ev.customer);

const conflict = await call('POST', `/branches/${eventBranch.id}/events`, { kind: 'CONFERENCE', contactName: 'Trùng', contactPhone: '0912000000', eventDate, startTime: '20:00', endTime: '23:00', halls: [{ hallId: hoiAn.id }], expectedTables: 20 });
check('trùng sảnh cùng ngày bị chặn 409 (kể cả giờ dọn)', conflict.status === 409 && conflict.json?.code === 'HALL_CONFLICT', conflict.json);
const noConflict = await call('POST', `/branches/${eventBranch.id}/events`, { kind: 'CONFERENCE', contactName: 'Sáng', contactPhone: '0912000001', eventDate, startTime: '08:00', endTime: '11:00', halls: [{ hallId: hoiAn.id }], expectedTables: 20 });
check('cùng sảnh khác khung giờ (08:00-11:00) được phép', noConflict.status === 201, noConflict.json);
if (noConflict.json?.id) await call('POST', `/events/${noConflict.json.id}/cancel`, { reason: 'smoke' });

const menus = await call('PUT', `/events/${ev.id}/menus`, {
  menus: [{ name: 'Set tiệc cưới A', pricePerTable: 3_500_000, tables: 80, lines: [...menuItems.map((i) => ({ itemId: i.id, quantityPerTable: 1 })), { name: 'Xôi gấc', quantityPerTable: 0.5, unit: 'đĩa' }] }],
});
check('thực đơn tiệc 80 mâm × 3.500.000 → subtotalMenu 280.000.000', menus.status === 200 && menus.json?.totals?.subtotalMenu === 280_000_000, menus.json?.totals);
const services = await call('PUT', `/events/${ev.id}/services`, { services: [{ catalogId: mc.id, quantity: 1 }, { name: 'Trang trí sân khấu cao cấp', unitPrice: 22_000_000, quantity: 1 }] });
check('dịch vụ 25.000.000 (MC từ danh mục + tự do)', services.status === 200 && services.json?.totals?.subtotalServices === 25_000_000, services.json?.totals);

const quote = await call('POST', `/events/${ev.id}/quotes`, { terms: 'Cọc 30% khi ký' });
check('báo giá v1: tổng 305.000.000, trạng thái QUOTED', quote.status === 201 && quote.json?.event?.status === 'QUOTED' && quote.json.event.totals.total === 305_000_000, quote.json?.event?.totals);

const contract = await call('POST', `/events/${ev.id}/contract`, {
  depositSteps: [
    { label: 'Cọc đợt 1 khi ký', percentBps: 3000, dueDate: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10) },
    { label: 'Cọc đợt 2 trước 7 ngày', percentBps: 4000, dueDate: new Date(Date.now() + 53 * 86_400_000).toISOString().slice(0, 10) },
  ],
});
const depositAmounts = contract.json?.deposits?.map((d) => Number(d.amount));
check('hợp đồng: lịch cọc 91.500.000 / 122.000.000 / 91.500.000, CONTRACTED, hết giữ chỗ tạm', contract.status === 201 && contract.json?.status === 'CONTRACTED' && JSON.stringify(depositAmounts) === JSON.stringify([91_500_000, 122_000_000, 91_500_000]) && contract.json.holdExpiresAt === null, { status: contract.json?.status, depositAmounts });

const qr = await call('GET', `/events/${ev.id}/deposit-qr`);
check('VietQR cọc đợt 1 = 91.500.000, nội dung DLT <mã>', qr.status === 200 && qr.json?.amount === 91_500_000 && qr.json.payload.includes('540891500000') && qr.json.purpose.startsWith('DLT ') && qr.json.qrDataUrl?.startsWith('data:image/png'), { amount: qr.json?.amount, purpose: qr.json?.purpose });

const pay1 = await call('POST', `/events/${ev.id}/payments`, { kind: 'DEPOSIT', method: 'BANK_TRANSFER', amount: 91_500_000, externalRef: 'FT26110100001' });
check('thu cọc đợt 1 → đợt 1 PAID, paidTotal 91.500.000', pay1.status === 201 && pay1.json?.deposits?.[0]?.status === 'PAID' && pay1.json.totals.paid === 91_500_000, pay1.json?.deposits);

const confirm = await call('POST', `/events/${ev.id}/confirm`, { confirmedTables: 80, reserveTables: 4 });
check('chốt 80 mâm + 4 dự phòng → CONFIRMED', confirm.status === 201 && confirm.json?.status === 'CONFIRMED' && confirm.json.confirmedTables === 80, confirm.json?.status);

const beo = await call('POST', `/events/${ev.id}/beo`, { timeline: [{ time: '17:30', activity: 'Đón khách', owner: 'Lễ tân' }, { time: '18:30', activity: 'Khai tiệc', owner: 'MC' }], staffing: [{ role: 'Phục vụ', count: 24 }], specialNotes: 'Bàn gia đình hai bên không ăn hành' });
const kq = beo.json?.beo?.content?.kitchenQuantities;
check('BEO v1 phát hành, định lượng bếp 84 mâm (80+4), xôi gấc 42 đĩa', beo.status === 201 && beo.json?.event?.status === 'BEO_ISSUED' && kq?.[0]?.quantity === 84 && kq?.find((x) => x.name.startsWith('Xôi gấc'))?.quantity === 42, kq?.slice(0, 2));

const start = await call('POST', `/events/${ev.id}/start`);
check('ngày tiệc → IN_PROGRESS', start.status === 200 && start.json?.status === 'IN_PROGRESS', start.json?.status);
await call('POST', `/events/${ev.id}/adjustments`, { kind: 'EXTRA_TABLE', description: 'Mâm phát sinh', quantity: 4, unitPrice: 3_500_000 });
const adj = await call('POST', `/events/${ev.id}/adjustments`, { kind: 'BEVERAGE', description: 'Bia Tiger thực dùng', quantity: 30, unitPrice: 25_000 });
check('phát sinh 4 mâm + 30 bia → tổng 319.750.000', adj.status === 201 && adj.json?.totals?.total === 319_750_000, adj.json?.totals);

const settle = await call('POST', `/events/${ev.id}/settle`);
check('quyết toán → SETTLED, còn thu 228.250.000, tạo HĐĐT nháp vì có MST', settle.status === 200 && settle.json?.status === 'SETTLED' && settle.json.totals.due === 228_250_000 && settle.json.eInvoices?.[0]?.status === 'DRAFT', { status: settle.json?.status, due: settle.json?.totals?.due, inv: settle.json?.eInvoices });
const closeEarly = await call('POST', `/events/${ev.id}/close`);
check('đóng khi còn nợ bị chặn 409', closeEarly.status === 409, closeEarly.json);
await call('POST', `/events/${ev.id}/payments`, { kind: 'BALANCE', method: 'CASH', amount: 228_250_000 });
const closed = await call('POST', `/events/${ev.id}/close`);
check('thu đủ rồi đóng → CLOSED', closed.status === 200 && closed.json?.status === 'CLOSED' && closed.json.totals.due === 0, closed.json?.status);
const wrong = await call('POST', `/events/${ev.id}/start`);
check('chuyển trạng thái sai bị chặn (CLOSED → IN_PROGRESS)', wrong.status === 409, wrong.json);

const cal = await call('GET', `/branches/${eventBranch.id}/halls/calendar?from=${eventDate}&to=${eventDate}`);
check('lịch sảnh có tiệc vừa tạo', cal.status === 200 && cal.json.find((h) => h.hall.code === 'HOI-AN')?.bookings.some((b) => b.id === ev.id), cal.json?.map((h) => h.bookings.length));
const summary = await call('GET', `/branches/${eventBranch.id}/events/summary`);
check('báo cáo tiệc: có CLOSED và doanh thu theo loại', summary.status === 200 && summary.json?.byStatus?.CLOSED >= 1 && summary.json.revenueLast30DaysByKind.length >= 0, summary.json);
const saved = token;
token = '';
const inquiry = await call('POST', '/public/event-inquiries', { branchCode: 'EVENT', kind: 'CONFERENCE', contactName: 'Nguyễn Hội Nghị', contactPhone: '0988 111 222', eventDate, expectedGuests: 300, notes: 'Hội nghị khách hàng' });
check('form công khai tạo LEAD', inquiry.status === 201 && inquiry.json?.status === 'LEAD', inquiry.json);
token = saved;
const lead = await call('GET', `/events/${inquiry.json.id}`);
check('lead công khai: 30 mâm từ 300 khách, nguồn WEB', lead.json?.expectedTables === 30 && lead.json?.source === 'WEB', { tables: lead.json?.expectedTables, source: lead.json?.source });

// ───────────── KHO ─────────────
console.log('\n[Kho]');
const warehouses = await call('GET', `/warehouses?branchId=${center.id}`);
const main = warehouses.json.find((w) => w.code === 'CENTER-MAIN');
check('kho CENTER-MAIN tồn tại', !!main, warehouses.json?.map((w) => w.code));
const stock = await call('GET', '/stock-items');
const thit = stock.json.find((s) => s.code === 'THIT-LON-XAY');
const mien = stock.json.find((s) => s.code === 'MIEN-DONG');
const banhDa = stock.json.find((s) => s.code === 'BANH-DA-NEM');
check('nguyên liệu seed: thịt, miến, bánh đa', !!thit && !!mien && !!banhDa, stock.json?.length);

const supplier = await call('POST', '/suppliers', { code: `NCC-${Date.now() % 100000}`, name: 'Thực phẩm Sạch Thanh Hóa', phone: '0237000000' });
check('tạo nhà cung cấp', supplier.status === 201, supplier.json);
const po = await call('POST', '/purchase-orders', { branchId: center.id, warehouseId: main.id, supplierId: supplier.json.id, lines: [{ stockItemId: thit.id, quantity: 10, unit: 'kg', unitPrice: 120_000 }, { stockItemId: mien.id, quantity: 2, unit: 'kg', unitPrice: 60_000 }, { stockItemId: banhDa.id, quantity: 5, unit: 'tập 100', unitPrice: 30_000 }] });
check('đơn đặt hàng tổng 1.470.000', po.status === 201 && Number(po.json?.total) === 1_470_000, po.json?.total);
await call('POST', `/purchase-orders/${po.json.id}/send`);
const before = (await call('GET', `/warehouses/${main.id}/levels`)).json;
const thitBefore = before.find((l) => l.stockItemId === thit.id)?.quantity ?? 0;
const gr = await call('POST', '/goods-receipts', { branchId: center.id, warehouseId: main.id, poId: po.json.id, supplierId: supplier.json.id, invoiceNo: 'HD001', lines: [{ stockItemId: thit.id, quantity: 10, unit: 'kg', unitPrice: 120_000 }, { stockItemId: mien.id, quantity: 2, unit: 'kg', unitPrice: 60_000 }, { stockItemId: banhDa.id, quantity: 5, unit: 'tập 100', unitPrice: 30_000 }] });
check('nhập kho theo đơn', gr.status === 201, gr.json);
const poAfter = await call('GET', `/purchase-orders/${po.json.id}`);
check('đơn đặt hàng chuyển RECEIVED', poAfter.json?.status === 'RECEIVED', poAfter.json?.status);
const after = (await call('GET', `/warehouses/${main.id}/levels`)).json;
const thitLevel = after.find((l) => l.stockItemId === thit.id);
check('tồn thịt tăng 10.000 g, giá vốn 120 đ/g', thitLevel && Math.abs(thitLevel.quantity - thitBefore - 10_000) < 0.001 && Math.abs(thitLevel.costPerBaseUnit - 120) < 0.01, thitLevel);

// Định lượng Nem Dạ Lan: 35 g thịt, 10 g miến, 1 bánh đa, không hao hụt (ví dụ K3)
const nemItem = items.find((i) => i.code === 'KHAI_VI-NEM-DA-LAN');
check('có món Nem Dạ Lan', !!nemItem, items.length);
const recipe = await call('PUT', `/menu-items/${nemItem.id}/recipe`, { yieldQty: 1, lines: [{ stockItemId: thit.id, quantity: 35, wastageBps: 0 }, { stockItemId: mien.id, quantity: 10, wastageBps: 0 }, { stockItemId: banhDa.id, quantity: 1, wastageBps: 0 }] });
// Giá vốn bình quân phụ thuộc lịch sử nhập kho, nên tính kỳ vọng từ giá vốn hiện hành
const costs = (await call('GET', '/stock-items')).json;
const costOf = (id) => Number(costs.find((s) => s.id === id)?.costPerBaseUnit ?? 0);
const expectedCost = Math.round(35 * costOf(thit.id) + 10 * costOf(mien.id) + 1 * costOf(banhDa.id));
check(`cập nhật định lượng nem, giá vốn ước tính = ${expectedCost.toLocaleString('vi-VN')} (lần đầu: 35×120+10×60+1×300 = 5.100)`, recipe.status === 200 && Math.abs(Number(recipe.json?.estimatedCost) - expectedCost) <= 1, { got: recipe.json?.estimatedCost, expectedCost });

const floor = await call('GET', `/branches/${center.id}/floor`);
const freeTable = floor.json.areas.flatMap((a) => a.tables).find((t) => t.status === 'EMPTY' && !t.isPrivateRoom);
const session = await call('POST', `/branches/${center.id}/sessions`, { tableIds: [freeTable.id], guestCount: 4 });
const order = await call('POST', `/sessions/${session.json.id}/orders`, { lines: [{ itemId: nemItem.id, quantity: 10 }], send: true });
check('gọi 10 nem gửi bếp', order.status === 201 && order.json?.status === 'SENT', order.json);
let movements = [];
for (let i = 0; i < 40; i++) {
  await sleep(400);
  movements = (await call('GET', `/warehouses/${main.id}/movements?kind=SALE&stockItemId=${thit.id}`)).json ?? [];
  if (movements.some((m) => m.refId === order.json.lines[0].id)) break;
}
// Nếu relay của tiến trình khác xử lý sự kiện, phát lại (idempotent) để chắc chắn trừ kho đúng một lần
const replay = await call('POST', `/inventory/replay-order/${order.json.id}`);
check('phát lại trừ kho an toàn (idempotent)', replay.status === 200, replay.json);
movements = (await call('GET', `/warehouses/${main.id}/movements?kind=SALE&stockItemId=${thit.id}`)).json ?? [];
const saleMoves = movements.filter((m) => m.refId === order.json.lines[0].id);
const saleMove = saleMoves[0];
check('trừ kho: thịt −350 g theo định lượng, đúng một lần (ví dụ K3)', saleMoves.length === 1 && Math.abs(Number(saleMove.quantity) + 350) < 0.001, saleMoves);
const levelAfterSale = (await call('GET', `/warehouses/${main.id}/levels`)).json.find((l) => l.stockItemId === thit.id);
check('tồn thịt giảm đúng 350 g', Math.abs(thitLevel.quantity - 350 - levelAfterSale.quantity) < 0.001, { before: thitLevel.quantity, after: levelAfterSale.quantity });

const voidLine = await call('POST', `/sessions/${session.json.id}/lines/${order.json.lines[0].id}/void`, { reason: 'GUEST_CHANGED_MIND', waste: false });
check('hủy món chưa nấu', voidLine.status === 201 || voidLine.status === 200, voidLine.json);
let returned = [];
for (let i = 0; i < 40; i++) {
  await sleep(400);
  const rows = (await call('GET', `/warehouses/${main.id}/movements?kind=VOID_RETURN&stockItemId=${thit.id}`)).json ?? [];
  returned = rows.filter((m) => m.refId === order.json.lines[0].id);
  if (returned.length) break;
}
await call('POST', `/inventory/replay-order/${order.json.id}`);
returned = ((await call('GET', `/warehouses/${main.id}/movements?kind=VOID_RETURN&stockItemId=${thit.id}`)).json ?? []).filter((m) => m.refId === order.json.lines[0].id);
check('hoàn kho +350 g khi hủy không hao phí, đúng một lần', returned.length === 1 && Math.abs(Number(returned[0].quantity) - 350) < 0.001, returned);
await call('POST', `/sessions/${session.json.id}/cancel`, { reason: 'smoke' });

// Bán thật để có doanh thu và giá vốn: gọi 10 nem khác, bếp xong, trả tiền mặt
const session2 = await call('POST', `/branches/${center.id}/sessions`, { tableIds: [freeTable.id], guestCount: 3 });
const order2 = await call('POST', `/sessions/${session2.json.id}/orders`, { lines: [{ itemId: nemItem.id, quantity: 10 }], send: true });
const tickets = await call('GET', `/branches/${center.id}/kitchen/tickets`);
for (const t of tickets.json) await call('POST', `/kitchen/tickets/${t.id}/bump`);
const bill = await call('POST', `/sessions/${session2.json.id}/bills`, { mode: 'ALL' });
const paid = await call('POST', `/bills/${bill.json[0].id}/payments`, { method: 'CASH', tenderedAmount: Number(bill.json[0].total) });
check('bill 10 nem = 250.000 trả tiền mặt', paid.status === 201 && paid.json?.bill?.status === 'PAID' && Number(bill.json[0].total) === 250_000, { status: paid.json?.bill?.status, total: bill.json?.[0]?.total, o: order2.status });
// Trừ kho chạy bất đồng bộ qua relay outbox; phát lại (idempotent) để báo cáo giá vốn không phụ thuộc thời điểm
await call('POST', `/inventory/replay-order/${order2.json.id}`);

// Kiểm kê: đếm thịt thiếu 100 g
const stocktake = await call('POST', '/stocktakes', { warehouseId: main.id, stockItemIds: [thit.id, mien.id] });
check('tạo phiếu kiểm kê từ tồn lý thuyết', stocktake.status === 201 && stocktake.json?.lines?.length === 2, stocktake.json);
const expected = Number(stocktake.json.lines.find((l) => l.stockItemId === thit.id).expectedQty);
const counted = await call('POST', `/stocktakes/${stocktake.json.id}/count`, { lines: [{ stockItemId: thit.id, countedQty: expected - 100 }] });
check('nhập đếm: chênh −100 g, giá trị −12.000', counted.status === 200 && Number(counted.json?.lines?.find((l) => l.stockItemId === thit.id)?.varianceQty) === -100 && Number(counted.json.lines.find((l) => l.stockItemId === thit.id).varianceValue) === -12_000, counted.json?.lines?.[0]);
const approved = await call('POST', `/stocktakes/${stocktake.json.id}/approve`);
const levelAfterSt = (await call('GET', `/warehouses/${main.id}/levels`)).json.find((l) => l.stockItemId === thit.id);
check('duyệt kiểm kê → tồn giảm 100 g', approved.status === 200 && approved.json?.status === 'APPROVED' && Math.abs(levelAfterSt.quantity - (expected - 100)) < 0.001, { status: approved.json?.status, level: levelAfterSt?.quantity, expected });

await call('PATCH', `/stock-items/${mien.id}`, { minStock: 1_000_000 });
const alerts = await call('GET', `/branches/${center.id}/inventory/alerts`);
check('cảnh báo tồn dưới mức tối thiểu có miến', alerts.status === 200 && alerts.json.some((a) => a.stockItemId === mien.id), alerts.json);
await call('PATCH', `/stock-items/${mien.id}`, { minStock: null });

const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const cogs = await call('GET', `/branches/${center.id}/inventory/cogs?from=${today}&to=${today}`);
const nemCogs = cogs.json?.byItem?.find((x) => x.name === 'Nem Dạ Lan');
check('báo cáo giá vốn: Nem Dạ Lan có COGS và biên lợi nhuận', cogs.status === 200 && nemCogs && nemCogs.cogs > 0 && nemCogs.marginBps !== null, cogs.json);

const transfer = await call('POST', '/stock-transfers', { fromWarehouseId: main.id, toWarehouseId: warehouses.json.find((w) => w.code === 'CENTER-BAR').id, lines: [{ stockItemId: mien.id, quantitySent: 500 }] });
const sent = await call('POST', `/stock-transfers/${transfer.json.id}/send`);
const received = await call('POST', `/stock-transfers/${transfer.json.id}/receive`, { lines: [{ stockItemId: mien.id, quantityReceived: 500 }] });
check('chuyển kho hai bước MAIN → BAR', sent.status === 200 && received.status === 200 && received.json?.status === 'RECEIVED', { s: sent.json, r: received.json });

// ───────────── BÁO CÁO ─────────────
console.log('\n[Báo cáo]');
await sleep(1000);
const businessToday = (await call('GET', `/reports/realtime?branchId=${center.id}`)).json?.businessDate ?? today;
const rebuild = await call('POST', `/reports/rebuild?branchId=${center.id}&date=${businessToday}`);
check('dựng lại tổng hợp ngày từ bill đã trả', rebuild.status === 200 && rebuild.json?.bills >= 1, rebuild.json);
const realtime = await call('GET', `/reports/realtime?branchId=${center.id}`);
check('realtime: doanh thu hôm nay > 0, có bill', realtime.status === 200 && realtime.json?.todayRevenue > 0 && realtime.json.todayBills > 0, realtime.json);
const sales = await call('GET', `/reports/sales?branchId=${center.id}&from=${today}&to=${today}&groupBy=category`);
check('sales theo danh mục có Khai vị', sales.status === 200 && sales.json.rows.some((r) => r.label === 'Khai vị') && sales.json.total.revenue > 0, sales.json?.rows?.slice(0, 3));
const byMethod = await call('GET', `/reports/sales?branchId=${center.id}&from=${today}&to=${today}&groupBy=method`);
check('sales theo phương thức có CASH', byMethod.json?.rows?.some((r) => r.key === 'CASH'), byMethod.json?.rows);
const allBranches = await call('GET', `/reports/sales?from=${today}&to=${today}&groupBy=branch`);
check('ADMIN xem toàn công ty theo cơ sở', allBranches.status === 200 && allBranches.json.rows.length >= 1, allBranches.json);
const kitchen = await call('GET', `/reports/kitchen?branchId=${center.id}&from=${today}&to=${today}`);
check('báo cáo bếp có trạm và thời gian', kitchen.status === 200 && kitchen.json.stations.length >= 1, kitchen.json);
const dv = await call('GET', `/reports/discounts-voids?branchId=${center.id}&from=${today}&to=${today}`);
check('báo cáo hủy món có dòng vừa hủy', dv.status === 200 && dv.json.voids.count >= 1, dv.json?.voids);
const shifts = await call('GET', `/reports/shifts?branchId=${center.id}&from=${today}&to=${today}`);
check('báo cáo ca trả mảng', shifts.status === 200 && Array.isArray(shifts.json), shifts.status);
const csv = await call('GET', `/reports/export.csv?report=sales&branchId=${center.id}&from=${today}&to=${today}&groupBy=day`);
check('xuất CSV có BOM UTF-8 và tiêu đề tiếng Việt', csv.status === 200 && csv.text.startsWith('﻿') && csv.text.includes('Doanh thu') && (csv.headers.get('content-type') ?? '').includes('text/csv'), csv.text?.slice(0, 80));

// Quyền: thu ngân không có report.* → 403
const cashierToken = await (async () => {
  const device = await call('POST', '/auth/devices', { branchId: center.id, name: 'smoke-pos', kind: 'POS' });
  const staffList = await call('GET', '/auth/staff/device', undefined, { 'x-device-token': device.json.deviceToken });
  const cashier = staffList.json.staff.find((s) => s.role.code === 'CASHIER');
  const pin = await call('POST', '/auth/staff/pin', { staffId: cashier.id, pin: '3333' }, { 'x-device-token': device.json.deviceToken });
  await call('DELETE', `/auth/devices/${device.json.device.id}`);
  return pin.json?.accessToken;
})();
const prev = token;
token = cashierToken ?? '';
const forbidden = await call('GET', `/reports/sales?branchId=${center.id}&from=${today}&to=${today}`);
check('thu ngân không có quyền báo cáo → 403', forbidden.status === 403, forbidden.status);
token = prev;

// ───────────── TẢI TỆP ─────────────
console.log('\n[Tải tệp]');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const form = new FormData();
form.append('file', new Blob([png], { type: 'image/png' }), 'mon.png');
const up = await fetch(`${API}/uploads?folder=menu`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
const upJson = await up.json();
check('tải ảnh PNG lên thư mục menu', up.status === 201 && upJson?.url?.includes('/files/menu/') && upJson.size === png.length, upJson);
if (upJson?.url) {
  const served = await fetch(upJson.url.replace(/^http:\/\/localhost:\d+/, BASE));
  check('tệp được phục vụ tĩnh tại /files/', served.status === 200 && (served.headers.get('content-type') ?? '').includes('image/png'), served.status);
}
const badForm = new FormData();
badForm.append('file', new Blob(['hello'], { type: 'text/plain' }), 'x.txt');
const bad = await fetch(`${API}/uploads`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: badForm });
check('từ chối tệp không phải ảnh/PDF (400)', bad.status === 400, bad.status);

console.log(failures === 0 ? '\nTẤT CẢ KIỂM TRA ĐẠT' : `\n${failures} KIỂM TRA THẤT BẠI`);
process.exit(failures === 0 ? 0 : 1);
