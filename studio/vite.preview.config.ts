import { defineConfig } from 'vite';

/** Builds the preview iframe runtime (React + ReactDOM) as one IIFE: public/preview/vendor.js. */
export default defineConfig({
  publicDir: false,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: 'public/preview',
    emptyOutDir: false,
    copyPublicDir: false,
    minify: true,
    lib: {
      entry: 'src/preview/vendor.ts',
      formats: ['iife'],
      name: 'nvxPreviewVendor',
      fileName: () => 'vendor.js',
    },
  },
});
