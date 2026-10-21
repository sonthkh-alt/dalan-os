'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { computeEventTotals } from '@dalan/domain';
import { EVENT_KIND_LABELS } from '@dalan/contracts';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { useEvent, type BeoContent, type EventDetail, type QuotePayload } from '@/lib/queries-ops';
import { bpsLabel, dateLabel, phoneDisplay, vnDateTime } from '@/lib/ops-utils';
import { money, moneyPlain, qty } from '@/lib/utils';
import { Loading } from '@/components/ui/primitives';
import { BEVERAGE_LABELS, LAYOUT_LABELS } from './labels';

const PRINT_CSS = `
@page { size: A4; margin: 12mm; }
.print-root { background: #e9e4e1; min-height: 100vh; padding-bottom: 24px; }
.sheet { width: 210mm; min-height: 297mm; margin: 16px auto; padding: 14mm 14mm 18mm; background: #fff; color: #1f1b1c; box-shadow: 0 4px 24px rgba(0,0,0,.12); font-size: 11.5pt; line-height: 1.45; }
.sheet h2 { font-size: 12.5pt; font-weight: 700; margin: 14px 0 6px; padding-bottom: 3px; border-bottom: 1.5px solid #7f2233; color: #661d2b; text-transform: uppercase; letter-spacing: .02em; }
.sheet table { width: 100%; border-collapse: collapse; }
.sheet th, .sheet td { border: 1px solid #d9d2d3; padding: 4px 6px; vertical-align: top; }
.sheet th { background: #f6f1ef; text-align: left; font-weight: 600; font-size: 10pt; }
.sheet .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.sheet .avoid { break-inside: avoid; page-break-inside: avoid; }
.sheet .total-row td { font-weight: 700; font-size: 12pt; background: #fbf1d8; }
@media screen and (max-width: 840px) { .sheet { width: auto; min-height: auto; margin: 8px; padding: 16px; } }
@media print {
  html, body { background: #fff !important; height: auto !important; }
  .print-root { background: #fff; padding: 0; }
  .no-print { display: none !important; }
  .sheet { width: auto; min-height: auto; margin: 0; padding: 0; box-shadow: none; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

export function EventPrint({ eventId, kind, version }: { eventId: string; kind: 'quote' | 'beo'; version?: number }) {
  const { hydrated, accessToken } = useAuth();
  const q = useEvent(hydrated && accessToken ? eventId : '');
  const title = kind === 'quote' ? 'Báo giá tiệc' : 'BEO – Phiếu điều hành tiệc';

  let body: ReactNode;
  if (!hydrated) body = <Loading />;
  else if (!accessToken)
    body = (
      <p className="p-8 text-center">
        Vui lòng{' '}
        <Link href={`/login?next=${encodeURIComponent(`/events/${eventId}/print/${kind}`)}`} className="font-semibold text-brand-800 underline">
          đăng nhập
        </Link>{' '}
        để xem bản in.
      </p>
    );
  else if (q.isLoading) body = <Loading />;
  else if (!q.data) body = <p className="p-8 text-center text-red-700">{errorMessage(q.error)}</p>;
  else body = kind === 'quote' ? <QuoteSheet ev={q.data} version={version} /> : <BeoSheet ev={q.data} version={version} />;

  return (
    <div className="print-root">
      <style>{PRINT_CSS}</style>
      <div className="no-print sticky top-0 z-10 border-b border-ink-100 bg-white">
        <PageHeader
          back={`/events/${eventId}`}
          breadcrumb={[{ label: 'Tiệc', href: '/events' }, { label: q.data?.code ?? 'Hồ sơ tiệc', href: `/events/${eventId}` }, { label: kind === 'quote' ? 'Bản in báo giá' : 'Bản in BEO' }]}
          title={title}
          subtitle={q.data ? (q.data.companyName ?? q.data.contactName) : undefined}
          className="py-2 md:py-3"
          actions={
            <Button onClick={() => window.print()}>
              <Printer className="h-5 w-5" /> In / Lưu PDF
            </Button>
          }
        />
      </div>
      {body}
    </div>
  );
}

function Letterhead({ ev, docTitle, meta }: { ev: EventDetail; docTitle: string; meta: ReactNode }) {
  return (
    <header style={{ display: 'flex', gap: 16, alignItems: 'flex-start', borderBottom: '3px double #7f2233', paddingBottom: 10 }}>
      <div style={{ width: 54, height: 54, borderRadius: 14, background: '#7f2233', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 20, flexShrink: 0 }}>DL</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '17pt', fontWeight: 900, color: '#7f2233', letterSpacing: '.04em' }}>NHÀ HÀNG DẠ LAN</div>
        <div style={{ fontWeight: 600 }}>{ev.branch.name}</div>
        {ev.branch.address && <div style={{ fontSize: '10pt' }}>{ev.branch.address}</div>}
        {ev.branch.phone && <div style={{ fontSize: '10pt' }}>Điện thoại: {ev.branch.phone}</div>}
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '15pt', fontWeight: 800, textTransform: 'uppercase' }}>{docTitle}</div>
        <div style={{ fontSize: '10pt' }}>{meta}</div>
      </div>
    </header>
  );
}

function InfoGrid({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <table>
      <tbody>
        {Array.from({ length: Math.ceil(rows.length / 2) }, (_, i) => (
          <tr key={i}>
            {[rows[i * 2], rows[i * 2 + 1]].map((r, j) =>
              r ? (
                <td key={j} style={{ width: '50%' }}>
                  <span style={{ color: '#6f6467', fontSize: '9.5pt' }}>{r[0]}: </span>
                  <b>{r[1]}</b>
                </td>
              ) : (
                <td key={j} />
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Signatures({ roles }: { roles: string[] }) {
  return (
    <div className="avoid" style={{ display: 'grid', gridTemplateColumns: `repeat(${roles.length}, 1fr)`, gap: 12, marginTop: 28, textAlign: 'center' }}>
      {roles.map((r) => (
        <div key={r}>
          <div style={{ fontWeight: 700 }}>{r}</div>
          <div style={{ fontSize: '9pt', color: '#6f6467' }}>(Ký, ghi rõ họ tên)</div>
          <div style={{ height: 64 }} />
        </div>
      ))}
    </div>
  );
}

function TotalsTable({ t, vatBps, serviceChargeBps }: { t: QuotePayload['totals']; vatBps: number; serviceChargeBps: number }) {
  return (
    <table className="avoid" style={{ width: '60%', marginLeft: 'auto', marginTop: 8 }}>
      <tbody>
        <tr>
          <td>Thực đơn</td>
          <td className="num">{moneyPlain(t.subtotalMenu)}</td>
        </tr>
        <tr>
          <td>Dịch vụ</td>
          <td className="num">{moneyPlain(t.subtotalServices)}</td>
        </tr>
        {t.adjustmentsTotal !== 0 && (
          <tr>
            <td>Phát sinh</td>
            <td className="num">{moneyPlain(t.adjustmentsTotal)}</td>
          </tr>
        )}
        {t.discountAmount > 0 && (
          <tr>
            <td>Giảm giá</td>
            <td className="num">-{moneyPlain(t.discountAmount)}</td>
          </tr>
        )}
        {t.serviceChargeAmount > 0 && (
          <tr>
            <td>Phí phục vụ {bpsLabel(serviceChargeBps)}</td>
            <td className="num">{moneyPlain(t.serviceChargeAmount)}</td>
          </tr>
        )}
        <tr className="total-row">
          <td>TỔNG CỘNG</td>
          <td className="num">{money(t.total)}</td>
        </tr>
        <tr>
          <td style={{ color: '#6f6467' }}>Trong đó thuế GTGT {bpsLabel(vatBps)}</td>
          <td className="num" style={{ color: '#6f6467' }}>
            {moneyPlain(t.vatAmount)}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function QuoteSheet({ ev, version }: { ev: EventDetail; version?: number }) {
  const quote = version ? ev.quotes.find((x) => x.version === version) : ev.quotes[0];
  const draft = !quote;
  const p: QuotePayload = quote?.payload ?? {
    version: 0,
    event: { code: ev.code, kind: ev.kind, eventDate: ev.eventDate, startTime: ev.startTime, endTime: ev.endTime, contactName: ev.contactName, companyName: ev.companyName, expectedTables: ev.expectedTables, guestsPerTable: ev.guestsPerTable },
    halls: ev.halls.map((h) => ({ name: h.hall.name, layout: h.layout })),
    menus: ev.menus.map((m) => ({ name: m.name, pricePerTable: m.pricePerTable, tables: m.tables, lines: m.lines.map((l) => ({ name: l.nameSnapshot, quantityPerTable: l.quantityPerTable, unit: l.unit })) })),
    services: ev.services.map((s) => ({ name: s.name, unitPrice: s.unitPrice, quantity: s.quantity, total: s.total, isIncluded: s.isIncluded })),
    totals: {
      ...computeEventTotals({
        menus: ev.menus.map((m) => ({ pricePerTable: m.pricePerTable, tables: m.tables })),
        services: ev.services.map((s) => ({ unitPrice: s.unitPrice, quantity: s.quantity, isIncluded: s.isIncluded })),
        discountAmount: ev.discountAmount,
        serviceChargeBps: ev.serviceChargeBps,
        vatBps: ev.vatBps,
        priceIncludesVat: true,
      }),
      depositsPaid: 0,
      paid: 0,
      due: 0,
    },
    validUntil: null,
    terms: null,
  };
  return (
    <article className="sheet">
      <Letterhead
        ev={ev}
        docTitle="Báo giá tiệc"
        meta={
          <>
            <div>
              Số: <b>{p.event.code}</b>
              {draft ? ' · BẢN NHÁP' : ` · Phiên bản ${p.version}`}
            </div>
            <div>Ngày lập: {quote ? vnDateTime(quote.sentAt ?? quote.createdAt) : vnDateTime(new Date())}</div>
            {p.validUntil && <div>Hiệu lực đến: {dateLabel(p.validUntil, false)}</div>}
          </>
        }
      />
      <p style={{ marginTop: 10 }}>
        Kính gửi: <b>{p.event.companyName ?? p.event.contactName}</b>
        {p.event.companyName ? ` (người liên hệ: ${p.event.contactName})` : ''}. Nhà hàng Dạ Lan trân trọng gửi Quý khách báo giá tổ chức tiệc như sau:
      </p>
      <h2>Thông tin tiệc</h2>
      <InfoGrid
        rows={[
          ['Loại tiệc', EVENT_KIND_LABELS[p.event.kind]],
          ['Ngày tổ chức', `${dateLabel(p.event.eventDate)}, ${p.event.startTime}–${p.event.endTime}`],
          ['Sảnh', p.halls.map((h) => `${h.name} (${LAYOUT_LABELS[h.layout] ?? h.layout})`).join(', ') || 'Sẽ xác nhận'],
          ['Quy mô', `${p.event.expectedTables} mâm × ${p.event.guestsPerTable} khách`],
          ['Điện thoại', phoneDisplay(ev.contactPhone)],
          ['Đồ uống', BEVERAGE_LABELS[ev.beveragePolicy] ?? ev.beveragePolicy],
        ]}
      />
      <h2>Thực đơn</h2>
      {p.menus.map((m, i) => (
        <div key={i} className="avoid" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
            <span>
              {p.menus.length > 1 ? `Phương án ${i + 1}: ` : ''}
              {m.name}
            </span>
            <span>
              {moneyPlain(m.pricePerTable)}đ/mâm × {m.tables} mâm = {money(m.pricePerTable * m.tables)}
            </span>
          </div>
          <ol style={{ columns: 2, columnGap: 24, margin: '4px 0 0 18px', listStyle: 'decimal' }}>
            {m.lines.map((l, j) => (
              <li key={j}>
                {l.name}
                {l.quantityPerTable !== 1 || l.unit ? <span style={{ color: '#6f6467' }}> ({qty(l.quantityPerTable)} {l.unit ?? ''}/mâm)</span> : null}
              </li>
            ))}
          </ol>
        </div>
      ))}
      {p.services.length > 0 && (
        <>
          <h2>Dịch vụ kèm theo</h2>
          <table>
            <thead>
              <tr>
                <th style={{ width: 28 }}>#</th>
                <th>Dịch vụ</th>
                <th className="num">Đơn giá</th>
                <th className="num">SL</th>
                <th className="num">Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {p.services.map((s, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{s.name}</td>
                  <td className="num">{moneyPlain(s.unitPrice)}</td>
                  <td className="num">{qty(s.quantity)}</td>
                  <td className="num">{s.isIncluded ? 'Tặng kèm' : moneyPlain(s.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <h2>Tổng giá trị</h2>
      <TotalsTable t={p.totals} vatBps={ev.vatBps} serviceChargeBps={ev.serviceChargeBps} />
      {(p.terms || ev.deposits.length > 0) && <h2>Điều khoản</h2>}
      {p.terms && <p style={{ whiteSpace: 'pre-line' }}>{p.terms}</p>}
      {ev.deposits.length > 0 && (
        <ul style={{ margin: '4px 0 0 18px', listStyle: 'disc' }}>
          {ev.deposits.map((d) => (
            <li key={d.id}>
              {d.label}: {money(d.amount)} – hạn {dateLabel(d.dueDate, false)}
            </li>
          ))}
        </ul>
      )}
      {ev.branch.bankAccountNo && (
        <p style={{ marginTop: 6, fontSize: '10pt' }}>
          Chuyển khoản: {ev.branch.bankAccountName} – STK {ev.branch.bankAccountNo}, nội dung “DLT {ev.code}”.
        </p>
      )}
      <Signatures roles={['Đại diện khách hàng', 'Đại diện Nhà hàng Dạ Lan']} />
    </article>
  );
}

function BeoSheet({ ev, version }: { ev: EventDetail; version?: number }) {
  const beo = version ? ev.beos.find((b) => b.version === version) : ev.beos[0];
  if (!beo) return <p className="p-8 text-center">Tiệc chưa phát hành BEO. Chốt mâm rồi phát hành BEO trong tab “BEO”.</p>;
  const c: BeoContent = beo.content;
  return (
    <article className="sheet">
      <Letterhead
        ev={ev}
        docTitle="BEO – Phiếu điều hành tiệc"
        meta={
          <>
            <div>
              Tiệc: <b>{c.event.code}</b> · Phiên bản <b>{c.version}</b>
              {beo.status === 'SUPERSEDED' ? ' (đã thay thế)' : ''}
            </div>
            <div>Phát hành: {vnDateTime(c.issuedAt)}</div>
            <div>Người phát hành: {c.issuedBy}</div>
          </>
        }
      />
      <h2>Thông tin tiệc</h2>
      <InfoGrid
        rows={[
          ['Loại tiệc', EVENT_KIND_LABELS[c.event.kind]],
          ['Ngày giờ', `${dateLabel(c.event.eventDate)}, ${c.event.startTime}–${c.event.endTime}`],
          ['Số mâm chốt', `${c.event.confirmedTables} mâm + ${c.event.reserveTables} dự phòng`],
          ['Khách mỗi mâm', `${c.event.guestsPerTable} (≈ ${c.event.confirmedTables * c.event.guestsPerTable} khách)`],
          ['Khách hàng', c.customer.companyName ?? c.customer.contactName],
          ['Liên hệ', `${c.customer.contactName} · ${phoneDisplay(c.customer.contactPhone)}`],
          ['Đồ uống', `${BEVERAGE_LABELS[c.event.beveragePolicy] ?? c.event.beveragePolicy}${c.event.beverageNotes ? ` – ${c.event.beverageNotes}` : ''}`],
          ['Mã số thuế', c.customer.taxCode ?? '—'],
        ]}
      />
      <h2>Sảnh và bố trí</h2>
      <table>
        <thead>
          <tr>
            <th>Sảnh</th>
            <th>Kiểu bố trí</th>
            <th>Ghi chú setup</th>
          </tr>
        </thead>
        <tbody>
          {c.halls.map((h, i) => (
            <tr key={i}>
              <td>{h.name}</td>
              <td>{LAYOUT_LABELS[h.layout] ?? h.layout}</td>
              <td>{h.setupNotes ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {c.setupNotes && <p style={{ marginTop: 4, whiteSpace: 'pre-line' }}>{c.setupNotes}</p>}
      {c.timeline.length > 0 && (
        <>
          <h2>Kịch bản chương trình</h2>
          <table>
            <thead>
              <tr>
                <th style={{ width: 70 }}>Giờ</th>
                <th>Hoạt động</th>
                <th style={{ width: 150 }}>Phụ trách</th>
              </tr>
            </thead>
            <tbody>
              {c.timeline.map((t, i) => (
                <tr key={i}>
                  <td className="num">{t.time}</td>
                  <td>{t.activity}</td>
                  <td>{t.owner ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <h2>Thực đơn</h2>
      {c.menus.map((m, i) => (
        <div key={i} className="avoid" style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 700 }}>
            {m.name} – {m.tables} mâm
          </div>
          <ol style={{ columns: 2, columnGap: 24, margin: '4px 0 0 18px', listStyle: 'decimal' }}>
            {m.lines.map((l, j) => (
              <li key={j}>
                {l.name} ({qty(l.quantityPerTable)} {l.unit ?? ''}/mâm){l.note ? ` – ${l.note}` : ''}
              </li>
            ))}
          </ol>
        </div>
      ))}
      <h2>Bảng định lượng cho bếp</h2>
      <table className="avoid">
        <thead>
          <tr>
            <th>Món</th>
            <th className="num">Số mâm (gồm dự phòng)</th>
            <th className="num">Tổng số lượng</th>
            <th>Đơn vị</th>
          </tr>
        </thead>
        <tbody>
          {c.kitchenQuantities.map((k, i) => (
            <tr key={i}>
              <td>{k.name}</td>
              <td className="num">{k.tables}</td>
              <td className="num">
                <b>{qty(k.quantity)}</b>
              </td>
              <td>{k.unit ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {c.services.length > 0 && (
        <>
          <h2>Dịch vụ</h2>
          <table>
            <thead>
              <tr>
                <th>Dịch vụ</th>
                <th className="num">SL</th>
                <th>Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {c.services.map((s, i) => (
                <tr key={i}>
                  <td>
                    {s.name}
                    {s.isIncluded ? ' (tặng kèm)' : ''}
                  </td>
                  <td className="num">{qty(s.quantity)}</td>
                  <td>{s.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {c.staffing.length > 0 && (
        <>
          <h2>Phân công nhân sự</h2>
          <table className="avoid">
            <thead>
              <tr>
                <th>Bộ phận</th>
                <th className="num">Số người</th>
                <th>Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {c.staffing.map((s, i) => (
                <tr key={i}>
                  <td>{s.role}</td>
                  <td className="num">{s.count}</td>
                  <td>{s.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {(c.specialNotes || c.customer.notes) && (
        <>
          <h2>Lưu ý đặc biệt</h2>
          <div className="avoid" style={{ border: '1.5px solid #b93a4e', borderRadius: 6, padding: 8, background: '#fdf3f4', whiteSpace: 'pre-line' }}>
            {c.specialNotes}
            {c.specialNotes && c.customer.notes ? '\n' : ''}
            {c.customer.notes ? `Yêu cầu khách: ${c.customer.notes}` : ''}
          </div>
        </>
      )}
      <h2>Tài chính</h2>
      <TotalsTable t={c.financials} vatBps={ev.vatBps} serviceChargeBps={ev.serviceChargeBps} />
      {c.financials.deposits.length > 0 && (
        <table className="avoid" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>Đợt thanh toán</th>
              <th>Hạn</th>
              <th className="num">Số tiền</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {c.financials.deposits.map((d, i) => (
              <tr key={i}>
                <td>{d.label}</td>
                <td>{dateLabel(d.dueDate, false)}</td>
                <td className="num">{moneyPlain(d.amount)}</td>
                <td>{({ DUE: 'Chờ thu', PAID: 'Đã thu', OVERDUE: 'Quá hạn', WAIVED: 'Miễn' } as Record<string, string>)[d.status] ?? d.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Signatures roles={['Bếp trưởng', 'Phục vụ', 'Kỹ thuật', 'Kho', 'Quản lý tiệc']} />
    </article>
  );
}
