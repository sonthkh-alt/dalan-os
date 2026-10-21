import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'DaLan OS – Nhân viên',
    short_name: 'DaLan OS',
    description: 'Ứng dụng vận hành Nhà hàng Dạ Lan',
    start_url: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#faf7f5',
    theme_color: '#7f2233',
    lang: 'vi',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
