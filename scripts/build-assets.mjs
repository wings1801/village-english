// Converts assets-src/ (untrusted extracted zips) into public/assets/*.webp and PWA icons.
// Usage: node scripts/build-assets.mjs
import { mkdir, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SPRITES = join(ROOT, 'assets-src/villagers/output/villager_sprites');
const PACK = join(ROOT, 'assets-src/pack/output/village_asset_pack');
const OUT = join(ROOT, 'public/assets');
const LIMIT = 300_000;
const SKIP = new Set(['taro']); // excluded on purpose

async function toWebp(src, dest, size, quality) {
  await mkdir(dirname(dest), { recursive: true });
  for (let q = quality; q >= 40; q -= 6) {
    const img = sharp(src);
    if (size) img.resize(size, size, { fit: 'inside', withoutEnlargement: true });
    await img.webp({ quality: q }).toFile(dest);
    const bytes = (await stat(dest)).size;
    if (bytes < LIMIT) {
      if (q !== quality) console.log(`quality lowered to ${q}: ${dest}`);
      return bytes;
    }
  }
  throw new Error(`cannot get under ${LIMIT} bytes: ${dest}`);
}

const pngs = async (dir) => (await readdir(dir)).filter((f) => f.endsWith('.png'));
let count = 0;
let total = 0;
const run = async (...a) => { total += await toWebp(...a); count++; };

for (const id of await readdir(SPRITES)) {
  if (SKIP.has(id)) continue;
  for (const f of await pngs(join(SPRITES, id))) {
    const pose = f.slice(id.length + 1, -4);
    await run(join(SPRITES, id, f), join(OUT, 'villagers', id, `${pose}.webp`), 512, 82);
  }
}
for (const f of await pngs(join(PACK, 'decorations')))
  await run(join(PACK, 'decorations', f), join(OUT, 'decor', f.replace('.png', '.webp')), 512, 82);
for (const f of await pngs(join(PACK, 'icons')))
  await run(join(PACK, 'icons', f), join(OUT, 'icons', f.replace('.png', '.webp')), 256, 82);
for (const f of await pngs(join(PACK, 'village_backgrounds')))
  await run(join(PACK, 'village_backgrounds', f), join(OUT, 'backgrounds', f.replace('.png', '.webp')), 1024, 80);

// PWA icons: Mimi "happy" on solid #7cc576. pwa.config.ts uses pwa-512.png for the
// maskable purpose too, so the character stays inside the central 80% safe zone.
const mimi = join(SPRITES, 'mimi/mimi_happy.png');
await mkdir(join(ROOT, 'public/icons'), { recursive: true });
for (const size of [192, 512]) {
  const inner = Math.round(size * 0.7);
  const sprite = await sharp(mimi).resize(inner, inner, { fit: 'inside' }).toBuffer();
  await sharp({ create: { width: size, height: size, channels: 3, background: '#7cc576' } })
    .composite([{ input: sprite, gravity: 'centre' }])
    .png()
    .toFile(join(ROOT, `public/icons/pwa-${size}.png`));
}

console.log(`wrote ${count} webp files, ${(total / 1024 / 1024).toFixed(2)} MB total, plus PWA icons`);
