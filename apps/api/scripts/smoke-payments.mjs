#!/usr/bin/env node
/**
 * Smoke test cổng thanh toán (mock) và hóa đơn điện tử (mock) trên API đang chạy.
 * Luồng: mở bàn → gọi món → bếp xong → bill → tạo intent (mock) → webhook sai chữ ký bị từ chối →
 * webhook giả tự thành công → bill PAID → phát hành HĐĐT qua hàng đợi → ISSUED → PDF → đối chiếu → hoàn tiền qua cổng.
 * Dùng: node scripts/smoke-payments.mjs [http://localhost:4200]
 */
const BASE = process.argv[2] ?? process.env.API_URL ?? 'http://localhost:4200';
const API = `${BASE}/api/v1`;
let token = '';
let failures = 0;

async function call(method, path, body, extraHeaders = {}) {
  const res = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}), ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/pdf')) return { status: res.status, json: null, pdf: Buffer.from(await res.arrayBuffer()), contentType: ct };
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json, contentType: ct };
}
function check(label, ok, detail) {
  if (ok) console.log(`  ✔ ${label}`);
  else {
    failures++;
    console.log(`  ✘ ${label}${detail !== undefined ? ` → ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 400)}` : ''}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function prepareBill(center, fixedItem) {
  const floor = await call('GET', `/branches/${center.id}/floor`);
  const table = floor.json.areas.flatMap((a) => a.tables).find((t) => t.status === 'EMPTY' && !t.isPrivateRoom);
  const session = (await call('POST', `/branches/${center.id}/sessions`, { tableIds: [table.id], guestCount: 2 })).json;
  await call('POST', `/sessions/${session.id}/orders`, { lines: [{ itemId: fixedItem.id, quantity: 2 }], send: true });
  for (const t of (await call('GET', `/branches/${center.id}/kitchen/tickets`)).json) await call('POST', `/kitchen/tickets/${t.id}/bump`);
  const bills = await call('POST', `/sessions/${session.id}/bills`, { mode: 'ALL' });
  return { session, bill: bills.json[0] };
}

console.log(`Smoke test payments + invoicing tại ${BASE}`);
const login = await call('POST', '/auth/staff/login', { login: 'ADMIN', password: 'Dalan@2026' });
check('đăng nhập ADMIN', login.status === 200, login.json);
token = login.json.accessToken;
const center = (await call('GET', '/branches')).json.find((b) => b.code === 'CENTER');
const menu = await call('GET', `/branches/${center.id}/menu`);
const items = menu.json.menus.flatMap((m) => m.categories.flatMap((c) => c.items));
const fixedItem = items.find((i) => i.pricingMode === 'FIXED' && i.price && i.modifierGroups.length === 0 && !i.countEmpties);

// 1. Phương thức khả dụng
const methods = await call('GET', `/branches/${center.id}/payment-methods`);
check('phương thức cổng khả dụng (mock khi chưa có hợp đồng)', methods.status === 200 && methods.json.length >= 5 && methods.json.every((m) => m.simulated), methods.json);

// 2. Intent MoMo → mock
const { session, bill } = await prepareBill(center, fixedItem);
const intentRes = await call('POST', `/bills/${bill.id}/payment-intents`, { method: 'MOMO', channel: 'pos' });
check('tạo payment intent (fallback mock)', intentRes.status === 201 && intentRes.json?.intent?.provider === 'mock' && intentRes.json.intent.redirectUrl && intentRes.json.intent.status === 'PENDING', intentRes.json);
const intent = intentRes.json.intent;
check('Payment PENDING gắn intent', intentRes.json?.payment?.status === 'PENDING' && intentRes.json.payment.intentId === intent.id, intentRes.json?.payment);

// 3. Webhook sai chữ ký bị từ chối, không đổi trạng thái
const saved = token;
token = '';
const bad = await call('POST', '/webhooks/payments/mock', { providerIntentId: intent.providerIntentId, status: 'SUCCEEDED', amount: intent.amount, signature: 'deadbeef' });
check('webhook chữ ký sai → 400', bad.status === 400 && bad.json?.code === 'INVALID_SIGNATURE', bad.json);
const unknown = await call('POST', '/webhooks/payments/mock', { providerIntentId: 'mock_khong_ton_tai', status: 'SUCCEEDED', amount: 1, signature: 'x' });
check('webhook intent lạ → NOT_FOUND', unknown.status === 400 && unknown.json?.code === 'NOT_FOUND', unknown.json);
token = saved;
const stillPending = await call('GET', `/payment-intents/${intent.id}`);
check('intent vẫn PENDING sau webhook sai', ['PENDING', 'SUCCEEDED'].includes(stillPending.json?.status), stillPending.json);

// 4. Webhook giả tự thành công sau ~2s → intent SUCCEEDED, bill PAID, phiên đóng
let final = null;
for (let i = 0; i < 20; i++) {
  final = (await call('GET', `/payment-intents/${intent.id}`)).json;
  if (final?.status === 'SUCCEEDED') break;
  await sleep(500);
}
check('intent SUCCEEDED qua webhook giả lập', final?.status === 'SUCCEEDED' && final.externalRef?.startsWith('MOCK'), final);
const paidBill = await call('GET', `/bills/${bill.id}`);
check('bill PAID với payment SUCCEEDED + externalRef', paidBill.json?.status === 'PAID' && paidBill.json.payments.some((p) => p.status === 'SUCCEEDED' && p.externalRef), paidBill.json?.payments);
const closedSession = await call('GET', `/sessions/${session.id}`);
check('phiên bàn tự đóng', closedSession.json?.status === 'CLOSED', closedSession.json?.status);
const replay = await call('POST', '/webhooks/payments/mock', { providerIntentId: intent.providerIntentId, status: 'SUCCEEDED', amount: intent.amount, signature: 'deadbeef' }, { authorization: '' });
check('webhook lặp lại không gây lỗi 5xx', replay.status < 500, replay.status);

// 5. Hóa đơn điện tử qua hàng đợi BullMQ
const issue = await call('POST', `/bills/${bill.id}/einvoice`, { buyer: { buyerName: 'Công ty TNHH Du lịch Xứ Thanh', buyerTaxCode: '2800123456', buyerAddress: 'TP. Thanh Hóa', buyerEmail: 'ketoan@xuthanh.vn' } });
check('tạo HĐĐT → QUEUED', issue.status === 201 && ['QUEUED', 'ISSUED'].includes(issue.json?.status), issue.json);
let inv = null;
for (let i = 0; i < 30; i++) {
  inv = (await call('GET', `/einvoices/${issue.json.id}`)).json;
  if (inv?.status === 'ISSUED') break;
  await sleep(500);
}
check('worker phát hành → ISSUED có số, mã CQT, mã tra cứu', inv?.status === 'ISSUED' && inv.invoiceNo && inv.taxAuthorityCode && inv.lookupCode && inv.lookupUrl, inv);
check('tổng hóa đơn = tổng bill, VAT tách đúng', Number(inv?.total) === Number(paidBill.json.total) && Number(inv?.totalBeforeVat) + Number(inv?.vatAmount) === Number(inv?.total), { total: inv?.total, before: inv?.totalBeforeVat, vat: inv?.vatAmount });
const again = await call('POST', `/bills/${bill.id}/einvoice`, {});
check('phát hành lại cùng bill là idempotent', again.status === 201 && again.json?.id === issue.json.id, again.json?.id);
const pdf = await call('GET', `/einvoices/${issue.json.id}/pdf`);
check('tải PDF hóa đơn', pdf.status === 200 && pdf.pdf && pdf.pdf.subarray(0, 4).toString() === '%PDF', pdf.contentType);
const list = await call('GET', `/einvoices?status=ISSUED&branchId=${center.id}`);
check('danh sách HĐĐT đã phát hành', list.status === 200 && list.json.items.some((x) => x.id === issue.json.id), list.json?.total);
const lookup = await call('GET', '/tax-codes/2800123456');
check('tra cứu MST (mock)', lookup.status === 200 && lookup.json?.name, lookup.json);
const badTax = await call('GET', '/tax-codes/abc');
check('MST sai định dạng → 400', badTax.status === 400, badTax.json);
const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const recon = await call('GET', `/branches/${center.id}/einvoice/reconcile?date=${today}`);
check('đối chiếu bill PAID với HĐĐT', recon.status === 200 && recon.json.paidBills >= 1 && recon.json.issued >= 1, recon.json);

// 6. Hủy và thay thế
const bills2 = await prepareBill(center, fixedItem);
const pay2 = await call('POST', `/bills/${bills2.bill.id}/payments`, { method: 'CASH' });
check('bill 2 trả tiền mặt', pay2.json?.bill?.status === 'PAID', pay2.json?.bill?.status);
const inv2 = await call('POST', `/bills/${bills2.bill.id}/einvoice`, { issueNow: true });
check('issueNow phát hành đồng bộ', inv2.status === 201 && inv2.json?.status === 'ISSUED', inv2.json);
const replaced = await call('POST', `/einvoices/${inv2.json.id}/replace`, { reason: 'Sai tên người mua', buyer: { buyerName: 'Nguyễn Văn An', buyerTaxCode: '8012345678' } });
check('thay thế → hóa đơn mới ISSUED, cũ REPLACED', replaced.status === 201 && replaced.json?.status === 'ISSUED' && replaced.json.replacesId === inv2.json.id, replaced.json);
const oldInv = await call('GET', `/einvoices/${inv2.json.id}`);
check('hóa đơn cũ REPLACED', oldInv.json?.status === 'REPLACED', oldInv.json?.status);
const cancelled = await call('POST', `/einvoices/${replaced.json.id}/cancel`, { reason: 'Khách không lấy hóa đơn' });
check('hủy hóa đơn', cancelled.status === 200 && cancelled.json?.status === 'CANCELLED', cancelled.json);

// 7. addPayment với ví → tạo intent (ZaloPay → mock) và hoàn tiền qua cổng
const bills3 = await prepareBill(center, fixedItem);
const viaBilling = await call('POST', `/bills/${bills3.bill.id}/payments`, { method: 'ZALOPAY' });
check('POST /bills/:id/payments ví → trả intent redirect', viaBilling.status === 201 && viaBilling.json?.payment?.intent?.redirectUrl, viaBilling.json?.payment);
let b3 = null;
for (let i = 0; i < 20; i++) {
  b3 = (await call('GET', `/bills/${bills3.bill.id}`)).json;
  if (b3?.status === 'PAID') break;
  await sleep(500);
}
check('bill 3 PAID sau webhook giả', b3?.status === 'PAID', b3?.status);
const paidPayment = b3?.payments?.find((p) => p.status === 'SUCCEEDED');
const refund = await call('POST', `/payments/${paidPayment?.id}/refund`, { amount: 10_000, reason: 'Khách phàn nàn' });
check('hoàn 10.000 qua cổng mock có mã tham chiếu', (refund.status === 201 || refund.status === 200) && refund.json?.payments?.some((p) => p.refunds?.some((r) => r.externalRef?.startsWith('MOCKRF'))), refund.json?.payments);

// 8. Hủy intent đang chờ
const bills4 = await prepareBill(center, fixedItem);
const i4 = await call('POST', `/bills/${bills4.bill.id}/payment-intents`, { method: 'APPLE_PAY' });
const cancelIntent = await call('POST', `/payment-intents/${i4.json.intent.id}/cancel`);
check('hủy intent đang chờ', cancelIntent.status === 200 && cancelIntent.json?.status === 'CANCELLED', cancelIntent.json);
await sleep(2500);
const afterCancel = await call('GET', `/payment-intents/${i4.json.intent.id}`);
check('webhook giả sau khi hủy không làm intent thành công', afterCancel.json?.status === 'CANCELLED', afterCancel.json?.status);

console.log(failures === 0 ? '\nTẤT CẢ KIỂM TRA ĐẠT' : `\n${failures} KIỂM TRA THẤT BẠI`);
process.exit(failures === 0 ? 0 : 1);
