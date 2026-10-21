import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Bản Docker (máy chủ riêng) dùng output standalone; Render và máy dev chạy "next start" bình thường
  ...(process.env.BUILD_STANDALONE === '1' ? { output: 'standalone' as const, outputFileTracingRoot: path.resolve(process.cwd(), '../..') } : {}),
  reactStrictMode: true,
  transpilePackages: ['@dalan/contracts', '@dalan/domain'],
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] },
};

export default nextConfig;
