import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'DaLan OS – Nhân viên',
  description: 'Ứng dụng vận hành Nhà hàng Dạ Lan: sơ đồ bàn, gọi món, bếp, thu ngân',
  applicationName: 'DaLan OS',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'DaLan OS' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#7f2233',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-full antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
