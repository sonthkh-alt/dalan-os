import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Dạ Lan – Gọi món tại bàn',
    short_name: 'Dạ Lan',
    description: 'Thực đơn, gọi món, thanh toán và đặt bàn tại Nhà hàng Dạ Lan Thanh Hóa',
    start_url: '/',
    display: 'standalone',
    background_color: '#fbf7f0',
    theme_color: '#8b1e2d',
    lang: 'vi',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
