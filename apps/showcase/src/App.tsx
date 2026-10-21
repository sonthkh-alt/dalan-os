import { useEffect } from 'react';
import { Footer, Header } from './components/Layout';
import { branchFromSlug } from './data/menu';
import { HomePage } from './pages/HomePage';
import { MenuPage } from './pages/MenuPage';
import { SystemPage } from './pages/SystemPage';
import { href, navigate, useHashRoute } from './router';

export function App() {
  const route = useHashRoute();
  const branch = route.name === 'menu' ? branchFromSlug(route.branch) : undefined;

  // Hash lạ (hoặc mã cơ sở không tồn tại) quay về trang hợp lệ gần nhất, thay vì trang trắng.
  const invalid = route.name === 'notFound' || (route.name === 'menu' && !branch);
  useEffect(() => {
    if (route.name === 'notFound') navigate(href.home, true);
    else if (route.name === 'menu' && !branch) navigate(href.menu('center'), true);
  }, [route, branch]);

  // Mỗi lần đổi trang thì lên đầu trang.
  const pageKey = route.name === 'menu' ? `menu-${route.branch}` : route.name;
  useEffect(() => {
    window.scrollTo(0, 0);
    if (route.name === 'home' || route.name === 'notFound')
      document.title = 'Nhà hàng Dạ Lan · Tinh hoa ẩm thực xứ Thanh';
  }, [pageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const active = invalid ? 'home' : route.name;

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#noi-dung"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('noi-dung')?.focus();
        }}
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded focus:bg-paper focus:px-3 focus:py-2"
      >
        Bỏ qua tới nội dung
      </a>
      <Header active={active} />
      <main id="noi-dung" tabIndex={-1} className="flex-1 outline-none">
        {route.name === 'menu' && branch ? (
          <MenuPage branch={branch} />
        ) : route.name === 'system' ? (
          <SystemPage />
        ) : (
          <HomePage />
        )}
      </main>
      <Footer />
    </div>
  );
}
