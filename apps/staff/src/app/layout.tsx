import type { Metadata, Viewport } from 'next';
import { Be_Vietnam_Pro } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

// Phông chữ thiết kế cho tiếng Việt: dấu rõ, dễ đọc trên tablet ở khoảng cách xa
const beVietnam = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-be-vietnam',
  display: 'swap',
});

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
    <html lang="vi" className={beVietnam.variable}>
      <body className="min-h-full font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
