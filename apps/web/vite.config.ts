import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@forja/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5577,
    host: true,
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
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-maskable.svg', 'apple-touch-icon.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,webp,woff2}'],
        navigateFallbackDenylist: [/^\/api\//],
      },
      manifest: {
        name: 'Forja — Treino',
        short_name: 'Forja',
        description: 'Tracker de treino local-first, gamificado. Dono dos seus dados.',
        theme_color: '#151525',
        background_color: '#151525',
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
