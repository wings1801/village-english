import type { ManifestOptions, VitePWAOptions } from 'vite-plugin-pwa';

export const manifest: Partial<ManifestOptions> = {
  name: 'むらのえいご',
  short_name: 'むらのえいご',
  description: 'どうぶつの村ですすむ、こどもむけ えいご れんしゅう',
  theme_color: '#7cc576',
  background_color: '#7cc576',
  display: 'standalone',
  orientation: 'landscape',
  start_url: '.',
  icons: [
    { src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};

export const workbox: VitePWAOptions['workbox'] = {
  globPatterns: ['**/*.{js,css,html,webp,png,svg,woff2,mp3,json}'],
  maximumFileSizeToCacheInBytes: 3_000_000,
};
