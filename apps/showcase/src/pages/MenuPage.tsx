import { useEffect, useMemo, useRef, useState } from 'react';
import { ItemPrice } from '../components/Price';
import {
  BRANCH_SLUGS,
  FILTERS,
  MENU_KIND_LABEL,
  branches,
  categoriesForMenu,
  describeSchedule,
  isServingNow,
  itemInMenu,
  itemMatches,
  menuKind,
  menusForBranch,
  type FilterKey,
  type MenuKind,
  type SeedBranch,
  type SeedCategory,
  type SeedItem,
} from '../data/menu';
import { PRICE_DATE, venues } from '../data/restaurant';
import { href, scrollToId } from '../router';

const MENU_TAB_LABEL: Record<MenuKind, string> = {
  alacarte: 'Chọn món',
  breakfast: 'Ăn sáng',
  lunch: 'Cơm văn phòng',
  drinks: 'Đồ uống',
};

const VN_CLOCK = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'long',
});

/** Đồng hồ cập nhật mỗi 30 giây để nhãn "đang phục vụ" luôn đúng. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export function MenuPage({ branch }: { branch: SeedBranch }) {
  const now = useNow();
  const branchMenus = useMemo(() => menusForBranch(branch.code), [branch.code]);
  const [kind, setKind] = useState<MenuKind>('alacarte');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Set<FilterKey>>(() => new Set());

  // Giữ loại thực đơn khi đổi cơ sở; nếu cơ sở mới không có thì quay về thực đơn chọn món.
  const menu = branchMenus.find((m) => menuKind(m.code) === kind) ?? branchMenus[0];
  const venue = venues.find((v) => v.code === branch.code);

  const sections = useMemo(() => {
    if (!menu) return [];
    return categoriesForMenu(menu.code)
      .map((category) => ({
        category,
        items: category.items.filter(
          (item) => itemInMenu(item, menu.code) && itemMatches(item, category, query, filters),
        ),
      }))
      .filter((s) => s.items.length > 0);
  }, [menu, query, filters]);

  const resultCount = sections.reduce((n, s) => n + s.items.length, 0);
  const hasCriteria = query.trim() !== '' || filters.size > 0;

  useEffect(() => {
    document.title = `Thực đơn ${branch.name} · Nhà hàng Dạ Lan`;
  }, [branch.name]);

  const toggleFilter = (key: FilterKey) =>
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const clearAll = () => {
    setQuery('');
    setFilters(new Set());
  };

  return (
    <div className="pb-8">
      <div className="border-b border-line bg-paper">
        <div className="mx-auto max-w-4xl px-4 pb-5 pt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-dark">
            Thực đơn số
          </p>
          <h1 className="mt-1 font-display text-4xl font-bold text-ink">{branch.name}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {branch.address}
            {venue?.phones[0] && (
              <>
                {' · '}
                <a
                  href={`tel:${venue.phones[0].tel}`}
                  className="font-medium text-maroon underline underline-offset-2"
                >
                  {venue.phones[0].label}
                </a>
              </>
            )}
          </p>

          <nav aria-label="Chọn cơ sở" className="mt-5">
            <ul className="flex flex-wrap gap-2">
              {branches.map((b) => {
                const active = b.code === branch.code;
                return (
                  <li key={b.code}>
                    <a
                      href={href.menu(BRANCH_SLUGS[b.code])}
                      aria-current={active ? 'page' : undefined}
                      className={`inline-block rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                        active
                          ? 'border-maroon bg-maroon text-white'
                          : 'border-line bg-cream text-ink-soft hover:border-maroon/50 hover:text-maroon'
                      }`}
                    >
                      {b.name.replace('Dạ Lan ', '')}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div
            role="group"
            aria-label="Chọn thực đơn"
            className="mt-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"
          >
            {branchMenus.map((m) => {
              const k = menuKind(m.code);
              const active = m.code === menu?.code;
              const scheduled = m.availability !== null;
              const serving = isServingNow(m.availability, now);
              return (
                <button
                  key={m.code}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setKind(k)}
                  className={`rounded-xl border px-4 py-2 text-left transition-colors ${
                    active
                      ? 'border-maroon bg-maroon-soft'
                      : 'border-line bg-paper hover:border-maroon/40'
                  }`}
                >
                  <span className={`block font-semibold ${active ? 'text-maroon' : 'text-ink'}`}>
                    {MENU_TAB_LABEL[k]}
                  </span>
                  {scheduled ? (
                    <>
                      <span
                        className={`mt-0.5 flex items-center gap-1.5 text-xs font-medium ${serving ? 'text-success' : 'text-ink-soft'}`}
                      >
                        <span
                          className={`h-2 w-2 rounded-full ${serving ? 'bg-success' : 'bg-ink-muted/60'}`}
                          aria-hidden="true"
                        />
                        {serving ? 'Đang phục vụ' : 'Ngoài giờ'}
                      </span>
                      <span className="block text-xs text-ink-muted">
                        {m.availability?.from}–{m.availability?.to}
                      </span>
                    </>
                  ) : (
                    <span className="mt-0.5 block text-xs text-ink-soft">Theo giờ mở cửa</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {menu && (
        <ServingBanner
          label={MENU_KIND_LABEL[menuKind(menu.code)]}
          schedule={menu.availability}
          now={now}
        />
      )}

      <div className="mx-auto max-w-4xl px-4 pt-5">
        <label htmlFor="menu-search" className="sr-only">
          Tìm món
        </label>
        <div className="relative">
          <svg
            viewBox="0 0 20 20"
            className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="9" cy="9" r="6" />
            <path d="M14 14l4 4" strokeLinecap="round" />
          </svg>
          <input
            id="menu-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm món, gõ không dấu được (vd: ga ri)"
            autoComplete="off"
            className="w-full rounded-full border border-line bg-paper py-3 pl-11 pr-4 text-base text-ink placeholder:text-ink-muted focus:border-maroon focus:outline-none"
          />
        </div>
        <div role="group" aria-label="Lọc món" className="mt-3 flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => {
            const on = filters.has(f.key);
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={on}
                onClick={() => toggleFilter(f.key)}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  on
                    ? 'border-maroon bg-maroon text-white'
                    : 'border-line bg-paper text-ink-soft hover:border-maroon/40'
                }`}
              >
                {on && <span aria-hidden="true">✓ </span>}
                {f.label}
              </button>
            );
          })}
          {hasCriteria && (
            <button
              type="button"
              onClick={clearAll}
              className="px-2 text-sm font-medium text-maroon underline underline-offset-2"
            >
              Xóa lọc
            </button>
          )}
        </div>
        <p className="mt-3 text-sm text-ink-muted" aria-live="polite">
          {resultCount} món
          {hasCriteria ? ' phù hợp' : ''}
        </p>
      </div>

      {sections.length > 0 && <CategoryChips sections={sections} />}

      <div className="mx-auto max-w-4xl px-4">
        {sections.length === 0 ? (
          <div className="mt-8 rounded-[var(--radius-card)] border border-dashed border-line bg-paper p-8 text-center">
            <p className="font-medium text-ink">Không tìm thấy món phù hợp.</p>
            <p className="mt-1 text-sm text-ink-soft">Thử từ khóa khác hoặc bỏ bớt bộ lọc.</p>
            {hasCriteria && (
              <button
                type="button"
                onClick={clearAll}
                className="mt-4 rounded-full bg-maroon px-5 py-2 text-sm font-semibold text-white"
              >
                Xóa tìm kiếm và bộ lọc
              </button>
            )}
          </div>
        ) : (
          sections.map(({ category, items }) => (
            <CategorySection key={category.code} category={category} items={items} now={now} />
          ))
        )}

        <p className="mt-10 rounded-xl bg-cream-dark px-4 py-3 text-sm text-ink-soft">
          Giá lấy từ ảnh thực đơn trên website nhà hàng (dalan.com.vn) ngày {PRICE_DATE} và có thể
          thay đổi. Món tính theo kg được cân trước khi chế biến; món "giá theo thời điểm" vui lòng
          hỏi nhân viên. Giờ phục vụ tính theo giờ Việt Nam.
        </p>
      </div>
    </div>
  );
}

function ServingBanner({
  label,
  schedule,
  now,
}: {
  label: string;
  schedule: SeedCategory['availability'] | null;
  now: Date;
}) {
  const clock = VN_CLOCK.format(now);
  if (!schedule) {
    return (
      <p className="mx-auto max-w-4xl px-4 pt-4 text-sm text-ink-soft">
        {label}: phục vụ trong giờ mở cửa của cơ sở. Bây giờ là {clock} (giờ Việt Nam).
      </p>
    );
  }
  const serving = isServingNow(schedule, now);
  return (
    <div className="mx-auto max-w-4xl px-4 pt-4">
      <p
        className={`rounded-xl px-4 py-2.5 text-sm ${serving ? 'bg-success-soft text-success' : 'bg-warn-soft text-warn'}`}
        role="status"
      >
        <strong className="font-semibold">{serving ? 'Đang phục vụ' : 'Ngoài giờ phục vụ'}</strong>{' '}
        · {label} phục vụ {describeSchedule(schedule)}. Bây giờ là {clock} (giờ Việt Nam).
      </p>
    </div>
  );
}

function CategoryChips({
  sections,
}: {
  sections: { category: SeedCategory; items: SeedItem[] }[];
}) {
  const [active, setActive] = useState(sections[0]?.category.code ?? '');
  const scroller = useRef<HTMLDivElement>(null);

  // Đánh dấu danh mục đang xem theo vị trí cuộn.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      // Ở cuối trang, các danh mục cuối không cuộn lên tới đỉnh được: giữ chip vừa bấm.
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atBottom && window.scrollY > 0) return;
      let current = sections[0]?.category.code ?? '';
      for (const s of sections) {
        const el = document.getElementById(`cat-${s.category.code}`);
        if (el && el.getBoundingClientRect().top <= 150) current = s.category.code;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [sections]);

  // Giữ chip đang chọn trong tầm nhìn của thanh cuộn ngang.
  useEffect(() => {
    const box = scroller.current;
    const chip = box?.querySelector<HTMLElement>(`[data-cat="${active}"]`);
    if (box && chip)
      box.scrollTo({ left: chip.offsetLeft - box.clientWidth / 2 + chip.clientWidth / 2 });
  }, [active]);

  return (
    <nav
      aria-label="Danh mục món"
      className="sticky top-14 z-20 mt-4 border-y border-line bg-cream/95 backdrop-blur"
    >
      <div
        ref={scroller}
        className="no-scrollbar relative mx-auto flex max-w-4xl gap-2 overflow-x-auto px-4 py-2.5"
      >
        {sections.map(({ category, items }) => {
          const on = category.code === active;
          return (
            <button
              key={category.code}
              type="button"
              data-cat={category.code}
              aria-current={on ? 'true' : undefined}
              onClick={() => {
                setActive(category.code);
                scrollToId(`cat-${category.code}`);
              }}
              className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                on
                  ? 'bg-ink text-cream'
                  : 'bg-paper text-ink-soft ring-1 ring-line hover:text-maroon'
              }`}
            >
              {shortCategoryName(category.name)}{' '}
              <span className={on ? 'text-cream/70' : 'text-ink-muted'}>{items.length}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function shortCategoryName(name: string): string {
  return name.replace(/\s*\(.*\)\s*$/, '');
}

function CategorySection({
  category,
  items,
  now,
}: {
  category: SeedCategory;
  items: SeedItem[];
  now: Date;
}) {
  const serving = category.availability ? isServingNow(category.availability, now) : null;
  return (
    <section
      id={`cat-${category.code}`}
      aria-labelledby={`cat-${category.code}-title`}
      className="pt-8"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b-2 border-maroon/80 pb-2">
        <h2
          id={`cat-${category.code}-title`}
          className="font-display text-2xl font-bold text-maroon"
        >
          {category.name}
        </h2>
        <span className="text-sm text-ink-muted">{items.length} món</span>
        {category.availability && (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${serving ? 'bg-success-soft text-success' : 'bg-cream-dark text-ink-soft'}`}
          >
            {serving ? 'Đang phục vụ' : 'Ngoài giờ'} · {describeSchedule(category.availability)}
          </span>
        )}
      </div>
      {category.note && <p className="mt-2 text-sm italic text-ink-muted">{category.note}</p>}
      <ul>
        {items.map((item, i) => (
          <ItemRow key={`${i}-${item.name}`} item={item} />
        ))}
      </ul>
    </section>
  );
}

function ItemRow({ item }: { item: SeedItem }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 border-b border-line/80 py-3.5">
      <div className="min-w-0">
        <h3 className="font-medium leading-snug text-ink">
          {item.name}
          {item.signature && <Badge tone="gold">Đặc sản</Badge>}
          {item.vegetarian && <Badge tone="green">Chay</Badge>}
          {item.ownBrand && <Badge tone="maroon">Sản phẩm Dạ Lan</Badge>}
        </h3>
        {item.description && <p className="mt-0.5 text-sm text-ink-soft">{item.description}</p>}
        {item.modifiers?.map((m) => (
          <p key={m.name} className="mt-0.5 text-sm text-ink-soft">
            <span className="text-ink-muted">{m.name}:</span> {m.options.join(' · ')}
          </p>
        ))}
        <p className="mt-0.5 text-xs text-ink-muted">Đơn vị: {item.unit}</p>
      </div>
      <div className="pt-0.5 text-right text-[0.95rem]">
        <ItemPrice item={item} />
      </div>
    </li>
  );
}

function Badge({ tone, children }: { tone: 'gold' | 'green' | 'maroon'; children: string }) {
  const cls =
    tone === 'gold'
      ? 'bg-gold-soft text-gold-dark'
      : tone === 'green'
        ? 'bg-success-soft text-success'
        : 'bg-maroon-soft text-maroon';
  return (
    <span
      className={`ml-2 inline-block rounded-full px-2 py-px align-middle text-[0.7rem] font-semibold ${cls}`}
    >
      {children}
    </span>
  );
}
