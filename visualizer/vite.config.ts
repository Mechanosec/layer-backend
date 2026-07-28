import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // The layer service and the mock e-com are proxied, so the browser makes
    // same-origin requests: one address to open and nothing to configure.
    proxy: {
      '/api/layer': {
        target: process.env.LAYER_API_URL ?? 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/layer/, ''),
      },
      '/api/ecom': {
        target: process.env.MOCK_ECOM_URL ?? 'http://localhost:4000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ecom/, ''),
      },
    },
  },
});
