import { useEffect, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  AnimationRoutes,
  App as ZaloApp,
  BottomNavigation,
  Icon,
  Route,
  ZMPRouter,
  useLocation,
  useNavigate,
} from 'zmp-ui';
import { ApiError } from './lib/api';
import { useGuestSession, isSessionValid } from './lib/session-store';
import { tokenFromParams } from './lib/table-token';
import { getStartParams } from './lib/zalo';
import { Toaster } from './components/ui';
import { HomePage } from './pages/HomePage';
import { MenuIndexPage, MenuPage } from './pages/MenuPage';
import { TablePage } from './pages/TablePage';
import { JoinTablePage } from './pages/JoinTablePage';
import { TableOrdersPage } from './pages/TableOrdersPage';
import { TableBillPage } from './pages/TableBillPage';
import { ReservePage } from './pages/ReservePage';
import { AccountPage } from './pages/AccountPage';
import { BanquetPage } from './pages/BanquetPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) =>
        !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
});

const NAV = [
  { key: '/', label: 'Trang chủ', icon: 'zi-home' },
  { key: '/menu', label: 'Thực đơn', icon: 'zi-list-1' },
  { key: '/table', label: 'Gọi món', icon: 'zi-qrline' },
  { key: '/reserve', label: 'Đặt bàn', icon: 'zi-calendar' },
  { key: '/account', label: 'Tài khoản', icon: 'zi-user-circle' },
] as const;

function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;
  const active = path.startsWith('/q/')
    ? '/table'
    : (NAV.slice(1).find((n) => path.startsWith(n.key))?.key ?? (path === '/' ? '/' : ''));
  return (
    <BottomNavigation
      fixed
      activeKey={active}
      onChange={(key) => navigate(key, { animate: false, replace: true })}
    >
      {NAV.map((n) => (
        <BottomNavigation.Item key={n.key} label={n.label} icon={<Icon icon={n.icon} />} />
      ))}
    </BottomNavigation>
  );
}

/**
 * Mở Mini App từ QR bàn: https://zalo.me/s/<APP_ID>/?qr=<token> → vào bàn.
 * Nếu đã có phiên còn hạn của cùng mã QR thì vào thẳng trang gọi món.
 */
function StartParamHandler() {
  const navigate = useNavigate();
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    void getStartParams().then((params) => {
      const token = tokenFromParams(params);
      if (!token) return;
      const s = useGuestSession.getState();
      if (isSessionValid(s) && s.qrToken === token) navigate('/table', { animate: false });
      else navigate(`/table/join/${encodeURIComponent(token)}`, { animate: false });
    });
  }, [navigate]);
  return null;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ZaloApp>
        <ZMPRouter>
          <StartParamHandler />
          <AnimationRoutes>
            <Route path="/" element={<HomePage />} />
            <Route path="/menu" element={<MenuIndexPage />} />
            <Route path="/menu/:branchCode" element={<MenuPage />} />
            <Route path="/table" element={<TablePage />} />
            <Route path="/table/join/:token" element={<JoinTablePage />} />
            <Route path="/q/:token" element={<JoinTablePage />} />
            <Route path="/table/orders" element={<TableOrdersPage />} />
            <Route path="/table/bill" element={<TableBillPage />} />
            <Route path="/reserve" element={<ReservePage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="/banquet" element={<BanquetPage />} />
            <Route path="*" element={<HomePage />} />
          </AnimationRoutes>
          <BottomNav />
          <Toaster />
        </ZMPRouter>
      </ZaloApp>
    </QueryClientProvider>
  );
}
