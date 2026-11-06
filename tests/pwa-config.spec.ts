import { describe, expect, it } from 'vitest';
import { manifest, workbox } from '../pwa.config';

describe('pwa config', () => {
  it('is a standalone landscape app', () => {
    expect(manifest.display).toBe('standalone');
    expect(manifest.orientation).toBe('landscape');
  });

  it('has 192 and 512 icons', () => {
    const sizes = (manifest.icons ?? []).map((i) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
  });

  it('does not name the exam in the app name', () => {
    expect(manifest.name).not.toMatch(/eiken|英検/i);
    expect(manifest.short_name).not.toMatch(/eiken|英検/i);
  });

  it('precaches webp and allows large files', () => {
    expect(workbox.globPatterns?.[0]).toContain('webp');
    expect(workbox.maximumFileSizeToCacheInBytes).toBe(3_000_000);
  });
});

describe('index.html', () => {
  it('carries the manifest theme colour and an apple-touch-icon under the base URL', async () => {
    const { readFileSync } = await import('node:fs');
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain(`<meta name="theme-color" content="${manifest.theme_color}" />`);
    expect(html).toContain('<link rel="apple-touch-icon" href="%BASE_URL%icons/pwa-192.png" />');
  });
});
