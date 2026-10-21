import { useEffect, useState } from 'react';

// Định tuyến bằng hash (#/...) để liên kết sâu chạy được trên GitHub Pages mà không cần rewrite phía máy chủ.

export type Route =
  | { name: 'home' }
  | { name: 'menu'; branch: string }
  | { name: 'system' }
  | { name: 'notFound'; path: string };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/[?].*$/, '') || '/';
  const parts = path
    .split('/')
    .filter(Boolean)
    .map((p) => decodeURIComponent(p).toLowerCase());
  if (parts.length === 0) return { name: 'home' };
  if (parts[0] === 'thuc-don' && parts.length <= 2)
    return { name: 'menu', branch: parts[1] ?? 'center' };
  if (parts[0] === 'he-thong' && parts.length === 1) return { name: 'system' };
  return { name: 'notFound', path };
}

export const href = {
  home: '#/',
  menu: (branch: string) => `#/thuc-don/${branch}`,
  system: '#/he-thong',
};

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(to: string, replace = false): void {
  if (replace) {
    window.history.replaceState(null, '', to);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = to.replace(/^#/, '');
  }
}

/** Cuộn tới một phần tử trong trang mà không đổi hash (hash đã dùng cho định tuyến). */
export function scrollToId(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}
