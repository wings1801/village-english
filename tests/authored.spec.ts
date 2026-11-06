// Called by vitest. Checks the hand-authored question files (content/authored/5.json and 4.json).
// No existing test covers the authored data; scripts/validate-content.ts only runs from the CLI.
// Task instructions: "Implement Task 9b: author grade 5 questions per the plan";
// "Implement Task 9c: author grade 4 questions per the plan".
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateQuestion } from '../content/schema';

const ROOT = resolve(__dirname, '..');
const read = (p: string) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));

interface Q {
  id: string;
  kind: string;
  wordId?: string;
  imageId?: string;
  choices?: { imageId?: string }[];
}
type W = { wordId: string };

const grades = [
  { grade: '5', minQuestions: 170, minWords: 120, minImages: 61, wordFiles: ['content/work/words-5.json'] },
  { grade: '4', minQuestions: 150, minWords: 100, minImages: 45, wordFiles: ['content/work/words-4.json', 'content/work/words-5.json'] },
];

for (const { grade, minQuestions, minWords, minImages, wordFiles } of grades) {
  describe(`authored grade ${grade} content`, () => {
    const questions = read(`content/authored/${grade}.json`) as Q[];
    const known = new Set(wordFiles.flatMap((f) => (read(f) as W[]).map((w) => w.wordId)));

    it(`has at least ${minQuestions} questions`, () => {
      expect(questions.length).toBeGreaterThanOrEqual(minQuestions);
    });

    it('every question passes validateQuestion (incl. no kanji outside ruby)', () => {
      for (const q of questions) {
        const r = validateQuestion(q);
        expect(r.ok, `${q.id}: ${r.ok ? '' : r.errors.join('; ')}`).toBe(true);
      }
    });

    it(`has unique ids of the form g${grade}-<kind>-<nnn> and grade "${grade}"`, () => {
      const ids = questions.map((q) => q.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const q of questions) {
        expect(q.id.startsWith(`g${grade}-${q.kind}-`)).toBe(true);
        expect(q.id.slice(`g${grade}-${q.kind}-`.length)).toMatch(/^[0-9]{3}$/);
        expect((q as unknown as { grade: string }).grade).toBe(grade);
      }
    });

    it('every imageId (question and choices) has an emoji file', () => {
      const used = new Set<string>();
      for (const q of questions) {
        if (q.imageId) used.add(q.imageId);
        for (const c of q.choices ?? []) if (c.imageId) used.add(c.imageId);
      }
      expect(used.size).toBeGreaterThanOrEqual(minImages);
      for (const id of used) {
        expect(existsSync(resolve(ROOT, 'public/assets/emoji', `${id}.svg`)), id).toBe(true);
      }
    });

    it(`every wordId is a known word and at least ${minWords} distinct words are used`, () => {
      const used = new Set<string>();
      for (const q of questions) {
        if (q.wordId !== undefined) {
          expect(known.has(q.wordId), `${q.id}: ${q.wordId}`).toBe(true);
          used.add(q.wordId);
        }
      }
      expect(used.size).toBeGreaterThanOrEqual(minWords);
    });

    it('mixes all five kinds', () => {
      const kinds = new Set(questions.map((q) => q.kind));
      for (const k of ['pick-picture', 'listen-pick', 'letter-tiles', 'pick-word', 'dialogue-choice']) {
        expect(kinds.has(k), k).toBe(true);
      }
    });
  });
}

// Words allowed in grade 4 letter-tiles hints besides words-4/words-5.
const HINT_FUNCTION_WORDS = new Set(
  'the a an it in you for is are like and or of after to on up down that this one two can your at who his with by from'.split(' '),
);
// Explicit exceptions: unit plurals and nouns tied to the answer word (kilometer, kilogram, century, centimeter, escalator).
const HINT_EXCEPTIONS = new Set(['meter', 'meters', 'grams', 'years', 'stairs', 'themselves']);

describe('authored grade 4 letter-tiles hints', () => {
  it('use only listed words, function words or the explicit exceptions', () => {
    const known = new Set(
      ['content/work/words-4.json', 'content/work/words-5.json'].flatMap((f) => (read(f) as W[]).map((w) => w.wordId)),
    );
    const qs = read('content/authored/4.json') as (Q & { promptEn?: string })[];
    for (const q of qs) {
      if (q.kind !== 'letter-tiles' || q.promptEn === undefined) continue;
      for (const t of q.promptEn.toLowerCase().split(/[^a-z]+/).filter(Boolean)) {
        expect(known.has(t) || HINT_FUNCTION_WORDS.has(t) || HINT_EXCEPTIONS.has(t), `${q.id}: "${t}"`).toBe(true);
      }
    }
  });
});

describe('authored grades together', () => {
  it('have no id collisions', () => {
    const a = (read('content/authored/5.json') as Q[]).map((q) => q.id);
    const b = (read('content/authored/4.json') as Q[]).map((q) => q.id);
    expect(new Set([...a, ...b]).size).toBe(a.length + b.length);
  });
});
