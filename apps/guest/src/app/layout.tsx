import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { QueryProvider } from '@/lib/query-provider';
import { Header } from '@/components/Header';
import { BottomNav } from '@/components/BottomNav';
import { SwRegister } from '@/components/SwRegister';
import { Toaster } from '@/components/ui';
import './globals.css';

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
    <html lang={locale}>
      <body className="min-h-dvh bg-cream text-ink">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <QueryProvider>
            <SwRegister />
            <Header />
            <main className="mx-auto w-full max-w-lg px-4 pt-3 pb-36">{children}</main>
            <BottomNav />
            <Toaster />
          </QueryProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
