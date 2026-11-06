import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { manifest, workbox } from './pwa.config.ts';

export default defineConfig({
  base: '/village-english/',
  plugins: [preact(), VitePWA({ registerType: 'prompt', manifest, workbox })],
});
