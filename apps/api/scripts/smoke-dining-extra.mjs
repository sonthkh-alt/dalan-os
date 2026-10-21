#!/usr/bin/env node
/**
 * Kiểm thử bổ sung cho các tiêu chí nghiệm thu C4/E4 chưa có trong smoke.mjs:
 * - Gộp hai bàn đang phục vụ thành một phiên, bill chung.
 * - Chia bill theo khách QR: mỗi khách có bill phần mình, phiên đóng khi cả hai trả xong.
 * - Phục vụ hủy món trên 200.000đ: bị yêu cầu PIN quản lý; PIN sai bị từ chối; PIN đúng được duyệt.
 * Dùng: node scripts/smoke-dining-extra.mjs [http://localhost:4000]
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
    console.log(`  ✘ ${label}${detail !== undefined ? ` → ${JSON.stringify(detail).slice(0, 400)}` : ''}`);
  }
}

const bumpAll = async (branchId) => {
  for (const t of (await call('GET', `/branches/${branchId}/kitchen/tickets`)).json) await call('POST', `/kitchen/tickets/${t.id}/bump`);
};

console.log(`Smoke test bổ sung vận hành bàn tại ${BASE}`);
token = (await call('POST', '/auth/staff/login', { login: 'ADMIN', password: 'Dalan@2026' })).json.accessToken;
const adminToken = token;
const center = (await call('GET', '/branches')).json.find((b) => b.code === 'CENTER');
const items = (await call('GET', `/branches/${center.id}/menu`)).json.menus.flatMap((m) => m.categories.flatMap((c) => c.items));
const cheap = items.find((i) => i.pricingMode === 'FIXED' && i.price && i.price < 150_000 && i.modifierGroups.length === 0 && !i.countEmpties);
const pricey = items.find((i) => i.pricingMode === 'FIXED' && i.price && i.price > 300_000 && i.modifierGroups.length === 0);
const emptyTables = () => call('GET', `/branches/${center.id}/floor`).then((r) => r.json.areas.flatMap((a) => a.tables).filter((t) => t.status === 'EMPTY' && !t.isPrivateRoom));

// 1. Gộp bàn
{
  const [t1, t2] = await emptyTables();
  const s1 = (await call('POST', `/branches/${center.id}/sessions`, { tableIds: [t1.id], guestCount: 4 })).json;
  const s2 = (await call('POST', `/branches/${center.id}/sessions`, { tableIds: [t2.id], guestCount: 3 })).json;
  await call('POST', `/sessions/${s1.id}/orders`, { lines: [{ itemId: cheap.id, quantity: 2 }], send: true });
  await call('POST', `/sessions/${s2.id}/orders`, { lines: [{ itemId: cheap.id, quantity: 1 }], send: true });
  const merged = await call('POST', `/sessions/${s1.id}/merge`, { otherSessionId: s2.id });
  const lines = merged.json?.orders?.flatMap((o) => o.lines) ?? [];
  check('gộp bàn: một phiên hai bàn', merged.status === 201 && merged.json?.tables?.length === 2, { status: merged.status, tables: merged.json?.tables?.length });
  check('gộp bàn: số khách cộng dồn 7, giữ đủ 2 đơn', merged.json?.guestCount === 7 && lines.length === 2, { guests: merged.json?.guestCount, lines: lines.length });
  const other = await call('GET', `/sessions/${s2.id}`);
  check('phiên bị gộp chuyển CLOSED', other.json?.status === 'CLOSED', other.json?.status);
  await bumpAll(center.id);
  const bill = (await call('POST', `/sessions/${s1.id}/bills`, { mode: 'ALL' })).json?.[0];
  check('bill chung bằng tổng hai bàn', Number(bill?.subtotal) === cheap.price * 3, { subtotal: bill?.subtotal, expected: cheap.price * 3 });
  await call('POST', `/bills/${bill.id}/payments`, { method: 'CASH' });
  const floor = (await call('GET', `/branches/${center.id}/floor`)).json.areas.flatMap((a) => a.tables);
  check('trả xong: cả hai bàn trống', [t1.id, t2.id].every((id) => floor.find((t) => t.id === id)?.status === 'EMPTY'), null);
}

// 2. Chia bill theo khách QR
{
  const [t] = await emptyTables();
  const rotated = await call('POST', `/branches/${center.id}/tables/${t.id}/rotate-qr`);
  token = '';
  const a = (await call('POST', `${BASE}/q/${rotated.json.qrToken}/join`, { nickname: 'An', guestCount: 2 })).json;
  const b = (await call('POST', `${BASE}/q/${rotated.json.qrToken}/join`, { nickname: 'Bình' })).json;
  check('hai khách cùng vào một phiên', a.session.id === b.session.id, { a: a.session.id, b: b.session.id });
  const oa = (await call('POST', '/guest/orders', { lines: [{ itemId: cheap.id, quantity: 2 }] }, { 'x-guest-token': a.guestToken })).json;
  const ob = (await call('POST', '/guest/orders', { lines: [{ itemId: cheap.id, quantity: 1 }] }, { 'x-guest-token': b.guestToken })).json;
  token = adminToken;
  await call('POST', `/sessions/${a.session.id}/orders/${oa.id}/confirm`);
  await call('POST', `/sessions/${a.session.id}/orders/${ob.id}/confirm`);
  await bumpAll(center.id);
  const ba = (await call('POST', `/sessions/${a.session.id}/bills`, { mode: 'BY_PARTICIPANT', participantId: a.participant.id })).json?.[0];
  const bb = (await call('POST', `/sessions/${a.session.id}/bills`, { mode: 'BY_PARTICIPANT', participantId: b.participant.id })).json?.[0];
  check('bill của An = 2 phần', Number(ba?.subtotal) === cheap.price * 2, ba?.subtotal);
  check('bill của Bình = 1 phần', Number(bb?.subtotal) === cheap.price, bb?.subtotal);
  await call('POST', `/bills/${ba.id}/payments`, { method: 'CASH' });
  const mid = await call('GET', `/sessions/${a.session.id}`);
  check('mới một người trả: phiên chưa đóng', mid.json?.status !== 'CLOSED', mid.json?.status);
  await call('POST', `/bills/${bb.id}/payments`, { method: 'CARD_TERMINAL', subMethod: 'APPLE_PAY', cardLast4: '4242' });
  const end = await call('GET', `/sessions/${a.session.id}`);
  check('cả hai trả xong: phiên đóng', end.json?.status === 'CLOSED', end.json?.status);
}

// 3. Phục vụ hủy món vượt hạn mức cần PIN quản lý
{
  const dev = await call('POST', '/auth/devices', { branchId: center.id, name: `Tablet thử ${Date.now() % 10000}`, kind: 'TABLET' });
  const deviceToken = dev.json.deviceToken;
  const staffList = (await call('GET', '/auth/staff/device', undefined, { 'x-device-token': deviceToken })).json.staff;
  const waiter = staffList.find((s) => s.code === 'PV1-C');
  const login = await call('POST', '/auth/staff/pin', { staffId: waiter.id, pin: '1111' }, { 'x-device-token': deviceToken });
  check('phục vụ đăng nhập PIN trên thiết bị', login.status === 200 && !!login.json?.accessToken, login.json);
  token = login.json.accessToken;
  const [t] = await emptyTables();
  const s = (await call('POST', `/branches/${center.id}/sessions`, { tableIds: [t.id], guestCount: 2 })).json;
  const o = (await call('POST', `/sessions/${s.id}/orders`, { lines: [{ itemId: pricey.id, quantity: 1 }], send: true })).json;
  const lineId = o.lines[0].id;
  const noPin = await call('POST', `/sessions/${s.id}/lines/${lineId}/void`, { reason: 'GUEST_CHANGED_MIND' });
  check(`hủy món ${pricey.price.toLocaleString('vi-VN')}đ không PIN → APPROVAL_REQUIRED`, noPin.status === 400 && noPin.json?.code === 'APPROVAL_REQUIRED', noPin.json);
  const badPin = await call('POST', `/sessions/${s.id}/lines/${lineId}/void`, { reason: 'GUEST_CHANGED_MIND', managerPin: '1111' });
  check('PIN của chính phục vụ (không đủ quyền) bị từ chối 403', badPin.status === 403, badPin.json);
  const okPin = await call('POST', `/sessions/${s.id}/lines/${lineId}/void`, { reason: 'GUEST_CHANGED_MIND', managerPin: '2222' });
  const voided = okPin.json?.orders?.flatMap((x) => x.lines).find((l) => l.id === lineId);
  check('PIN quản lý cơ sở duyệt → món VOIDED, ghi người duyệt', (okPin.status === 201 || okPin.status === 200) && voided?.status === 'VOIDED' && !!voided?.voidApprovedById, { status: okPin.status, line: voided?.status, approvedBy: voided?.voidApprovedById });
  await call('POST', `/sessions/${s.id}/cancel`, { reason: 'smoke' }).then((r) => r.status === 409 && null);
  token = adminToken;
  const bill = (await call('POST', `/sessions/${s.id}/bills`, { mode: 'ALL' }));
  if (bill.status === 201) await call('POST', `/bills/${bill.json[0].id}/void`, { reason: 'smoke' });
  await call('DELETE', `/auth/devices/${dev.json.device.id}`);
}

console.log(failures === 0 ? '\nTẤT CẢ KIỂM TRA ĐẠT' : `\n${failures} KIỂM TRA THẤT BẠI`);
process.exit(failures === 0 ? 0 : 1);
