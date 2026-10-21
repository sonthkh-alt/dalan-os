import type { Metadata, Viewport } from 'next';
import { Be_Vietnam_Pro, Playfair_Display } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { QueryProvider } from '@/lib/query-provider';
import { Header } from '@/components/Header';
import { BottomNav } from '@/components/BottomNav';
import { AppMain } from '@/components/AppMain';
import { NavTracker } from '@/components/NavTracker';
import { SwRegister } from '@/components/SwRegister';
import { Toaster } from '@/components/ui';
import './globals.css';

const beVietnam = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-be-vietnam',
  display: 'swap',
});

const playfair = Playfair_Display({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-playfair',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Dạ Lan – Gọi món tại bàn', template: '%s · Dạ Lan' },
  description: 'Thực đơn, gọi món, thanh toán và đặt bàn tại Nhà hàng Dạ Lan, Thanh Hóa.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Dạ Lan' },
};

export const viewport: Viewport = {
  themeColor: '#8b1e2d',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale} className={`${beVietnam.variable} ${playfair.variable}`}>
      <body className="min-h-dvh bg-cream font-sans text-ink">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <QueryProvider>
            <NavTracker />
            <SwRegister />
            <Header />
            <AppMain>{children}</AppMain>
            <BottomNav />
            <Toaster />
          </QueryProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
