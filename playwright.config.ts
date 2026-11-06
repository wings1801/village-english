import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  // Serves the production build (service worker only exists there), under the Vite base.
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/village-english/`,
    reuseExistingServer: false,
    timeout: 240_000,
  },
  use: { baseURL: `http://localhost:${PORT}/village-english/` },
  projects: [
    {
      name: 'ipad-webkit',
      use: { ...devices['iPad Pro 11 landscape'], viewport: { width: 1366, height: 1024 } },
    },
  ],
});
