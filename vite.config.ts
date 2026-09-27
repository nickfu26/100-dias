import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';

// GitHub Pages serves the site from /<repo>/; the deploy workflow sets BASE_PATH.
const base = process.env.BASE_PATH ?? '/';

// Shown on /mic-test and in reports so we always know which build a device is running.
const sha = (() => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
})();
const appVersion = `${sha} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`;

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // registered in src/main.tsx (reloads the page on update)
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: '100 Días',
        short_name: '100 Días',
        description: 'Peninsular Spanish from zero, one day at a time.',
        lang: 'es-ES',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f7f1e3',
        theme_color: '#1f3a8a',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        // App shell, fonts, lesson chunks and the audio manifest are precached.
        // MP3s are too many to precache; they are cached on first play / day prefetch.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webmanifest}', 'audio/manifest.json'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.endsWith('.mp3'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'audio',
              // Pages sends Vary: Accept-Encoding and <audio> sends different headers than fetch().
              matchOptions: { ignoreVary: true },
              // Safari requests media with Range; serve 206 slices from the full cached file.
              rangeRequests: true,
              cacheableResponse: { statuses: [0, 200] }, // never cache 206 partials
              expiration: { maxEntries: 20000, purgeOnQuotaError: false },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
