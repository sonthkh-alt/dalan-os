#!/usr/bin/env node
/**
 * Kiểm tra trừ kho đúng một lần khi nhiều tiến trình xử lý cùng một đơn đồng thời
 * (relay outbox + 5 lệnh phát lại song song). Dùng: node scripts/check-stock-race.mjs [http://localhost:4000]
 */
const BASE = process.argv[2] ?? 'http://localhost:4000';
const API = `${BASE}/api/v1`;
let token = '';
const call = async (method, path, body) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const t = await res.text();
  return { status: res.status, json: t ? JSON.parse(t) : null };
};

token = (await call('POST', '/auth/staff/login', { login: 'ADMIN', password: 'Dalan@2026' })).json.accessToken;
const center = (await call('GET', '/branches')).json.find((b) => b.code === 'CENTER');
const nem = (await call('GET', '/menu-items?search=NEM-DA-LAN')).json.find((i) => i.code === 'KHAI_VI-NEM-DA-LAN');
const table = (await call('GET', `/branches/${center.id}/floor`)).json.areas.flatMap((a) => a.tables).find((t) => t.status === 'EMPTY' && !t.isPrivateRoom);
const session = (await call('POST', `/branches/${center.id}/sessions`, { tableIds: [table.id], guestCount: 2 })).json;
const order = (await call('POST', `/sessions/${session.id}/orders`, { lines: [{ itemId: nem.id, quantity: 4 }], send: true })).json;
// Chạy đồng thời với relay outbox
await Promise.all(Array.from({ length: 5 }, () => call('POST', `/inventory/replay-order/${order.id}`)));
await new Promise((r) => setTimeout(r, 3000));
const thit = (await call('GET', '/stock-items')).json.find((s) => s.code === 'THIT-LON-XAY');
const wh = (await call('GET', `/warehouses?branchId=${center.id}`)).json.find((w) => w.code === 'CENTER-MAIN');
const mv = (await call('GET', `/warehouses/${wh.id}/movements?stockItemId=${thit.id}&kind=SALE`)).json;
const rows = (Array.isArray(mv) ? mv : (mv?.items ?? [])).filter((m) => m.refId === order.lines[0].id);
console.log(rows.length === 1 ? `ĐẠT: trừ kho đúng một lần (${rows[0].quantity} g)` : `THẤT BẠI: ${rows.length} lần trừ kho cho cùng dòng món`);
for (const t of (await call('GET', `/branches/${center.id}/kitchen/tickets`)).json) await call('POST', `/kitchen/tickets/${t.id}/bump`);
const bill = (await call('POST', `/sessions/${session.id}/bills`, { mode: 'ALL' })).json[0];
await call('POST', `/bills/${bill.id}/payments`, { method: 'CASH' });
process.exit(rows.length === 1 ? 0 : 1);
