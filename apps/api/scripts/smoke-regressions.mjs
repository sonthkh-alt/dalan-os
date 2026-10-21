#!/usr/bin/env node
/**
 * Kiểm thử hồi quy cho các lỗi đã phát hiện khi tích hợp giao diện (21/10/2026):
 * - API không bao giờ trả mã băm PIN/mật khẩu.
 * - PATCH không ghi đè trường không gửi (Zod 4 .partial() áp default).
 * - Đặt bàn: body không cần branchId; lễ tân đưa vào danh sách chờ; ghi nhận tiền cọc.
 * - Kho: liệt kê phiếu kiểm kê; xem dòng phiếu chuyển kho; thiếu khi nhận ghi hao hụt.
 * - Tiệc: xóa trống trường tùy chọn; QUOTED → LEAD; PATCH không xóa sảnh.
 * - Đăng nhập Zalo (chế độ mock).
 * Dùng: node scripts/smoke-regressions.mjs [http://localhost:4000]
 */
const BASE = process.argv[2] ?? process.env.API_URL ?? 'http://localhost:4000';
const API = `${BASE}/api/v1`;
let token = '';
let failures = 0;

async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json, text };
}
function check(label, ok, detail) {
  if (ok) console.log(`  ✔ ${label}`);
  else {
    failures++;
    console.log(`  ✘ ${label}${detail !== undefined ? ` → ${JSON.stringify(detail).slice(0, 400)}` : ''}`);
  }
}
const vnIso = (daysAhead, hh, mm = 0) => {
  const d = new Date(Date.now() + daysAhead * 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 10);
  return `${d}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+07:00`;
};
const uniq = Date.now().toString().slice(-6);

console.log(`Kiểm thử hồi quy tại ${BASE}`);
token = (await call('POST', '/auth/staff/login', { login: 'ADMIN', password: 'Dalan@2026' })).json.accessToken;
const center = (await call('GET', '/branches')).json.find((b) => b.code === 'CENTER');

// 1. Không lộ mã băm
{
  const staff = (await call('GET', `/staff?branchId=${center.id}`)).json;
  const target = staff.find((s) => s.code === 'PV2-C');
  const patched = await call('PATCH', `/staff/${target.id}`, { fullName: target.fullName });
  check('PATCH nhân viên không trả pinHash/passwordHash', patched.status === 200 && !/pinHash|passwordHash/.test(patched.text), patched.text.slice(0, 200));
  const created = await call('POST', '/staff', { code: `T${uniq}`, fullName: 'Nhân viên thử', roleId: target.role.id, branchIds: [center.id], pin: '8642' });
  check('POST nhân viên không trả mã băm', created.status === 201 && !/pinHash|passwordHash/.test(created.text), created.text.slice(0, 200));
  await call('PATCH', `/staff/${created.json.id}`, { isActive: false });
}

// 2. PATCH không ghi đè trường có mặc định
{
  const areas = (await call('GET', `/branches/${center.id}/areas`)).json;
  const table = areas.flatMap((a) => a.tables).find((t) => t.code === 'A05');
  const before = { posX: table.posX, width: table.width, shape: table.shape };
  const r = await call('PATCH', `/branches/${center.id}/tables/${table.id}`, { name: table.name });
  check('PATCH bàn chỉ đổi tên giữ nguyên vị trí, kích thước, hình dạng', r.status === 200 && r.json.posX === before.posX && r.json.width === before.width && r.json.shape === before.shape, { before, after: { posX: r.json?.posX, width: r.json?.width, shape: r.json?.shape } });
  const items = (await call('GET', '/menu-items?search=GA-RI-LUOC')).json;
  const ga = items.find((i) => i.pricingMode === 'VARIANT');
  const u = await call('PATCH', `/menu-items/${ga.id}`, { description: ga.description });
  check('PATCH món giữ nguyên chế độ giá VARIANT', u.status === 200 && u.json.pricingMode === 'VARIANT', u.json?.pricingMode);
}

// 3. Đặt bàn
{
  const day = 5 + (Math.floor(Date.now() / 60_000) % 50);
  const r = await call('POST', `/branches/${center.id}/reservations`, { customerName: 'Khách không gửi branchId', customerPhone: `09${uniq.padStart(8, '7')}`, partySize: 4, reservedAt: vnIso(day, 12) });
  check('lễ tân tạo đặt bàn không cần branchId trong body', r.status === 201, r.json);
  const areas = (await call('GET', `/branches/${center.id}/areas`)).json;
  const vip = areas.find((a) => a.kind === 'VIP_ROOM');
  for (const t of vip.tables) {
    await call('POST', `/branches/${center.id}/reservations`, { customerName: `VIP ${t.code}`, customerPhone: '0912000006', partySize: 10, reservedAt: vnIso(day, 19), areaId: vip.id, tableIds: [t.id], force: true });
  }
  const full = await call('POST', `/branches/${center.id}/reservations`, { customerName: 'Hết phòng', customerPhone: '0912000007', partySize: 10, reservedAt: vnIso(day, 19), areaId: vip.id });
  check('hết phòng, không chọn chờ → 409 NO_AVAILABILITY', full.status === 409 && full.json?.code === 'NO_AVAILABILITY', full.json?.code);
  const wait = await call('POST', `/branches/${center.id}/reservations`, { customerName: 'Hết phòng', customerPhone: '0912000007', partySize: 10, reservedAt: vnIso(day, 19), areaId: vip.id, waitlist: true });
  check('lễ tân đưa khách vào danh sách chờ', wait.status === 201 && wait.json?.status === 'WAITLIST', wait.json?.status);
  const dep = await call('POST', `/branches/${center.id}/reservations`, { customerName: 'Khách cọc', customerPhone: '0912000008', partySize: 12, reservedAt: vnIso(day, 11), depositRequired: 1_000_000, autoConfirm: false });
  const part = await call('POST', `/reservations/${dep.json.id}/deposit`, { amount: 400_000, method: 'CASH' });
  check('thu cọc một phần → vẫn PENDING', part.status === 200 && part.json?.depositStatus === 'PENDING' && Number(part.json?.depositPaid) === 400_000, { s: part.json?.depositStatus, paid: part.json?.depositPaid });
  const rest = await call('POST', `/reservations/${dep.json.id}/deposit`, { amount: 600_000, method: 'BANK_TRANSFER', externalRef: 'FT001' });
  check('thu đủ cọc → PAID và tự xác nhận đặt bàn', rest.json?.depositStatus === 'PAID' && rest.json?.status === 'CONFIRMED', { s: rest.json?.depositStatus, st: rest.json?.status });
}

// 4. Kho
{
  const whs = (await call('GET', `/warehouses?branchId=${center.id}`)).json;
  const main = whs.find((w) => w.code === 'CENTER-MAIN');
  const bar = whs.find((w) => w.code === 'CENTER-BAR');
  const items = (await call('GET', '/stock-items')).json;
  const nuoc = items.find((s) => s.code === 'NUOC-DA-LAN');
  await call('POST', '/goods-receipts', { branchId: center.id, warehouseId: main.id, lines: [{ stockItemId: nuoc.id, quantity: 2, unit: 'thùng 24', unitPrice: 96_000 }] });
  const level = async (wh) => Number((await call('GET', `/warehouses/${wh}/levels`)).json.find((l) => l.stockItemId === nuoc.id)?.quantity ?? 0);
  const barBefore = await level(bar.id);
  const tr = await call('POST', '/stock-transfers', { fromWarehouseId: main.id, toWarehouseId: bar.id, lines: [{ stockItemId: nuoc.id, quantitySent: 24 }] });
  await call('POST', `/stock-transfers/${tr.json.id}/send`);
  const detail = await call('GET', `/stock-transfers/${tr.json.id}`);
  check('xem chi tiết phiếu chuyển kho kèm dòng', detail.status === 200 && detail.json?.lines?.[0]?.stockItem?.code === 'NUOC-DA-LAN', detail.json?.lines?.length);
  await call('POST', `/stock-transfers/${tr.json.id}/receive`, { lines: [{ stockItemId: nuoc.id, quantityReceived: 22 }] });
  const barAfter = await level(bar.id);
  check('nhận thiếu 2 chai: tồn bar tăng đúng 22', Math.abs(barAfter - barBefore - 22) < 0.001, { barBefore, barAfter });
  const mv = (await call('GET', `/warehouses/${bar.id}/movements?stockItemId=${nuoc.id}`)).json;
  const rows = Array.isArray(mv) ? mv : (mv?.items ?? []);
  const waste = rows.find((m) => m.kind === 'WASTE' && m.refId === tr.json.id);
  check('phần thiếu ghi hao hụt -2 kèm lý do', !!waste && Number(waste.quantity) === -2, waste ?? rows.slice(0, 3));
  const st = await call('POST', '/stocktakes', { warehouseId: bar.id });
  const list = await call('GET', `/stocktakes?warehouseId=${bar.id}`);
  check('liệt kê phiếu kiểm kê', list.status === 200 && list.json.some((s) => s.id === st.json.id), list.status);
  await call('POST', `/stocktakes/${st.json.id}/cancel`);
}

// 5. Tiệc
{
  const halls = (await call('GET', `/branches/${center.id}/halls`)).json;
  const hall = halls[0];
  const day = 60 + (Math.floor(Date.now() / 60_000) % 200);
  const date = new Date(Date.now() + day * 86_400_000).toISOString().slice(0, 10);
  const ev = await call('POST', `/branches/${center.id}/events`, { kind: 'BIRTHDAY', contactName: 'Khách tiệc thử', contactPhone: '0912000010', companyName: 'Công ty Thử', notes: 'Ghi chú cũ', eventDate: date, startTime: '18:00', endTime: '21:00', halls: [{ hallId: hall.id }], expectedTables: 10 });
  check('tạo tiệc có sảnh', ev.status === 201 && ev.json?.halls?.length === 1, ev.json?.halls?.length ?? ev.json);
  const cleared = await call('PATCH', `/events/${ev.json.id}`, { companyName: null, notes: null });
  check('xóa trống tên công ty và ghi chú', cleared.status === 200 && cleared.json?.companyName === null && cleared.json?.notes === null, { c: cleared.json?.companyName, n: cleared.json?.notes });
  check('PATCH không xóa sảnh đã đặt', cleared.json?.halls?.length === 1, cleared.json?.halls?.length);
  await call('PUT', `/events/${ev.json.id}/menus`, { menus: [{ name: 'Set 1', pricePerTable: 2_500_000, tables: 10 }] });
  await call('POST', `/events/${ev.json.id}/quotes`, {});
  const quoted = await call('GET', `/events/${ev.json.id}`);
  const back = await call('POST', `/events/${ev.json.id}/reopen-lead`, { note: 'Khách muốn đổi thực đơn' });
  check('QUOTED → LEAD', quoted.json?.status === 'QUOTED' && back.status === 200 && back.json?.status === 'LEAD', { before: quoted.json?.status, after: back.json?.status ?? back.json });
  await call('POST', `/events/${ev.json.id}/cancel`, { reason: 'kiểm thử' });
}

// 6. Đăng nhập Zalo (mock)
{
  token = '';
  const z = await call('POST', '/auth/customer/zalo', { accessToken: `mock:reg-${uniq}:0912${uniq}` });
  check('đăng nhập Zalo mock tạo khách mới', z.status === 200 && z.json?.customer?.isNew === true && !!z.json?.accessToken, z.json);
  token = z.json?.accessToken ?? '';
  const me = await call('GET', '/me');
  check('dùng token Zalo gọi /me', me.status === 200, me.status);
}

console.log(failures === 0 ? '\nTẤT CẢ KIỂM TRA ĐẠT' : `\n${failures} KIỂM TRA THẤT BẠI`);
process.exit(failures === 0 ? 0 : 1);
