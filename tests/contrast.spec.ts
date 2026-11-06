import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/styles.css', 'utf8');

const vars = (): Record<string, string> => {
  const root = /:root\s*\{([^}]*)\}/.exec(css)![1];
  return Object.fromEntries([...root.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
};
const resolve = (v: string): string => {
  const m = /^var\((--[\w-]+)\)$/.exec(v.trim());
  return m ? vars()[m[1]] : v.trim();
};
const decl = (selector: string, prop: string): string => {
  const esc = selector.replace(/[.[\]]/g, '\\$&');
  const rule = new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`, 'm').exec(css);
  if (!rule) throw new Error(`no rule ${selector}`);
  const d = new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*([^;]+);`).exec(rule[1]);
  if (!d) throw new Error(`no ${prop} in ${selector}`);
  return d[1].trim();
};
const lum = (hex: string): number => {
  const n = parseInt(hex.replace('#', ''), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe('shop button contrast', () => {
  it('the "not enough bells" state is opaque with AA text contrast', () => {
    expect(css).not.toMatch(/\.shop-buy\.shop-dim\s*\{[^}]*opacity/);
    const fg = resolve(decl('.shop-buy.shop-dim', 'color'));
    const bg = resolve(decl('.shop-buy.shop-dim', 'background'));
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
  it('the normal buy button has AA text contrast', () => {
    const fg = resolve(decl('.shop-buy', 'color'));
    const bg = resolve(decl('.shop-buy', 'background'));
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});
