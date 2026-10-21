import { Section } from '../components/Layout';
import { Divider, HeroRosette, OrchidMark } from '../components/Ornament';
import { ItemPrice } from '../components/Price';
import { BRANCH_SLUGS, signatureItems, totalItems } from '../data/menu';
import { awards, history, PRICE_DATE, services, SLOGAN, venues } from '../data/restaurant';
import { href, scrollToId } from '../router';

export function HomePage() {
  return (
    <>
      <Hero />
      <Stats />
      <Section id="lich-su" eyebrow="Từ năm 2000" title="Hơn hai mươi năm giữ hồn món Thanh">
        <div className="grid gap-10 lg:grid-cols-[3fr_2fr]">
          <ol className="relative space-y-6 border-l-2 border-maroon-soft pl-6">
            {history.map((h) => (
              <li key={h.period} className="relative">
                <span
                  className="absolute -left-[33px] top-1.5 h-4 w-4 rounded-full border-2 border-maroon bg-cream"
                  aria-hidden="true"
                />
                <p className="font-display text-lg font-bold text-maroon">{h.period}</p>
                <p className="text-ink-soft">{h.text}</p>
              </li>
            ))}
          </ol>
          <div className="rounded-[var(--radius-card)] border border-gold/30 bg-gold-soft/60 p-6">
            <h3 className="font-display text-2xl font-bold text-ink">Giải thưởng</h3>
            <ul className="mt-4 space-y-3">
              {awards.map((a) => (
                <li key={a} className="flex gap-3">
                  <svg
                    viewBox="0 0 20 20"
                    className="mt-1 h-4 w-4 shrink-0 text-gold-dark"
                    aria-hidden="true"
                    fill="currentColor"
                  >
                    <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9z" />
                  </svg>
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section id="co-so" eyebrow="Ba cơ sở tại TP. Thanh Hóa" title="Ghé Dạ Lan">
        <ul className="grid gap-5 md:grid-cols-3">
          {venues.map((v) => (
            <li
              key={v.code}
              className="flex flex-col rounded-[var(--radius-card)] border border-line bg-paper p-6 shadow-sm"
            >
              <h3 className="font-display text-2xl font-bold text-maroon">{v.name}</h3>
              <p className="mt-1 text-sm text-ink-soft">{v.tagline}</p>
              <dl className="mt-4 space-y-2 text-sm">
                <div>
                  <dt className="font-semibold text-ink">Địa chỉ</dt>
                  <dd className="text-ink-soft">{v.address}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-ink">Điện thoại</dt>
                  <dd className="flex flex-wrap gap-x-3">
                    {v.phones.map((p) => (
                      <a
                        key={p.tel}
                        href={`tel:${p.tel}`}
                        className="font-medium text-maroon underline underline-offset-2"
                      >
                        {p.label}
                      </a>
                    ))}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-ink">Sức chứa</dt>
                  <dd className="text-ink-soft">{v.capacity}</dd>
                </div>
              </dl>
              <ul className="mb-6 mt-4 flex flex-wrap gap-2">
                {v.highlights.map((h) => (
                  <li
                    key={h}
                    className="rounded-full bg-cream-dark px-3 py-1 text-xs text-ink-soft"
                  >
                    {h}
                  </li>
                ))}
              </ul>
              <a
                href={href.menu(BRANCH_SLUGS[v.code])}
                className="mt-auto inline-flex items-center justify-center rounded-full bg-maroon px-5 py-2.5 text-sm font-semibold text-white hover:bg-maroon-dark"
              >
                Xem thực đơn
              </a>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="mon-dac-san" eyebrow="Gợi ý từ bếp" title="Món đặc sản của nhà">
        <ul className="grid gap-x-10 gap-y-1 sm:grid-cols-2">
          {signatureItems.map(({ item, category }) => (
            <li
              key={`${category.code}-${item.name}`}
              className="flex items-baseline gap-2 border-b border-line/70 py-3"
            >
              <span className="min-w-0">
                <span className="font-medium text-ink">{item.name}</span>
                <span className="block text-xs text-ink-muted">{category.name}</span>
              </span>
              <span className="leader" aria-hidden="true" />
              <span className="shrink-0 text-sm">
                <ItemPrice item={item} />
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-ink-muted">
          Giá lấy từ thực đơn trên website nhà hàng ngày {PRICE_DATE}, có thể thay đổi.
        </p>
      </Section>

      <Section id="dich-vu" eyebrow="Dịch vụ" title="Từ bữa sáng tới tiệc cưới">
        <ul className="grid gap-5 sm:grid-cols-2">
          {services.map((s) => (
            <li
              key={s.title}
              className="rounded-[var(--radius-card)] border border-line bg-paper p-6"
            >
              <h3 className="font-display text-xl font-bold text-ink">{s.title}</h3>
              <p className="text-xs font-semibold uppercase tracking-wider text-gold-dark">
                {s.where}
              </p>
              <p className="mt-3 text-ink-soft">{s.text}</p>
              {s.menuLink && (
                <a
                  href={href.menu(s.menuLink.branch)}
                  className="mt-3 inline-block font-medium text-maroon underline underline-offset-2"
                >
                  {s.menuLink.label}
                </a>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <section className="mx-auto mt-16 max-w-6xl px-4">
        <div className="relative overflow-hidden rounded-[var(--radius-card)] bg-ink p-8 text-cream sm:p-10">
          <HeroRosette className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 text-gold/20" />
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-soft">
            Phần mềm DaLan OS
          </p>
          <h2 className="mt-2 max-w-2xl font-display text-3xl font-bold">
            Gọi món bằng QR, bếp nhận phiếu tức thì, thanh toán VietQR
          </h2>
          <p className="mt-3 max-w-2xl text-cream/80">
            Hệ thống quản lý và đặt món xây riêng cho Dạ Lan: từ bàn ăn, bếp, thu ngân tới tiệc
            cưới, kho và báo cáo.
          </p>
          <a
            href={href.system}
            className="mt-6 inline-flex rounded-full bg-gold-soft px-5 py-2.5 font-semibold text-ink hover:bg-white"
          >
            Tìm hiểu hệ thống
          </a>
        </div>
      </section>
    </>
  );
}

function Hero() {
  return (
    <section className="pattern-dots relative overflow-hidden border-b border-line">
      <HeroRosette className="pointer-events-none absolute -right-24 top-1/2 h-[28rem] w-[28rem] -translate-y-1/2 text-maroon/15 sm:-right-10" />
      <div className="relative mx-auto max-w-6xl px-4 py-16 sm:py-24">
        <OrchidMark className="h-12 w-12 text-maroon" />
        <p className="mt-4 text-sm font-semibold uppercase tracking-[0.25em] text-gold-dark">
          Thanh Hóa · từ năm 2000
        </p>
        <h1 className="mt-2 font-display text-5xl font-bold leading-tight text-ink sm:text-7xl">
          Nhà hàng <span className="text-maroon">Dạ Lan</span>
        </h1>
        <p className="mt-3 font-display text-2xl italic text-ink-soft sm:text-3xl">{SLOGAN}</p>
        <Divider className="mt-6 max-w-sm" />
        <p className="mt-6 max-w-xl text-lg text-ink-soft">
          Ba cơ sở Center, Star và Event phục vụ gọi món, ăn sáng, cơm văn phòng, tiệc cưới và sự
          kiện, với những món quê xứ Thanh như nem Dạ Lan, vịt Cổ Lũng, gỏi cá nhệch, bánh lá răng
          bừa.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href={href.menu('center')}
            className="rounded-full bg-maroon px-6 py-3 font-semibold text-white shadow-sm hover:bg-maroon-dark"
          >
            Xem thực đơn
          </a>
          <button
            type="button"
            onClick={() => scrollToId('co-so')}
            className="rounded-full border border-maroon/40 bg-paper px-6 py-3 font-semibold text-maroon hover:bg-maroon-soft"
          >
            Địa chỉ và điện thoại
          </button>
        </div>
      </div>
    </section>
  );
}

function Stats() {
  const stats = [
    { value: '2000', label: 'năm thành lập' },
    { value: '3', label: 'cơ sở tại TP. Thanh Hóa' },
    { value: '1.100', label: 'khách, sức chứa Dạ Lan Event' },
    { value: String(totalItems), label: 'món trong thực đơn số' },
  ];
  return (
    <div className="border-b border-line bg-paper">
      <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-y-6 px-4 py-8 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <dt className="sr-only">{s.label}</dt>
            <dd className="font-display text-3xl font-bold text-maroon sm:text-4xl">{s.value}</dd>
            <dd className="mt-1 text-sm text-ink-soft" aria-hidden="true">
              {s.label}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
