import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages phục vụ site dự án tại https://<user>.github.io/<repo>/, nên base phải là "/<repo>/".
// Đổi bằng biến môi trường SHOWCASE_BASE (ví dụ "/" khi dùng tên miền riêng).
function resolveBase(): string {
  const raw = process.env.SHOWCASE_BASE?.trim() || '/dalan-os/';
  const withLead = raw.startsWith('/') || raw.startsWith('.') ? raw : `/${raw}`;
  return withLead.endsWith('/') ? withLead : `${withLead}/`;
}

export default defineConfig({
  base: resolveBase(),
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
  },
  server: { port: 3003 },
  preview: { port: 4173 },
});
