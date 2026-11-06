import 'fake-indexeddb/auto';
import { readdirSync, readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openStore } from '../src/store/store';
import { StoreProvider } from '../src/store/store-context';
import { Parent } from '../src/ui/parent';
import { vi as t } from '../src/ui/parent-strings';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

const FILES = [
  ...readdirSync('src/ui')
    .filter((f) => /^parent.*\.tsx$/.test(f))
    .map((f) => `src/ui/${f}`),
  'src/ui/pin-gate.tsx',
];

function stripComments(src: string): string {
  const noBlocks = src.replace(/\/\*[\s\S]*?\*\//g, '');
  return noBlocks
    .split(/\r?\n/)
    .map((line) => line.replace(/(^|\s)\/\/.*$/, '$1'))
    .join('\n');
}

/** Hard-coded visible text in JSX: text nodes with letters, literal text attributes, {'literal'} children, say('literal'). */
export function findHardCodedText(src: string): string[] {
  const code = stripComments(src);
  const found: string[] = [];
  const add = (re: RegExp) => {
    for (const m of code.matchAll(re)) found.push(m[0].trim());
  };
  add(/(?<!=)>([^<>{}()=;&|]*\p{L}[^<>{}()=;&|]*)</gu); // <p>Xin chào</p>
  add(/\b(?:aria-label|aria-description|title|alt|placeholder|label)="[^"]*\p{L}[^"]*"/gu); // aria-label="..."
  add(/\{\s*(['"])[^'"\n]*\p{L}[^'"\n]*\1\s*\}/gu); // {'literal'}
  for (const m of code.matchAll(/>\s*\{\s*`([^`]*)`\s*\}/g)) {
    // {`literal ${x}`} as a child: only the parts outside ${...} count
    if (/\p{L}/u.test(m[1].replace(/\$\{[^}]*\}/g, ''))) found.push(m[0]);
  }
  add(/\bsay\(\s*['"`]/g);
  return found;
}

describe('parent strings live in one module', () => {
  it('the scanner catches the patterns it is meant to catch', () => {
    expect(findHardCodedText('<p>Xin chào</p>')).toHaveLength(1);
    expect(findHardCodedText('<p>こんにちは</p>')).toHaveLength(1);
    expect(findHardCodedText('<button aria-label="Đóng" />')).toHaveLength(1);
    expect(findHardCodedText("<p>{'Hello'}</p>")).toHaveLength(1);
    expect(findHardCodedText("say('Đã lưu')")).toHaveLength(1);
    expect(findHardCodedText('<p>{vi.a.b}</p><b aria-label={vi.x} class="p-btn">{"+"}</b>')).toHaveLength(0);
  });

  it('finds parent components to scan', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(6);
  });

  it.each(FILES)('%s has no hard-coded visible text', (file) => {
    expect(findHardCodedText(readFileSync(file, 'utf8')), file).toEqual([]);
  });

  it('never mentions the exam name', () => {
    const all = JSON.stringify(t, (_k, v) => (typeof v === 'function' ? String(v) : v));
    expect(all).not.toMatch(/eiken|英検/i);
    for (const f of FILES) expect(readFileSync(f, 'utf8')).not.toMatch(/eiken|英検/i);
  });

  it('rendered parent screens show only Vietnamese / numbers (no kana, no Eiken)', async () => {
    window.location.hash = '#/parent';
    const store = await openStore('parent-strings-test');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <StoreProvider open={() => Promise.resolve(store)}>
        <Parent />
      </StoreProvider>,
    );
    await screen.findByTestId('arith-question');
    expect(document.body.textContent).toContain(t.arith.title);
    expect(document.body.textContent).not.toMatch(/[\u3040-\u30ff]|eiken/i);
    store.close();
  });
});
