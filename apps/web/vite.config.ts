import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';
import { forjaApi } from './forja-api.mjs';
import { offlineManifest, precacheIntegrity } from './offline-manifest.mjs';

export default defineConfig({
  resolve: {
    alias: {
      '@forja/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5577,
    host: '127.0.0.1',
    strictPort: true,
  },
  build: {
    // O chunk exercises.generated (~895 KB raw / 96 KB gzip) é carregado de forma
    // lazy (import dinâmico), não entra no bundle principal. O aviso de tamanho é
    // esperado e controlado.
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // Separação de chunks para otimizar code-splitting
        manualChunks: (id) => {
          // Chunk 'vendor' para dependências core de React e routing
          if (id.includes('node_modules/react') ||
              id.includes('node_modules/react-dom') ||
              id.includes('node_modules/react-router-dom')) {
            return 'vendor';
          }
          // Chunk 'motion' para framer-motion (potencialmente grande)
          if (id.includes('node_modules/framer-motion')) {
            return 'motion';
          }
        },
      },
    },
  },
  plugins: [
    react(),
    forjaApi(),
    offlineManifest(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icon-maskable.svg', 'apple-touch-icon.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,json,webp,woff,woff2,png,svg}'],
        manifestTransforms: [async (entries) => precacheIntegrity(entries, fileURLToPath(new URL('./dist/', import.meta.url)))],
        clientsClaim: true,
        skipWaiting: false,
        cleanupOutdatedCaches: true,
        navigateFallbackDenylist: [/^\/api\//],
      },
      manifest: {
        name: 'Forja — Treino',
        short_name: 'Forja',
        description: 'Tracker de treino local-first, gamificado. Dono dos seus dados.',
        theme_color: '#181816',
        background_color: '#181816',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
