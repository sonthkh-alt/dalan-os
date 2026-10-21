#!/usr/bin/env node
/**
 * Smoke test mô-đun đặt bàn, khách hàng, thông báo, nhật ký (tác tử A).
 * Dùng: node scripts/smoke-reservations.mjs [http://localhost:4100]
 */
const BASE = process.argv[2] ?? process.env.API_URL ?? 'http://localhost:4100';
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
    console.log(`  ✘ ${label}${detail !== undefined ? ` → ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 500)}` : ''}`);
  }
}
const vnDate = (daysAhead, hh = 18, mm = 30) => {
  const d = new Date(Date.now() + daysAhead * 24 * 3600_000 + 7 * 3600_000);
  const ymd = d.toISOString().slice(0, 10);
  return { ymd, iso: `${ymd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+07:00` };
};
const uniq = Date.now().toString().slice(-6);
// Mỗi lần chạy dùng một ngày riêng (5-54 ngày tới) để đặt bàn của lần chạy trước không chiếm bàn/phòng
const dayBase = 5 + (Math.floor(Date.now() / 60_000) % 50);
const phone = `09${uniq.padStart(8, '1')}`;

console.log(`Smoke test đặt bàn / khách hàng / thông báo tại ${BASE}`);

// Đăng nhập
{
  const r = await call('POST', '/auth/staff/login', { login: 'ADMIN', password: 'Dalan@2026' });
  check('đăng nhập ADMIN', r.status === 200 && r.json?.accessToken, r.json);
  token = r.json?.accessToken ?? '';
}
const branches = await call('GET', '/branches');
const center = branches.json.find((b) => b.code === 'CENTER');
const areas = await call('GET', `/branches/${center.id}/areas`);
const vipArea = areas.json.find((a) => a.kind === 'VIP_ROOM');
const hallArea = areas.json.find((a) => a.kind === 'HALL');

// 1. Khả dụng công khai
const d1 = vnDate(dayBase);
token = '';
const avail = await call('GET', `/public/branches/center/reservations/availability?date=${d1.ymd}&partySize=6`);
check('khả dụng công khai trả danh sách khung giờ', avail.status === 200 && avail.json?.slots?.length > 10 && avail.json.capacitySeats > 0, { status: avail.status, slots: avail.json?.slots?.length });
const slot1830 = avail.json?.slots?.find((s) => s.time === '18:30');
check('khung 18:30 còn chỗ', slot1830?.available === true, slot1830);
const pubAreas = await call('GET', '/public/branches/center/areas');
check('danh sách khu vực công khai có phòng VIP', pubAreas.status === 200 && pubAreas.json.some((a) => a.kind === 'VIP_ROOM'), pubAreas.json?.length);

// 2. Khách tự đặt bàn
const created = await call('POST', '/public/reservations', { branchId: center.id, customerName: 'Nguyễn Smoke', customerPhone: phone, partySize: 6, reservedAt: d1.iso, occasion: 'Sinh nhật', specialRequests: 'Ghế trẻ em', marketingConsent: true });
check('khách đặt bàn thành công, tự xác nhận', created.status === 201 && created.json?.status === 'CONFIRMED' && created.json.code, created.json);
const code = created.json?.code;
const tooSoon = await call('POST', '/public/reservations', { branchId: center.id, customerName: 'A', customerPhone: phone, partySize: 2, reservedAt: new Date(Date.now() + 5 * 60_000).toISOString() });
check('đặt quá gần giờ bị từ chối', tooSoon.status === 400 && tooSoon.json?.code === 'TOO_SOON', tooSoon.json);
const badPhone = await call('POST', '/public/reservations', { branchId: center.id, customerName: 'A', customerPhone: 'abcdefgh', partySize: 2, reservedAt: d1.iso });
check('số điện thoại sai bị từ chối', badPhone.status === 400 && badPhone.json?.code === 'INVALID_PHONE', badPhone.json?.code);

// 3. Tra cứu và hủy bằng mã + số điện thoại
const lookup = await call('GET', `/public/reservations/${code}?phone=${phone}`);
check('tra cứu đặt bàn bằng mã và số điện thoại', lookup.status === 200 && lookup.json?.code === code, lookup.json);
const wrong = await call('GET', `/public/reservations/${code}?phone=0999999999`);
check('tra cứu sai số điện thoại → 404', wrong.status === 404, wrong.status);

// 4. Nhân viên: danh sách, xếp bàn, check-in
token = (await call('POST', '/auth/staff/login', { login: 'ADMIN', password: 'Dalan@2026' })).json.accessToken;
const list = await call('GET', `/branches/${center.id}/reservations?date=${d1.ymd}`);
const mine = list.json?.find((r) => r.code === code);
check('lễ tân thấy đặt bàn trong ngày', list.status === 200 && !!mine && mine.customer?.fullName === 'Nguyễn Smoke', list.json?.length);
const freeTable = (await call('GET', `/branches/${center.id}/floor`)).json.areas.find((a) => a.id === hallArea.id).tables.find((t) => t.status === 'EMPTY');
const assign = await call('POST', `/reservations/${mine.id}/assign-tables`, { tableIds: [freeTable.id] });
check('xếp bàn cho đặt bàn', assign.status === 200 && assign.json?.tables?.[0]?.id === freeTable.id, assign.json);
const d1b = vnDate(dayBase, 19, 0);
const staffCreate = await call('POST', `/branches/${center.id}/reservations`, { branchId: center.id, customerName: 'Trần Lễ Tân', customerPhone: '0912000002', partySize: 4, reservedAt: d1b.iso, source: 'PHONE', tableIds: [freeTable.id], notes: 'Khách quen' });
check('tạo đặt bàn kèm bàn đã có đặt trùng giờ bị chặn 409', staffCreate.status === 409 && staffCreate.json?.code === 'TABLE_RESERVED', staffCreate.json);
// (tạo không kèm bàn rồi gán → phải báo trùng)
const staffCreate2 = await call('POST', `/branches/${center.id}/reservations`, { branchId: center.id, customerName: 'Trần Lễ Tân', customerPhone: '0912000002', partySize: 4, reservedAt: d1b.iso, source: 'PHONE', notes: 'Khách quen' });
check('lễ tân tạo đặt bàn qua điện thoại', staffCreate2.status === 201 && staffCreate2.json?.status === 'CONFIRMED', staffCreate2.json);
const conflict = await call('POST', `/reservations/${staffCreate2.json.id}/assign-tables`, { tableIds: [freeTable.id] });
check('gán bàn đã có đặt trùng giờ → 409 TABLE_RESERVED', conflict.status === 409 && conflict.json?.code === 'TABLE_RESERVED', conflict.json);

// Check-in với đặt bàn hôm nay (force vì có thể ngoài giờ)
const today = vnDate(0);
const nowPlus = new Date(Date.now() + 40 * 60_000).toISOString();
const todayRes = await call('POST', `/branches/${center.id}/reservations`, { branchId: center.id, customerName: 'Khách Hôm Nay', customerPhone: '0912000001', partySize: 3, reservedAt: nowPlus, source: 'WALK_IN', force: true, preorderLines: [] });
check('tạo đặt bàn hôm nay (force)', todayRes.status === 201, todayRes.json);
const floor = (await call('GET', `/branches/${center.id}/floor`)).json;
const emptyTable = floor.areas.find((a) => a.id === hallArea.id).tables.filter((t) => t.status === 'EMPTY' && t.id !== freeTable.id)[0];
const checkin = await call('POST', `/reservations/${todayRes.json.id}/check-in`, { tableIds: [emptyTable.id], guestCount: 4 });
check('check-in mở phiên bàn nguồn RESERVATION', checkin.status === 200 && checkin.json?.session?.source === 'RESERVATION' && checkin.json?.reservation?.status === 'SEATED', checkin.json);
check('phiên gắn khách thành viên từ đặt bàn', checkin.json?.session?.customerId === checkin.json?.reservation?.customerId, null);
await call('POST', `/sessions/${checkin.json.session.id}/cancel`, { reason: 'smoke' });

// No-show và hủy
const noShowRes = await call('POST', `/branches/${center.id}/reservations`, { branchId: center.id, customerName: 'Khách Không Đến', customerPhone: '0912000003', partySize: 2, reservedAt: nowPlus, source: 'PHONE', force: true });
const ns = await call('POST', `/reservations/${noShowRes.json.id}/no-show`);
check('đánh dấu no-show', ns.status === 200 && ns.json?.status === 'NO_SHOW', ns.json?.status);
const cancelPub = await call('POST', `/public/reservations/${code}/cancel`, { phone, reason: 'Bận việc' });
check('khách tự hủy đặt bàn', cancelPub.status === 200 && cancelPub.json?.status === 'CANCELLED', cancelPub.json);
const cancelAgain = await call('POST', `/public/reservations/${code}/cancel`, { phone });
check('hủy lần hai bị chặn (409)', cancelAgain.status === 409, cancelAgain.status);

// 5. Danh sách chờ: lấp đầy phòng VIP rồi đặt thêm
{
  // Chọn ngày mà phòng VIP chưa có đặt bàn nào (script khác có thể đã lấp đầy một ngày gần đó)
  let d3 = vnDate(dayBase + 1, 18, 0);
  for (let off = 1; off <= 40; off++) {
    const cand = vnDate(((dayBase + off - 5) % 55) + 5, 18, 0);
    const existing = (await call('GET', `/branches/${center.id}/reservations?date=${cand.ymd}`)).json ?? [];
    if (!existing.some((r) => r.areaId === vipArea.id && !['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(r.status))) {
      d3 = cand;
      break;
    }
  }
  const vipTables = (await call('GET', `/branches/${center.id}/areas`)).json.find((a) => a.id === vipArea.id).tables;
  let okCount = 0;
  for (const t of vipTables) {
    const r = await call('POST', `/branches/${center.id}/reservations`, { branchId: center.id, customerName: `VIP ${t.code}`, customerPhone: `09${(Number(uniq) + okCount + 11).toString().padStart(8, '2')}`, partySize: 10, reservedAt: d3.iso, areaId: vipArea.id, tableIds: [t.id], force: true });
    if (r.status === 201) okCount++;
  }
  const availVip = await call('GET', `/branches/${center.id}/reservations/availability?date=${d3.ymd}&partySize=10&areaId=${vipArea.id}`);
  const s18 = availVip.json?.slots?.find((s) => s.time === '18:00');
  check('phòng VIP đã kín → khung 18:00 hết phòng', okCount === vipTables.length && s18?.available === false && s18?.reason === 'Hết phòng', { okCount, s18 });
  token = '';
  const wait = await call('POST', '/public/reservations', { branchId: center.id, customerName: 'Khách Chờ', customerPhone: '0912000004', partySize: 10, reservedAt: d3.iso, areaId: vipArea.id });
  check('khách đặt khi hết phòng → vào danh sách chờ', wait.status === 201 && wait.json?.status === 'WAITLIST' && wait.json.waitlistPosition === 1, wait.json);
  token = (await call('POST', '/auth/staff/login', { login: 'ADMIN', password: 'Dalan@2026' })).json.accessToken;
  const promote = await call('POST', `/reservations/${wait.json.id}/confirm`);
  check('lễ tân xác nhận từ danh sách chờ', promote.status === 200 && promote.json?.status === 'CONFIRMED', promote.json?.status);
}

// 6. Nhắc lịch: đặt bàn trong 90 phút tới → chạy worker → có thông báo 2h
{
  const soon = new Date(Date.now() + 90 * 60_000).toISOString();
  const r = await call('POST', `/branches/${center.id}/reservations`, { branchId: center.id, customerName: 'Khách Sắp Tới', customerPhone: '0912000005', partySize: 2, reservedAt: soon, source: 'PHONE', force: true });
  const run = await call('POST', '/reservations/reminders/run');
  check('worker nhắc lịch gửi ít nhất 1 tin', run.status === 200 && run.json?.reminded >= 1, run.json);
  const after = await call('GET', `/reservations/${r.json.id}`);
  check('đặt bàn ghi nhận đã nhắc 2h', Array.isArray(after.json?.remindersSent) && after.json.remindersSent.includes('2h'), after.json?.remindersSent);
  const logs = await call('GET', `/notifications?templateCode=RESERVATION_REMINDER_2H&recipient=912000005`);
  check('NotificationLog có bản ghi nhắc lịch SENT', logs.json?.items?.some((l) => l.status === 'SENT'), logs.json?.items?.length);
}

// 7. Thông báo xác nhận đặt bàn được gửi qua outbox (chờ relay)
{
  let found = false;
  for (let i = 0; i < 12 && !found; i++) {
    const logs = await call('GET', `/notifications?templateCode=RESERVATION_CONFIRMED&recipient=${phone.slice(1)}`);
    found = logs.json?.items?.length >= 1;
    if (!found) await new Promise((r) => setTimeout(r, 400));
  }
  check('xác nhận đặt bàn gửi ZNS (mock) qua outbox', found, null);
}

// 8. Khách hàng
{
  const search = await call('GET', `/customers?q=${phone}`);
  const c = search.json?.items?.[0];
  check('tìm khách theo số điện thoại', search.status === 200 && c?.fullName === 'Nguyễn Smoke' && c?.phoneMasked === false, search.json);
  const detail = await call('GET', `/customers/${c.id}`);
  check('chi tiết khách kèm lịch sử đặt bàn', detail.status === 200 && detail.json?.reservations?.length >= 1, detail.json?.reservations?.length);
  const upd = await call('PATCH', `/customers/${c.id}`, { birthday: vnDate(1).ymd, tags: ['VIP'], allergies: 'Hải sản' });
  check('cập nhật hồ sơ (sinh nhật ngày mai, dị ứng)', upd.status === 200 && upd.json?.allergies === 'Hải sản', upd.json);
  const pts = await call('POST', `/customers/${c.id}/points`, { points: 150, reason: 'Đền bù' });
  check('điều chỉnh điểm +150', pts.status === 201 && pts.json?.pointsBalance === 150, pts.json);
  const neg = await call('POST', `/customers/${c.id}/points`, { points: -500, reason: 'Thử âm' });
  check('điểm không được âm', neg.status === 400, neg.json?.code);
  const tiers = await call('GET', '/loyalty/tiers');
  check('4 hạng thành viên', tiers.json?.length === 4, tiers.json?.length);
  const recalc = await call('POST', `/loyalty/recalculate?customerId=${c.id}`);
  check('tính lại hạng', recalc.status === 200 && typeof recalc.json?.updated === 'number', recalc.json);

  // voucher + áp dụng vào bill
  const v = await call('POST', '/vouchers', { kind: 'AMOUNT', value: 50000, minBill: 100000, usageLimit: 1, customerId: c.id });
  check('phát hành voucher cho khách', v.status === 201 && v.json?.[0]?.code, v.json);
  const menu = await call('GET', `/branches/${center.id}/menu`);
  const item = menu.json.menus.flatMap((m) => m.categories.flatMap((cat) => cat.items)).find((i) => i.pricingMode === 'FIXED' && i.price >= 100000 && i.modifierGroups.length === 0);
  const floor2 = (await call('GET', `/branches/${center.id}/floor`)).json;
  const t = floor2.areas.find((a) => a.id === hallArea.id).tables.find((x) => x.status === 'EMPTY');
  const s = await call('POST', `/branches/${center.id}/sessions`, { tableIds: [t.id], guestCount: 2 });
  const attach = await call('POST', `/sessions/${s.json.id}/customer`, { phone });
  check('gắn khách vào phiên bàn', attach.status === 201 && attach.json?.id === c.id, attach.json);
  await call('POST', `/sessions/${s.json.id}/orders`, { lines: [{ itemId: item.id, quantity: 2 }], send: true });
  for (const tk of (await call('GET', `/branches/${center.id}/kitchen/tickets`)).json) await call('POST', `/kitchen/tickets/${tk.id}/bump`);
  const bill = (await call('POST', `/sessions/${s.json.id}/bills`, { mode: 'ALL' })).json[0];
  const disc = await call('POST', `/bills/${bill.id}/discounts`, { kind: 'VOUCHER', voucherCode: v.json[0].code });
  check('áp voucher giảm 50.000', disc.status === 201 && Number(disc.json?.billDiscountTotal) === 50000, disc.json?.billDiscountTotal);
  const pay = await call('POST', `/bills/${bill.id}/payments`, { method: 'CASH' });
  check('thanh toán: voucher dùng hết, điểm tích thêm', pay.json?.bill?.status === 'PAID', pay.json?.bill?.status);
  const vAfter = await call('GET', `/vouchers?code=${v.json[0].code}`);
  check('voucher usedCount = 1', vAfter.json?.[0]?.usedCount === 1, vAfter.json?.[0]);
  const cAfter = await call('GET', `/customers/${c.id}`);
  check('khách có lifetimeSpend và điểm > 150', Number(cAfter.json?.lifetimeSpend) > 0 && cAfter.json?.pointsBalance > 150, { spend: cAfter.json?.lifetimeSpend, points: cAfter.json?.pointsBalance });
  const receipt = await call('GET', `/notifications?templateCode=RECEIPT&customerId=${c.id}`);
  let receiptFound = receipt.json?.items?.length >= 1;
  for (let i = 0; i < 10 && !receiptFound; i++) {
    await new Promise((r) => setTimeout(r, 400));
    receiptFound = (await call('GET', `/notifications?templateCode=RECEIPT&customerId=${c.id}`)).json?.items?.length >= 1;
  }
  check('biên nhận gửi ZNS cho khách có đồng ý nhận tin', receiptFound, null);

  // Sinh nhật
  const camp = await call('POST', '/campaigns', { code: `BDAY-${uniq}`, name: 'Sinh nhật', kind: 'BIRTHDAY', rules: { daysAhead: 3 }, voucherTemplate: { kind: 'PERCENT', value: 1000, maxDiscount: 200000, usageLimit: 1, validDays: 30 } });
  check('tạo chiến dịch sinh nhật', camp.status === 201, camp.json);
  const bday = await call('POST', '/campaigns/birthday/run');
  check('chiến dịch sinh nhật tặng voucher cho khách sinh nhật ngày mai', bday.status === 200 && bday.json?.birthdays >= 1, bday.json);
  const bvs = await call('GET', `/vouchers?customerId=${c.id}&campaignId=${camp.json.id}`);
  check('voucher sinh nhật gắn khách', bvs.json?.length >= 1 && bvs.json[0].kind === 'PERCENT', bvs.json?.length);
  await call('PUT', `/campaigns/${camp.json.id}`, { code: `BDAY-${uniq}`, name: 'Sinh nhật', kind: 'BIRTHDAY', isActive: false, rules: {} });

  // Gộp hồ sơ
  const dup = await call('POST', '/customers', { phone: `08${uniq.padStart(8, '3')}`, fullName: 'Hồ sơ trùng', tags: ['trung'] });
  await call('POST', `/customers/${dup.json.id}/points`, { points: 20, reason: 'test' });
  const merged = await call('POST', '/customers/merge', { sourceId: dup.json.id, targetId: c.id });
  check('gộp hồ sơ cộng điểm và nhãn', merged.status === 200 && merged.json?.tags?.includes('trung') && merged.json.pointsBalance === cAfter.json.pointsBalance + 20, { tags: merged.json?.tags, pts: merged.json?.pointsBalance });
  const dupAfter = await call('GET', `/customers/${dup.json.id}`);
  check('hồ sơ nguồn đã ẩn danh', dupAfter.json?.isAnonymized === true, dupAfter.json?.isAnonymized);

  // Đánh giá từ khách QR sau khi thanh toán
  const tableRow = floor2.areas.find((a) => a.id === hallArea.id).tables.filter((x) => x.status === 'EMPTY' && x.id !== t.id)[0];
  const rot = await call('POST', `/branches/${center.id}/tables/${tableRow.id}/rotate-qr`);
  const saved = token;
  token = '';
  const join = await call('POST', `${BASE}/q/${rot.json?.qrToken}/join`, { nickname: 'Bình' });
  check('khách QR tham gia bàn để đánh giá', join.status === 200 && join.json?.guestToken, { rot: rot.status, join: join.json });
  if (!join.json?.guestToken) {
    token = saved;
    throw new Error('Không tham gia được phiên khách, dừng kịch bản đánh giá');
  }
  const gh = { 'x-guest-token': join.json.guestToken };
  const early = await call('POST', '/guest/feedback', { rating: 5 }, gh);
  check('khách chưa thanh toán không được đánh giá', early.status === 409, early.status);
  token = saved;
  const gs = join.json.session.id;
  const go = await call('POST', '/guest/orders', { lines: [{ itemId: item.id, quantity: 1 }] }, gh);
  await call('POST', `/sessions/${gs}/orders/${go.json.id}/confirm`);
  for (const tk of (await call('GET', `/branches/${center.id}/kitchen/tickets`)).json) await call('POST', `/kitchen/tickets/${tk.id}/bump`);
  const gb = (await call('POST', `/sessions/${gs}/bills`, { mode: 'ALL' })).json[0];
  await call('POST', `/bills/${gb.id}/payments`, { method: 'CASH' });
  token = '';
  const fb = await call('POST', '/guest/feedback', { rating: 2, comment: 'Món lên chậm', billId: gb.id }, gh);
  check('khách đánh giá sau thanh toán', fb.status === 201 && fb.json?.rating === 2, fb.json);
  const fb2 = await call('POST', '/guest/feedback', { rating: 4 }, gh);
  check('không đánh giá hai lần', fb2.status === 409, fb2.status);
  token = saved;
  const fbs = await call('GET', `/feedback?branchId=${center.id}&maxRating=2&unhandled=true`);
  check('quản lý thấy đánh giá thấp chưa xử lý', fbs.json?.some((f) => f.id === fb.json.id), fbs.json?.length);
  const resp = await call('POST', `/feedback/${fb.json.id}/respond`, { response: 'Xin lỗi quý khách, chúng tôi sẽ cải thiện.' });
  check('phản hồi đánh giá', resp.status === 200 && resp.json?.handledAt, resp.json);
  const stats = await call('GET', `/feedback/stats?branchId=${center.id}`);
  check('thống kê đánh giá', stats.status === 200 && stats.json?.total >= 1, stats.json);
}

// 9. OTP khách thành viên đi qua MessagingService (mock) và /me
{
  token = '';
  const otp = await call('POST', '/auth/customer/otp/request', { phone });
  check('yêu cầu OTP trả devCode', otp.status === 200 && otp.json?.devCode === '123456', otp.json);
  const verify = await call('POST', '/auth/customer/otp/verify', { phone, code: '123456' });
  check('xác thực OTP nhận token khách', verify.status === 200 && verify.json?.accessToken, verify.json);
  const ct = verify.json.accessToken;
  const me = await call('GET', '/me', undefined, { authorization: `Bearer ${ct}` });
  check('/me của khách có điểm và voucher', me.status === 200 && me.json?.pointsBalance > 0 && Array.isArray(me.json.vouchers), me.json);
  const myRes = await call('GET', '/me/reservations', undefined, { authorization: `Bearer ${ct}` });
  check('/me/reservations liệt kê đặt bàn của khách', myRes.status === 200 && myRes.json?.length >= 1, myRes.json?.length);
  token = (await call('POST', '/auth/staff/login', { login: 'ADMIN', password: 'Dalan@2026' })).json.accessToken;
  const otpLog = await call('GET', `/notifications?templateCode=OTP&recipient=${phone.slice(1)}`);
  check('OTP được ghi NotificationLog qua provider mock', otpLog.json?.items?.length >= 1 && otpLog.json.items[0].status === 'SENT', otpLog.json?.items?.[0]);
}

// 10. Nhật ký thao tác và che số điện thoại theo quyền
{
  const audit = await call('GET', `/audit-logs?branchId=${center.id}&action=reservation`);
  check('nhật ký có thao tác đặt bàn', audit.status === 200 && audit.json?.items?.length >= 1 && audit.json.items[0].actor?.code === 'ADMIN', audit.json?.total);
  // Nhân viên phục vụ (không có customer.phone.view_full) thấy số che
  const dev = await call('POST', '/auth/devices', { branchId: center.id, name: 'Smoke tablet', kind: 'TABLET' });
  const staffList = await call('GET', '/auth/staff/device', undefined, { 'x-device-token': dev.json.deviceToken });
  const waiter = staffList.json.staff.find((s) => s.role.code === 'WAITER');
  const pin = await call('POST', '/auth/staff/pin', { staffId: waiter.id, pin: '1111' }, { 'x-device-token': dev.json.deviceToken });
  const saved = token;
  token = pin.json.accessToken;
  const masked = await call('GET', `/customers?q=Smoke`);
  check('phục vụ thấy số điện thoại bị che', masked.status === 200 && masked.json?.items?.[0]?.phoneMasked === true && masked.json.items[0].phone.includes('***'), masked.json?.items?.[0]?.phone);
  const noAudit = await call('GET', '/audit-logs');
  check('phục vụ không xem được nhật ký (403)', noAudit.status === 403, noAudit.status);
  token = saved;
  await call('DELETE', `/auth/devices/${dev.json.device.id}`);
}

console.log(failures === 0 ? '\nTẤT CẢ KIỂM TRA ĐẠT' : `\n${failures} KIỂM TRA THẤT BẠI`);
process.exit(failures === 0 ? 0 : 1);
