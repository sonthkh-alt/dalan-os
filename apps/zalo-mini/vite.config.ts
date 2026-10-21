import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import zaloMiniApp from 'zmp-vite-plugin';

// zmp-vite-plugin: base "./" khi build, xuất ra thư mục www và ghi www/app-config.json (listCSS/listSyncJS) cho `zmp deploy`.
export default defineConfig({
  base: '',
  plugins: [zaloMiniApp(), react(), tailwindcss()],
  resolve: {
    // Monorepo dùng node_modules phẳng: gốc có React 19 (Next.js), Mini App dùng React 18 (zmp-ui chưa hỗ trợ React 19).
    // dedupe buộc mọi gói (zmp-ui, react-query, zustand...) dùng chung bản React của app này.
    dedupe: ['react', 'react-dom', 'react-router-dom', 'react-router'],
  },
  server: { port: 3002, host: true },
  preview: { port: 3002 },
});
