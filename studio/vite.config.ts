import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

/**
 * devstack.bid Studio (DEVSTACK v0.2.0 merged as a sub-app).
 * `vite build` writes the SPA to ../public/studio, which the Next.js/OpenNext build copies into
 * the Worker's static assets: Cloudflare serves /studio/* straight from ASSETS with the
 * route-scoped COOP/COEP + CSP headers in ../public/_headers. The /api/studio/* proxy is a set of
 * Next.js route handlers (../src/app/api/studio), so no secrets ever reach this bundle.
 */
const isolationHeaders = {
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

// `npm run dev` here proxies the API + brand images to the Next.js dev server (npm run dev in ..).
const NEXT_DEV = process.env.NVX_NEXT_URL ?? 'http://127.0.0.1:3000';

export default defineConfig({
  base: '/studio/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    headers: isolationHeaders,
    proxy: { '/api': NEXT_DEV, '/brand': NEXT_DEV },
  },
  preview: { headers: isolationHeaders },
  optimizeDeps: {
    exclude: ['@electric-sql/pglite', '@electric-sql/pglite-pgvector'],
  },
  worker: { format: 'es' },
  build: {
    outDir: path.resolve(import.meta.dirname, '../public/studio'),
    emptyOutDir: true,
    target: 'es2022',
    // Monaco + PGlite are intentionally large, lazy-loaded chunks (largest file ~10 MB, under the
    // 25 MiB per-file limit of Workers static assets).
    chunkSizeWarningLimit: 11000,
    sourcemap: false,
    rolldownOptions: {
      checks: { pluginTimings: false },
      onLog(level, log, handler) {
        // PGlite's Emscripten runtime uses direct eval by design; nothing actionable for us.
        if (log.code === 'EVAL' && String(log.id ?? log.message).includes('pglite')) return;
        handler(level, log);
      },
    },
  },
});
