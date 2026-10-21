import { Icon, useNavigate } from 'zmp-ui';
import { PageShell } from '../components/PageShell';
import { Card, SectionTitle, useToast } from '../components/ui';
import { BRANCHES, formatPhone } from '../lib/branches';
import { useCustomer } from '../lib/customer-store';
import { usePublicBranches } from '../lib/queries';
import { isSessionValid, useGuestSession } from '../lib/session-store';
import { extractTableToken } from '../lib/table-token';
import { callPhone, scanQr } from '../lib/zalo';
import { errorMessage } from '../lib/api';

export function HomePage() {
  const navigate = useNavigate();
  const toast = useToast((s) => s.show);
  const profile = useCustomer((s) => s.profile);
  const session = useGuestSession();
  const hasTable = isSessionValid(session);
  const branches = usePublicBranches();

  const startScan = async () => {
    try {
      const content = await scanQr();
      if (!content) return;
      const token = extractTableToken(content);
      if (!token) {
        toast('Mã QR không phải mã bàn của Dạ Lan', 'error');
        return;
      }
      navigate(`/table/join/${encodeURIComponent(token)}`);
    } catch (err) {
      toast(errorMessage(err, 'Không quét được mã QR'), 'error');
    }
  };

  return (
    <PageShell title="Nhà hàng Dạ Lan">
      <div className="space-y-5">
        <div className="rounded-3xl bg-maroon p-5 text-cream shadow-sm">
          <p className="text-xs font-semibold tracking-[0.2em] text-cream/70 uppercase">
            Thanh Hóa · từ 1996
          </p>
          <h2 className="mt-1 font-serif text-2xl font-bold">
            {profile?.fullName ? `Chào ${profile.fullName}!` : 'Kính chào quý khách'}
          </h2>
          <p className="mt-1 text-sm text-cream/85">
            Đặc sản xứ Thanh, hải sản tươi sống, tiệc cưới và sự kiện.
          </p>
          {hasTable ? (
            <button
              type="button"
              onClick={() => navigate('/table')}
              className="mt-4 w-full rounded-xl bg-cream px-4 py-3 text-left font-semibold text-maroon"
            >
              Đang ngồi {session.table?.name} · {session.branch?.name} → tiếp tục gọi món
            </button>
          ) : (
            <button
              type="button"
              onClick={startScan}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-cream px-4 py-3 font-semibold text-maroon"
            >
              <Icon icon="zi-qrline" /> Quét QR trên bàn để gọi món
            </button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <QuickAction icon="zi-list-1" label="Thực đơn" onClick={() => navigate('/menu')} />
          <QuickAction icon="zi-calendar" label="Đặt bàn" onClick={() => navigate('/reserve')} />
          <QuickAction icon="zi-star" label="Đặt tiệc" onClick={() => navigate('/banquet')} />
        </div>

        <section>
          <SectionTitle>Ba cơ sở Dạ Lan</SectionTitle>
          <div className="space-y-3">
            {BRANCHES.map((b) => {
              const live = branches.data?.find((x) => x.code === b.code);
              const hours = live?.openingHours?.default;
              return (
                <Card key={b.code}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-base font-bold text-ink">{b.name}</h3>
                      <p className="mt-0.5 text-sm text-ink-soft">{live?.address ?? b.address}</p>
                    </div>
                    {hours ? (
                      <span className="shrink-0 rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-success">{`${hours.from}–${hours.to}`}</span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-ink">{b.highlight}</p>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-sm font-semibold">
                    <button
                      type="button"
                      onClick={() => navigate(`/menu/${b.code}`)}
                      className="rounded-xl bg-maroon-soft py-2 text-maroon"
                    >
                      Thực đơn
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(`/reserve?branch=${b.code}`)}
                      className="rounded-xl bg-maroon-soft py-2 text-maroon"
                    >
                      Đặt bàn
                    </button>
                    <button
                      type="button"
                      onClick={() => void callPhone(live?.phone ?? b.phone)}
                      className="rounded-xl bg-cream-dark py-2 text-ink"
                      aria-label={`Gọi ${formatPhone(b.phone)}`}
                    >
                      Gọi điện
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      </div>
    </PageShell>
  );
}

function QuickAction({
  icon,
  label,
  onClick,
}: {
  icon: 'zi-list-1' | 'zi-calendar' | 'zi-star';
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-2xl border border-line bg-paper py-4 text-sm font-semibold text-ink active:scale-[0.98]"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-maroon-soft text-maroon">
        <Icon icon={icon} />
      </span>
      {label}
    </button>
  );
}
