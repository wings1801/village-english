import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BACKGROUNDS, DECOR, ICONS, VILLAGERS } from '../src/assets/manifest';

const ROOT = resolve(__dirname, '..', 'public', 'assets');
const POSES = ['idle', 'happy', 'excited', 'surprised', 'sleepy', 'thinking'] as const;

// Manifest paths are prefixed with BASE_URL; map them back onto public/assets.
const onDisk = (p: string) => resolve(ROOT, p.replace(/^.*?assets\//, ''));

describe('asset manifest', () => {
  it('has 11 villagers, no taro, Fuwa is the sheep', () => {
    expect(VILLAGERS).toHaveLength(11);
    expect(VILLAGERS.some((v) => v.id === 'taro')).toBe(false);
    expect(VILLAGERS.find((v) => v.id === 'momo_chan')?.name).toBe('Fuwa');
    expect(VILLAGERS.find((v) => v.id === 'keroppi')?.name).toBe('Pyon');
  });

  it('every villager has a kana-only Japanese name', () => {
    for (const v of VILLAGERS) expect(v.nameJa, v.id).toMatch(/^[ぁ-ゖァ-ヺー]+$/);
    expect(VILLAGERS.find((v) => v.id === 'mimi')?.nameJa).toBe('ミミ');
  });

  it('every villager has all 6 poses', () => {
    for (const v of VILLAGERS) {
      for (const pose of POSES) expect(v.poses[pose], `${v.id}/${pose}`).toBeTruthy();
    }
  });

  it('has 24 decor and 6 backgrounds', () => {
    expect(DECOR).toHaveLength(24);
    expect(BACKGROUNDS).toHaveLength(6);
  });

  it('every decor has a non-empty kana-only nameJa', () => {
    for (const d of DECOR) expect(d.nameJa, d.id).toMatch(/^[ぁ-ゖァ-ヺー・]+$/);
  });

  it('every referenced file exists as webp under 300,000 bytes', () => {
    const all = [
      ...VILLAGERS.flatMap((v) => Object.values(v.poses)),
      ...DECOR.map((d) => d.src),
      ...Object.values(ICONS),
      ...BACKGROUNDS.map((b) => b.src),
    ];
    expect(all.length).toBe(66 + 24 + 24 + 6);
    for (const p of all) {
      expect(p.endsWith('.webp'), p).toBe(true);
      const file = onDisk(p);
      expect(existsSync(file), file).toBe(true);
      expect(statSync(file).size, file).toBeLessThan(300_000);
    }
  });
});
