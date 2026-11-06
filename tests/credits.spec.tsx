import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../src/app';
import { CREDITS_TEXT, Credits } from '../src/ui/credits';

describe('credits', () => {
  afterEach(cleanup);

  it('names every data source with its licence', () => {
    const all = CREDITS_TEXT.join('\n');
    expect(all).toMatch(/JMdict/);
    expect(all).toMatch(/CC BY-SA 4\.0/);
    expect(all).toContain('https://www.edrdg.org/edrdg/licence.html');
    expect(all).toMatch(/Tatoeba/);
    expect(all).toContain('CC BY 2.0 FR');
    expect(all).toContain('https://tatoeba.org');
    expect(all).toContain('CEFR-J Wordlist Version 1.6');
    expect(all).toContain('東京外国語大学投野由紀夫研究室');
    expect(all).not.toMatch(/NGSL/); // nothing in the app uses it
    expect(all).toContain('https://creativecommons.org/licenses/by/2.0/fr/');
    expect(all).toContain('いちぶ かえて つかっています');
    expect(all).toContain(
      'Twemoji graphics © Twitter, Inc and other contributors (jdecked/twemoji), licensed CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/',
    );
  });

  it('renders every line', () => {
    render(<Credits />);
    for (const line of CREDITS_TEXT) {
      expect(screen.getByText(line)).toBeTruthy();
    }
  });

  it('renders no author list while closed and does not load the data', () => {
    let loads = 0;
    const load = async () => {
      loads++;
      return [];
    };
    const { container } = render(<Credits loadTatoeba={load} />);
    expect(container.querySelector('details')).toBeTruthy();
    expect(screen.getByText('Tatoeba の とうこうしゃ')).toBeTruthy();
    expect(container.querySelector('li')).toBeNull();
    expect(loads).toBe(0);
  });

  it('loads lazily on first open and lists ids grouped by author', async () => {
    const load = async () => [
      { sentenceId: 3, author: 'Alice' },
      { sentenceId: 5, author: 'Bob' },
      { sentenceId: 9, author: 'Alice' },
    ];
    const { container } = render(<Credits loadTatoeba={load} />);
    const details = container.querySelector('details') as HTMLDetailsElement;
    details.open = true;
    fireEvent(details, new Event('toggle'));
    expect(screen.getByText('よみこみちゅう…')).toBeTruthy();
    expect(await screen.findByText('Alice: #3, #9')).toBeTruthy();
    expect(screen.getByText('Bob: #5')).toBeTruthy();
  });

  it('shows an error with a retry button when loading fails, then recovers', async () => {
    let calls = 0;
    const load = async () => {
      calls++;
      if (calls === 1) throw new Error('offline');
      return [{ sentenceId: 4, author: 'Cy' }];
    };
    const { container } = render(<Credits loadTatoeba={load} />);
    const details = container.querySelector('details') as HTMLDetailsElement;
    details.open = true;
    fireEvent(details, new Event('toggle'));
    expect(await screen.findByText('よみこめませんでした。')).toBeTruthy();
    fireEvent.click(screen.getByText('もういちどよみこむ'));
    expect(await screen.findByText('Cy: #4')).toBeTruthy();
    expect(calls).toBe(2);
  });

  it('child-facing strings are kana (only the CEFR-J citation keeps kanji)', () => {
    const { container } = render(<Credits />);
    const text = (container.textContent ?? '').replace(CREDITS_TEXT.find((l) => l.startsWith('CEFR-J'))!, '');
    expect(text).not.toMatch(/[一-鿿]/);
  });

  it('has a big もどる button back to the village', () => {
    window.location.hash = '#/credits';
    render(<App />);
    const back = screen.getByTestId('credits-back');
    expect(back.textContent).toBe('もどる');
    fireEvent.click(back);
    expect(window.location.hash).toBe('#/');
    window.location.hash = '';
  });

  it('is reachable at #/credits', () => {
    window.location.hash = '#/credits';
    render(<App />);
    expect(screen.getByText(CREDITS_TEXT[0])).toBeTruthy();
    window.location.hash = '';
  });
});
