import { useEffect } from 'react';
import { Section } from '../components/Layout';
import { HeroRosette } from '../components/Ornament';
import { DOCS_URL, REPO_URL } from '../data/restaurant';
import { totalItems } from '../data/menu';
import { href } from '../router';

interface Feature {
  title: string;
  text: string;
}

const guestFeatures: Feature[] = [
  {
    title: 'Gọi món bằng QR tại bàn',
    text: 'Quét mã trên bàn, xem thực đơn song ngữ có ảnh, cả nhóm cùng gọi món, theo dõi món đang làm và gọi nhân viên. Không cần tài khoản.',
  },
  {
    title: 'Thanh toán VietQR',
    text: 'Mã VietQR động in sẵn số tiền và nội dung, tự đối soát khi tiền về. Hỗ trợ cả tiền mặt, thẻ, Apple Pay qua máy POS, VNPay, MoMo, ZaloPay.',
  },
  {
    title: 'Hóa đơn điện tử',
    text: 'Hóa đơn khởi tạo từ máy tính tiền theo Nghị định 70/2025, phát hành qua MISA, Viettel hoặc VNPT; khách nhận và tra cứu ngay.',
  },
  {
    title: 'Đặt bàn online',
    text: 'Đặt bàn hoặc phòng VIP theo khung giờ và sức chứa, đặt cọc khi cần, xác nhận và nhắc lịch qua Zalo.',
  },
  {
    title: 'Thành viên và tích điểm',
    text: 'Đăng nhập bằng số điện thoại hoặc Zalo, tích điểm, hạng thành viên, voucher, ưu đãi sinh nhật.',
  },
  {
    title: 'Zalo Mini App',
    text: 'Thực đơn, đặt bàn, gọi món tại bàn, điểm thưởng và yêu cầu báo giá tiệc ngay trong Zalo.',
  },
];

const staffFeatures: Feature[] = [
  {
    title: 'Sơ đồ bàn và gọi món',
    text: 'Mở bàn, gọi món nhiều đợt, gộp, tách, chuyển bàn; món theo cân, giá theo thời điểm, tùy chọn chế biến bắt buộc.',
  },
  {
    title: 'Màn hình bếp (KDS)',
    text: 'Phiếu tự định tuyến tới đúng trạm (bếp nóng, nướng, hải sản, bar...), tô màu theo thời gian chờ, báo xong và báo hết món.',
  },
  {
    title: 'Thu ngân và kết ca',
    text: 'Tạm tính, chia bill, giảm giá có duyệt, phí phục vụ, VAT, đếm vỏ chai, kết ca và đối soát.',
  },
  {
    title: 'Tiệc cưới, sự kiện, BEO',
    text: 'Lead, báo giá theo mâm, hợp đồng, lịch đặt cọc, chốt số mâm, phiếu điều hành sự kiện (BEO) và lịch sảnh.',
  },
  {
    title: 'Kho và định lượng',
    text: 'Nguyên liệu, định lượng theo món, nhập hàng, chuyển kho, kiểm kê, hao hụt, cảnh báo tồn và giá vốn.',
  },
  {
    title: 'Báo cáo và quản trị',
    text: 'Doanh thu theo cơ sở, ca, món, bếp, đặt bàn, tiệc; xuất Excel, nhật ký thao tác, phân quyền theo vai trò.',
  },
  {
    title: 'Cầu in tại cơ sở',
    text: 'Dịch vụ in cục bộ cho máy in bếp và máy in hóa đơn ESC/POS tiếng Việt, vẫn in được khi mất Internet.',
  },
];

const stack: { group: string; items: string[] }[] = [
  {
    group: 'Ngôn ngữ và công cụ',
    items: ['TypeScript', 'pnpm workspace', 'Turborepo', 'Vitest', 'Playwright'],
  },
  { group: 'Máy chủ', items: ['Node.js 24', 'NestJS 12 + Fastify', 'Socket.IO', 'BullMQ'] },
  { group: 'Dữ liệu', items: ['PostgreSQL 18', 'Prisma 7', 'Redis 8'] },
  {
    group: 'Giao diện',
    items: ['Next.js 16 PWA', 'React 19', 'Tailwind CSS 4', 'Zalo Mini App (zmp-ui)'],
  },
  { group: 'Hạ tầng', items: ['Docker Compose', 'GitHub Actions', 'GitHub Pages (trang này)'] },
];

const principles = [
  'Không bao giờ mất đơn: ghi lệnh cục bộ trước, gửi lên máy chủ sau, mỗi lệnh có khóa chống trùng.',
  'Một phiên bàn gom mọi hành động của khách và nhân viên trong một lượt ngồi.',
  'Tiếng Việt là ngôn ngữ gốc của dữ liệu, giao diện, mẫu in và thông báo.',
  'Đúng luật Việt Nam từ đầu: hóa đơn điện tử, VAT, lưu vết, bảo vệ dữ liệu cá nhân (NĐ 13/2023).',
  'Đa cơ sở ngay từ mô hình dữ liệu: thực đơn gốc toàn công ty, mỗi cơ sở tùy biến.',
];

export function SystemPage() {
  useEffect(() => {
    document.title = 'Hệ thống DaLan OS · Nhà hàng Dạ Lan';
  }, []);

  return (
    <>
      <section className="relative overflow-hidden bg-ink text-cream">
        <HeroRosette className="pointer-events-none absolute -right-20 -top-10 h-80 w-80 text-gold/15" />
        <div className="relative mx-auto max-w-6xl px-4 py-14 sm:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold-soft">
            Phần mềm nhà hàng
          </p>
          <h1 className="mt-2 font-display text-4xl font-bold sm:text-6xl">DaLan OS</h1>
          <p className="mt-4 max-w-2xl text-lg text-cream/85">
            Một hệ thống duy nhất cho cả khách và nhà hàng tại ba cơ sở Dạ Lan: gọi món tại bàn,
            bếp, thu ngân, đặt bàn, thành viên, tiệc cưới, kho và báo cáo, đúng quy định và thói
            quen thanh toán tại Việt Nam.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-gold-soft px-6 py-3 font-semibold text-ink hover:bg-white"
            >
              Mã nguồn trên GitHub
            </a>
            <a
              href={DOCS_URL}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-cream/40 px-6 py-3 font-semibold text-cream hover:bg-cream/10"
            >
              Tài liệu đặc tả (docs/)
            </a>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 pt-8">
        <div
          className="rounded-[var(--radius-card)] border border-warn/30 bg-warn-soft p-5 text-ink"
          role="note"
        >
          <p className="font-semibold text-warn">Trang này là bản trình diễn tĩnh</p>
          <p className="mt-1 text-sm text-ink-soft">
            Website bạn đang xem chạy trên GitHub Pages, không có máy chủ, cơ sở dữ liệu hay thanh
            toán thật. Phần{' '}
            <a
              href={href.menu('center')}
              className="font-medium text-maroon underline underline-offset-2"
            >
              thực đơn
            </a>{' '}
            đọc trực tiếp {totalItems} món từ dữ liệu mẫu trong kho mã. Hệ thống DaLan OS đầy đủ
            (API, ứng dụng nhân viên, gọi món QR, thanh toán, in bếp) cần được triển khai trên máy
            chủ riêng của nhà hàng cùng PostgreSQL và Redis.
          </p>
        </div>
      </div>

      <Section id="cho-khach" eyebrow="Cho khách hàng" title="Gọi món, thanh toán, đặt bàn">
        <FeatureGrid features={guestFeatures} />
      </Section>

      <Section id="cho-nha-hang" eyebrow="Cho nhà hàng" title="Từ bàn ăn tới bếp, kho và báo cáo">
        <FeatureGrid features={staffFeatures} />
      </Section>

      <Section id="kien-truc" eyebrow="Kiến trúc" title="Các thành phần kết nối với nhau thế nào">
        <Architecture />
      </Section>

      <Section id="cong-nghe" eyebrow="Công nghệ" title="Ngăn xếp công nghệ">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stack.map((s) => (
            <div
              key={s.group}
              className="rounded-[var(--radius-card)] border border-line bg-paper p-5"
            >
              <h3 className="text-sm font-semibold uppercase tracking-wider text-gold-dark">
                {s.group}
              </h3>
              <ul className="mt-3 flex flex-wrap gap-2">
                {s.items.map((i) => (
                  <li key={i} className="rounded-full bg-cream-dark px-3 py-1 text-sm text-ink">
                    {i}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section id="nguyen-tac" eyebrow="Nguyên tắc thiết kế" title="Viết cho nhà hàng thật">
        <ol className="grid gap-3 sm:grid-cols-2">
          {principles.map((p, i) => (
            <li key={p} className="flex gap-3 rounded-xl bg-paper p-4 ring-1 ring-line">
              <span className="font-display text-2xl font-bold leading-none text-maroon">
                {i + 1}
              </span>
              <span className="text-ink-soft">{p}</span>
            </li>
          ))}
        </ol>
        <p className="mt-8 text-ink-soft">
          Đọc thêm:{' '}
          <a
            href={`${REPO_URL}/blob/main/docs/spec/00-tong-quan-va-pham-vi.md`}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-maroon underline underline-offset-2"
          >
            đặc tả tổng quan
          </a>
          ,{' '}
          <a
            href={`${REPO_URL}/tree/main/docs/architecture`}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-maroon underline underline-offset-2"
          >
            kiến trúc và ADR
          </a>
          ,{' '}
          <a
            href={`${REPO_URL}/blob/main/README.md`}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-maroon underline underline-offset-2"
          >
            hướng dẫn chạy thử
          </a>
          .
        </p>
      </Section>
    </>
  );
}

function FeatureGrid({ features }: { features: Feature[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {features.map((f) => (
        <li key={f.title} className="rounded-[var(--radius-card)] border border-line bg-paper p-5">
          <h3 className="font-semibold text-ink">{f.title}</h3>
          <p className="mt-1.5 text-sm text-ink-soft">{f.text}</p>
        </li>
      ))}
    </ul>
  );
}

function Box({
  title,
  sub,
  tone = 'paper',
}: {
  title: string;
  sub: string;
  tone?: 'paper' | 'maroon' | 'ink';
}) {
  const cls =
    tone === 'maroon'
      ? 'bg-maroon text-white border-maroon'
      : tone === 'ink'
        ? 'bg-ink text-cream border-ink'
        : 'bg-paper text-ink border-line';
  return (
    <div className={`rounded-xl border px-4 py-3 ${cls}`}>
      <p className="font-semibold">{title}</p>
      <p className={`text-xs ${tone === 'paper' ? 'text-ink-soft' : 'opacity-80'}`}>{sub}</p>
    </div>
  );
}

function Arrow({ label }: { label: string }) {
  return (
    <div
      className="flex items-center justify-center gap-2 py-2 text-xs font-medium text-ink-muted"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 12 28"
        className="h-7 w-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M6 1v25M1.5 21.5 6 26l4.5-4.5M1.5 6.5 6 2l4.5 4.5" />
      </svg>
      {label}
    </div>
  );
}

/** Sơ đồ kiến trúc bằng CSS: các tầng xếp dọc, tự co trên điện thoại. */
function Architecture() {
  return (
    <figure className="rounded-[var(--radius-card)] border border-line bg-cream-dark/50 p-4 sm:p-6">
      <figcaption className="sr-only">
        Sơ đồ: ứng dụng khách, Zalo Mini App và ứng dụng nhân viên gọi API DaLan OS qua HTTPS và
        Socket.IO; API lưu dữ liệu vào PostgreSQL và Redis, kết nối cổng thanh toán, hóa đơn điện
        tử, Zalo; cầu in tại cơ sở nhận lệnh in từ API và in ra máy in ESC/POS.
      </figcaption>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
        Thiết bị người dùng
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Box title="Ứng dụng khách" sub="PWA song ngữ: QR tại bàn, bill, VietQR, đặt bàn" />
        <Box title="Zalo Mini App" sub="Thực đơn, đặt bàn, điểm, yêu cầu tiệc" />
        <Box title="Ứng dụng nhân viên" sub="POS, KDS bếp, thu ngân, lễ tân, quản trị" />
      </div>
      <Arrow label="HTTPS (REST) + Socket.IO thời gian thực" />
      <Box
        tone="maroon"
        title="API DaLan OS"
        sub="NestJS 12 + Fastify · mô-đun thực đơn, bàn, bếp, thanh toán, tiệc, kho · outbox sự kiện, hàng đợi BullMQ"
      />
      <div className="grid gap-3 pt-0 sm:grid-cols-3">
        <div>
          <Arrow label="lưu trữ" />
          <Box
            tone="ink"
            title="PostgreSQL 18 + Redis 8"
            sub="Dữ liệu nghiệp vụ, phiên, hàng đợi, pub/sub"
          />
        </div>
        <div>
          <Arrow label="bộ chuyển đổi tích hợp" />
          <Box
            title="Dịch vụ bên ngoài"
            sub="VietQR, VNPay, MoMo, ZaloPay · HĐĐT MISA / Viettel / VNPT · Zalo ZNS"
          />
        </div>
        <div>
          <Arrow label="lệnh in" />
          <Box
            title="Cầu in tại cơ sở"
            sub="Máy in bếp và hóa đơn ESC/POS tiếng Việt, chạy cả khi mất mạng"
          />
        </div>
      </div>
    </figure>
  );
}
