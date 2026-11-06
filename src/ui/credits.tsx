import { useState } from 'preact/hooks';
import { navigate } from './router';

/**
 * Licence notices. Child-facing words are kana. The CEFR-J line is the third party's own citation text
 * (their institution name), so it keeps its kanji verbatim.
 */
export const CREDITS_TEXT: string[] = [
  'このアプリは、つぎのしりょうを つかっています。',
  'JMdict — CC BY-SA 4.0 (https://www.edrdg.org/edrdg/licence.html)',
  'Tatoeba — CC BY 2.0 FR (https://creativecommons.org/licenses/by/2.0/fr/ , https://tatoeba.org)',
  'Tatoeba の ぶんは、いちぶ かえて つかっています。(Modified: sentences adapted into fill-in-the-blank items.)',
  'CEFR-J Wordlist Version 1.6 (東京外国語大学投野由紀夫研究室)',
  'Twemoji graphics © Twitter, Inc and other contributors (jdecked/twemoji), licensed CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/',
];

export const TATOEBA_SUMMARY = 'Tatoeba の とうこうしゃ';

export interface TatoebaCredit {
  sentenceId: number;
  author: string;
}

const loadFromBundle = async (): Promise<TatoebaCredit[]> =>
  (await import('../content/credits-data.json')).default.tatoeba;

/** Groups per-sentence credits by author; ids stay listed so each sentence is still attributed. */
export function groupByAuthor(list: TatoebaCredit[]): { author: string; ids: number[] }[] {
  const m = new Map<string, number[]>();
  for (const c of list) m.set(c.author, [...(m.get(c.author) ?? []), c.sentenceId]);
  return [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([author, ids]) => ({ author, ids: ids.sort((a, b) => a - b) }));
}

export function Credits({ loadTatoeba = loadFromBundle }: { loadTatoeba?: () => Promise<TatoebaCredit[]> }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [list, setList] = useState<TatoebaCredit[]>([]);

  const load = () => {
    setState('loading');
    loadTatoeba().then(
      (l) => {
        setList(l);
        setState('done');
      },
      () => setState('error'),
    );
  };

  const onToggle = (e: Event) => {
    if (!(e.currentTarget as HTMLDetailsElement).open || state !== 'idle') return;
    load();
  };

  return (
    <main>
      <button type="button" class="btn btn-primary back-btn" data-testid="credits-back" onClick={() => navigate('#/')}>
        もどる
      </button>
      <h1>クレジット</h1>
      {CREDITS_TEXT.map((line) => (
        <p key={line}>{line}</p>
      ))}
      <details onToggle={onToggle}>
        <summary>{TATOEBA_SUMMARY}</summary>
        {state === 'loading' && <p>よみこみちゅう…</p>}
        {state === 'error' && (
          <div>
            <p>よみこめませんでした。</p>
            <button type="button" onClick={load}>
              もういちどよみこむ
            </button>
          </div>
        )}
        {state === 'done' && (
          <ul>
            {groupByAuthor(list).map((g) => (
              <li key={g.author}>{`${g.author}: ${g.ids.map((id) => `#${id}`).join(', ')}`}</li>
            ))}
          </ul>
        )}
      </details>
    </main>
  );
}
