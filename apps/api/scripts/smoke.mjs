#!/usr/bin/env node
/**
 * Kiểm tra luồng nghiệp vụ đầu-cuối trên API đang chạy (dữ liệu seed Dạ Lan):
 * đăng nhập → sơ đồ bàn → thực đơn → mở bàn → gọi món → bếp bump → tạo bill → VietQR → xác nhận → đóng phiên;
 * sau đó luồng khách QR: quét → tham gia → gọi món → nhân viên xác nhận.
 * Dùng: node scripts/smoke.mjs [http://localhost:4000]
 */
const BASE = process.argv[2] ?? process.env.API_URL ?? 'http://localhost:4000';
const API = `${BASE}/api/v1`;
let token = '';
let failures = 0;

async function call(method, path, body, extraHeaders = {}) {
  const res = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}), ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

function check(label, ok, detail) {
  if (ok) console.log(`  ✔ ${label}`);
  else {
    failures++;
    console.log(`  ✘ ${label}${detail ? ` → ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 400)}` : ''}`);
  }
}

console.log(`Smoke test DaLan OS API tại ${BASE}`);

// 1. Health
{
  const r = await call('GET', `${BASE}/health`);
  check('health ok', r.status === 200 && r.json?.status === 'ok', r.json);
}

// 2. Đăng nhập quản trị
{
  const r = await call('POST', '/auth/staff/login', { login: 'ADMIN', password: 'Dalan@2026' });
  check('đăng nhập ADMIN', r.status === 200 && r.json?.accessToken, r.json);
  token = r.json?.accessToken ?? '';
  const bad = await call('POST', '/auth/staff/login', { login: 'ADMIN', password: 'sai' });
  check('sai mật khẩu bị từ chối 401', bad.status === 401, bad.json);
}

// 3. Cơ sở và sơ đồ bàn
const branches = await call('GET', '/branches');
check('danh sách 3 cơ sở', branches.status === 200 && branches.json?.length === 3, branches.json);
const center = branches.json.find((b) => b.code === 'CENTER');
const floor = await call('GET', `/branches/${center.id}/floor`);
const allTables = floor.json?.areas?.flatMap((a) => a.tables) ?? [];
check('sơ đồ bàn Center có bàn', floor.status === 200 && allTables.length > 40, { status: floor.status, count: allTables.length });
const emptyTables = allTables.filter((t) => t.status === 'EMPTY' && !t.isPrivateRoom);
const vipTable = allTables.find((t) => t.isPrivateRoom && t.status === 'EMPTY');

// 4. Thực đơn theo cơ sở
const menu = await call('GET', `/branches/${center.id}/menu`);
const items = menu.json?.menus?.flatMap((m) => m.categories.flatMap((c) => c.items)) ?? [];
check('thực đơn Center có trên 200 món', menu.status === 200 && items.length > 200, { count: items.length });
const fixedItem = items.find((i) => i.pricingMode === 'FIXED' && i.price && i.modifierGroups.length === 0 && !i.countEmpties);
const variantItem = items.find((i) => i.pricingMode === 'VARIANT' && i.variants.length >= 2);
const weightItem = items.find((i) => i.pricingMode === 'WEIGHT' && i.modifierGroups.length > 0);
const beer = items.find((i) => i.countEmpties);
check('có món cố định, biến thể, theo cân, bia', !!fixedItem && !!variantItem && !!weightItem && !!beer, { fixedItem: fixedItem?.name, variantItem: variantItem?.name, weightItem: weightItem?.name, beer: beer?.name });

// 5. Mở bàn
const open = await call('POST', `/branches/${center.id}/sessions`, { tableIds: [emptyTables[0].id], guestCount: 4 });
check('mở bàn thành công', open.status === 201 && open.json?.status === 'OPEN', open.json);
const session = open.json;
const again = await call('POST', `/branches/${center.id}/sessions`, { tableIds: [emptyTables[0].id], guestCount: 2 });
check('mở trùng bàn bị chặn 409', again.status === 409 && again.json?.code === 'TABLE_OCCUPIED', again.json);

// 6. Gọi món: cố định ×2, biến thể lớn, cua 1,2kg rang me, 10 bia
const weightMod = weightItem.modifierGroups[0];
const order = await call('POST', `/sessions/${session.id}/orders`, {
  lines: [
    { itemId: fixedItem.id, quantity: 2, note: 'Ít cay' },
    { itemId: variantItem.id, variantId: variantItem.variants[1].id, quantity: 1 },
    { itemId: weightItem.id, quantity: 1.2, modifiers: [{ groupId: weightMod.id, optionId: weightMod.options[1]?.id ?? weightMod.options[0].id }] },
    { itemId: beer.id, quantity: 10 },
  ],
  send: true,
});
check('gọi món và gửi bếp', order.status === 201 && order.json?.status === 'SENT' && order.json.lines.every((l) => l.status === 'SENT'), order.json);
const expectedWeight = Math.round(weightItem.price * 1.2);
const weightLine = order.json?.lines?.find((l) => l.itemId === weightItem.id);
check(`tiền món theo cân = ${expectedWeight.toLocaleString('vi-VN')}`, Number(weightLine?.lineTotal) === expectedWeight, weightLine);
check('phiếu bếp được tách theo trạm', order.json?.tickets?.length >= 1, order.json?.tickets);

const missingVariant = await call('POST', `/sessions/${session.id}/orders`, { lines: [{ itemId: variantItem.id, quantity: 1 }], send: true });
check('thiếu biến thể bị từ chối 400', missingVariant.status === 400 && missingVariant.json?.code === 'VARIANT_REQUIRED', missingVariant.json);

// 7. Bếp
const tickets = await call('GET', `/branches/${center.id}/kitchen/tickets`);
check('KDS thấy phiếu đang chờ', tickets.status === 200 && tickets.json.length >= 1, tickets.json?.length);
for (const t of tickets.json) {
  const b = await call('POST', `/kitchen/tickets/${t.id}/bump`);
  check(`bump phiếu ${t.station?.code} #${t.seq}`, b.status === 200 && b.json?.status === 'DONE', b.json);
}
const afterBump = await call('GET', `/sessions/${session.id}`);
check('mọi dòng món READY sau khi bếp xong', afterBump.json?.orders?.[0]?.lines?.every((l) => l.status === 'READY'), afterBump.json?.orders?.[0]?.lines?.map((l) => l.status));
const firstLine = afterBump.json.orders[0].lines[0];
const served = await call('POST', `/sessions/${session.id}/lines/${firstLine.id}/served`);
check('đánh dấu đã ra bàn', served.status === 201 || served.status === 200, served.json);

// 8. Hủy món có duyệt
const voidLine = afterBump.json.orders[0].lines.find((l) => l.itemId === variantItem.id);
const voidNoPin = await call('POST', `/sessions/${session.id}/lines/${voidLine.id}/void`, { reason: 'GUEST_CHANGED_MIND', waste: false });
check('hủy món đã gửi bếp: ADMIN có toàn quyền nên không cần PIN', voidNoPin.status === 201 || voidNoPin.status === 200, voidNoPin.json);

// 9. Đếm vỏ: gọi 10 bia, đếm 12 vỏ
const empties = await call('POST', `/sessions/${session.id}/empties`, { counts: [{ itemId: beer.id, countedQty: 12 }] });
check('đếm vỏ thêm 2 bia', empties.status === 200 && empties.json?.adjustments?.[0]?.delta === 2, empties.json);

// 10. Bill và thanh toán VietQR
const bills = await call('POST', `/sessions/${session.id}/bills`, { mode: 'ALL' });
check('tạo bill', bills.status === 201 && bills.json?.[0]?.code, bills.json);
const bill = bills.json[0];
const detail = await call('GET', `/sessions/${session.id}`);
const expectedSubtotal = detail.json.orders.flatMap((o) => o.lines).filter((l) => ['SENT', 'PREPARING', 'READY', 'SERVED'].includes(l.status)).reduce((s, l) => s + Number(l.lineTotal), 0);
check(`bill.subtotal = tổng dòng đã gửi (${expectedSubtotal.toLocaleString('vi-VN')})`, Number(bill.subtotal) === expectedSubtotal, { subtotal: bill.subtotal, expectedSubtotal });
check('VAT 8% gồm trong giá: total = subtotal', Number(bill.total) === expectedSubtotal, { total: bill.total });

const disc = await call('POST', `/bills/${bill.id}/discounts`, { kind: 'PERCENT', valueBps: 500, reason: 'Khách quen' });
check('giảm 5% có lý do', disc.status === 201 && Number(disc.json?.billDiscountTotal) === Math.round(expectedSubtotal * 0.05), disc.json?.billDiscountTotal);

const pay = await call('POST', `/bills/${bill.id}/payments`, { method: 'BANK_TRANSFER' });
check('tạo thanh toán VietQR chờ xác nhận', pay.status === 201 && pay.json?.payment?.status === 'PENDING' && pay.json.payment.qrPayload?.startsWith('000201'), pay.json?.payment);
check('QR data URL để hiển thị', pay.json?.payment?.qrDataUrl?.startsWith('data:image/png'), null);
const confirm = await call('POST', `/payments/${pay.json.payment.id}/confirm`, { externalRef: 'FT26102000001' });
check('xác nhận chuyển khoản → bill PAID', confirm.status === 200 && confirm.json?.status === 'PAID', confirm.json?.status);
const closed = await call('GET', `/sessions/${session.id}`);
check('phiên bàn tự đóng sau khi trả đủ', closed.json?.status === 'CLOSED', closed.json?.status);
const floor2 = await call('GET', `/branches/${center.id}/floor`);
const t0 = floor2.json.areas.flatMap((a) => a.tables).find((t) => t.id === emptyTables[0].id);
check('bàn trở về trống', t0?.status === 'EMPTY', t0?.status);

// 11. Lệnh in (relay outbox chạy mỗi 400ms nên chờ tối đa 3 giây)
let kinds = [];
for (let i = 0; i < 10; i++) {
  const jobs = await call('GET', `/branches/${center.id}/print-jobs`);
  kinds = jobs.json?.map((j) => j.kind) ?? [];
  if (kinds.includes('KITCHEN_TICKET') && kinds.includes('BILL_FINAL')) break;
  await new Promise((r) => setTimeout(r, 300));
}
check('có lệnh in phiếu bếp và bill cuối', kinds.includes('KITCHEN_TICKET') && kinds.includes('BILL_FINAL'), kinds);

// 12. Idempotency
const idem = { 'idempotency-key': `smoke-${Date.now()}` };
const t2 = emptyTables[1];
const o1 = await call('POST', `/branches/${center.id}/sessions`, { tableIds: [t2.id], guestCount: 2 }, idem);
const o2 = await call('POST', `/branches/${center.id}/sessions`, { tableIds: [t2.id], guestCount: 2 }, idem);
check('Idempotency-Key trả cùng kết quả', o1.status === 201 && o2.status === 201 && o1.json?.id === o2.json?.id, { o1: o1.json?.id, o2: o2.json?.id, s2: o2.status });
await call('POST', `/sessions/${o1.json.id}/cancel`, { reason: 'smoke' });

// 13. Khách QR
{
  const tableRow = await call('GET', `/branches/${center.id}/areas`);
  const freeTable = tableRow.json.flatMap((a) => a.tables).find((t) => t.id === emptyTables[2].id);
  const staffTable = await call('GET', `/branches/${center.id}`);
  void staffTable;
  // Lấy qrToken: không lộ qua API công khai, nên đọc từ cơ sở dữ liệu qua endpoint quản trị bàn (rotate-qr trả về bàn kèm token)
  const rotated = await call('POST', `/branches/${center.id}/tables/${freeTable.id}/rotate-qr`);
  const qrToken = rotated.json?.qrToken;
  check('đổi mã QR bàn', rotated.status === 201 && !!qrToken, rotated.json);
  const saved = token;
  token = '';
  const landing = await call('GET', `${BASE}/q/${qrToken}`);
  check('trang QR trả thông tin bàn', landing.status === 200 && landing.json?.table?.id === freeTable.id, landing.json);
  const join = await call('POST', `${BASE}/q/${qrToken}/join`, { nickname: 'An', guestCount: 3 });
  check('khách tham gia nhận guestToken', join.status === 200 && join.json?.guestToken, join.json);
  const gh = { 'x-guest-token': join.json.guestToken };
  const gmenu = await call('GET', '/guest/menu', undefined, gh);
  check('khách xem được thực đơn', gmenu.status === 200 && gmenu.json?.menus?.length > 0, gmenu.status);
  const gorder = await call('POST', '/guest/orders', { lines: [{ itemId: fixedItem.id, quantity: 1 }] }, gh);
  check('khách gửi đơn → chờ nhân viên xác nhận', gorder.status === 201 && gorder.json?.status === 'PENDING_CONFIRM', gorder.json);
  const greq = await call('POST', '/guest/service-requests', { kind: 'CALL_STAFF', note: 'Xin thêm đá' }, gh);
  check('khách gọi nhân viên', greq.status === 201, greq.json);
  const gview = await call('GET', '/guest/session', undefined, gh);
  check('khách xem phiên của mình', gview.status === 200 && gview.json?.me?.participantId === join.json.participant.id, gview.status);
  const forbidden = await call('GET', `/branches/${center.id}/floor`, undefined, gh);
  check('khách không xem được sơ đồ bàn (403)', forbidden.status === 403, forbidden.status);
  token = saved;
  const confirmOrder = await call('POST', `/sessions/${join.json.session.id}/orders/${gorder.json.id}/confirm`);
  check('nhân viên xác nhận đơn khách → SENT', (confirmOrder.status === 201 || confirmOrder.status === 200) && confirmOrder.json?.status === 'SENT', confirmOrder.json);
  const reqs = await call('GET', `/branches/${center.id}/service-requests`);
  check('nhân viên thấy yêu cầu gọi phục vụ', reqs.json?.some((r) => r.kind === 'CALL_STAFF'), reqs.json);
  for (const r of reqs.json) await call('POST', `/service-requests/${r.id}/done`);
  const gtickets = await call('GET', `/branches/${center.id}/kitchen/tickets`);
  for (const t of gtickets.json) await call('POST', `/kitchen/tickets/${t.id}/bump`);
  const gb = await call('POST', `/sessions/${join.json.session.id}/bills`, { mode: 'ALL' });
  const cash = await call('POST', `/bills/${gb.json[0].id}/payments`, { method: 'CASH', tenderedAmount: Number(gb.json[0].total) + 50_000 });
  check('tiền mặt tính tiền thừa 50.000', cash.status === 201 && Number(cash.json?.payment?.changeAmount) === 50_000 && cash.json?.bill?.status === 'PAID', cash.json?.payment);
}

// 14. Phòng VIP: phụ thu mức tối thiểu
if (vipTable) {
  const vip = await call('POST', `/branches/${center.id}/sessions`, { tableIds: [vipTable.id], guestCount: 8 });
  const vo = await call('POST', `/sessions/${vip.json.id}/orders`, { lines: [{ itemId: fixedItem.id, quantity: 1 }], send: true });
  for (const t of (await call('GET', `/branches/${center.id}/kitchen/tickets`)).json) await call('POST', `/kitchen/tickets/${t.id}/bump`);
  const vb = await call('POST', `/sessions/${vip.json.id}/bills`, { mode: 'ALL' });
  const hasSurcharge = vb.json?.[0]?.lines?.some((l) => l.orderLine?.isAdjustment);
  check('phòng VIP dưới mức tối thiểu có dòng phụ thu, total = 3.000.000', hasSurcharge && Number(vb.json[0].total) === 3_000_000, { total: vb.json?.[0]?.total, lines: vb.json?.[0]?.lines?.length, vo: vo.status });
  await call('POST', `/bills/${vb.json[0].id}/payments`, { method: 'CARD_TERMINAL', subMethod: 'APPLE_PAY', cardLast4: '1234', approvalCode: 'A1B2C3' });
}

// 15. Ca làm việc
{
  const cur = await call('GET', `/branches/${center.id}/shifts/current`);
  let shiftId = cur.json?.shift?.id;
  if (!shiftId) {
    const o = await call('POST', '/shifts', { branchId: center.id, openingCash: 2_000_000 });
    check('mở ca', o.status === 201, o.json);
    shiftId = o.json?.id;
  }
  const sum = await call('GET', `/shifts/${shiftId}`);
  check('tổng hợp ca có expectedCash', sum.status === 200 && typeof sum.json?.expectedCash === 'number', sum.json);
  const close = await call('POST', `/shifts/${shiftId}/close`, { closingCashCounted: sum.json.expectedCash - 20_000, notes: 'smoke' });
  check('kết ca tính chênh lệch -20.000', close.status === 200 && Number(close.json?.shift?.variance) === -20_000, close.json?.shift);
}

console.log(failures === 0 ? '\nTẤT CẢ KIỂM TRA ĐẠT' : `\n${failures} KIỂM TRA THẤT BẠI`);
process.exit(failures === 0 ? 0 : 1);
