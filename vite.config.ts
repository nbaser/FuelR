import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Fester Port: Die lokal gespeicherten Daten hängen am Origin (localhost:4173).
const PORT = 4173;

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'FuelR – Fuelling-Planer',
        short_name: 'FuelR',
        description: 'Pre-, Intra- und Post-Fuelling für Rennrad und Laufen',
        lang: 'de',
        display: 'standalone',
        start_url: '/',
        theme_color: '#0f262e',
        background_color: '#091a20',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.open-meteo\.com\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'wetter',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
    }),
  ],
  server: { port: 5173 },
  preview: { port: PORT, strictPort: true },
});
