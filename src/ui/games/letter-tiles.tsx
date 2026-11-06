import { useMemo, useState } from 'preact/hooks';
import type { GameProps } from './shared';
import { Picture } from './shared';

/** Shuffles the letters; never returns the answer's own order when a different order exists. */
export function shuffleLetters(word: string, rng: () => number = Math.random): string[] {
  const letters = [...word];
  const differs = new Set(letters).size > 1;
  const once = (): string[] => {
    const a = letters.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.min(i, Math.floor(rng() * (i + 1)));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  let out = once();
  for (let tries = 0; differs && out.join('') === word && tries < 8; tries++) out = once();
  if (differs && out.join('') === word) {
    // Deterministic fallback (e.g. a stuck rng): rotate until the order differs.
    out = letters.slice();
    for (let r = 1; r < out.length && out.join('') === word; r++) out = [...letters.slice(r), ...letters.slice(0, r)];
  }
  return out;
}

export function LetterTiles({ question, onAnswer, disabled }: GameProps) {
  const word = question.answer;
  const tiles = useMemo(() => shuffleLetters(word).map((ch, i) => ({ id: i, ch })), [question.id, word]);
  // slots[i] = id of the tile placed there, or null
  const [slots, setSlots] = useState<(number | null)[]>(() => Array.from({ length: word.length }, () => null));
  const used = new Set(slots.filter((s): s is number => s !== null));
  const letterOf = (id: number) => tiles[id].ch;

  const place = (id: number) => {
    if (disabled || used.has(id)) return;
    const at = slots.indexOf(null);
    if (at < 0) return;
    const next = slots.slice();
    next[at] = id;
    setSlots(next);
    if (next.every((s) => s !== null)) onAnswer(next.map((s) => letterOf(s as number)).join(''));
  };
  const unplace = (slot: number) => {
    if (disabled) return;
    const next = slots.slice();
    next[slot] = null;
    setSlots(next);
  };
  const clear = () => {
    if (disabled) return;
    setSlots(slots.map(() => null));
  };

  return (
    <div class="game game-letter-tiles">
      {question.imageId && <Picture imageId={question.imageId} />}
      {question.promptEn && <p class="hint-en chip">{question.promptEn}</p>}
      <div class="slots" role="group" aria-label="ならべる ばしょ">
        {slots.map((s, i) => (
          <div key={i} class={`slot ${s === null ? 'slot-empty' : 'slot-full'}`} data-testid="slot">
            {s !== null && (
              <button
                type="button"
                class="tile tile-placed"
                disabled={disabled}
                aria-label={`${letterOf(s)} を もどす`}
                onClick={() => unplace(i)}
              >
                {letterOf(s)}
              </button>
            )}
          </div>
        ))}
      </div>
      <div class="tray" role="group" aria-label="もじ">
        {tiles.map((t) => (
          <button
            key={t.id}
            type="button"
            class={`tile ${used.has(t.id) ? 'tile-used' : ''}`}
            data-testid="tile"
            disabled={disabled || used.has(t.id)}
            onClick={() => place(t.id)}
          >
            {t.ch}
          </button>
        ))}
      </div>
      <button type="button" class="btn btn-soft erase-btn" disabled={disabled} onClick={clear}>
        けす
      </button>
    </div>
  );
}
