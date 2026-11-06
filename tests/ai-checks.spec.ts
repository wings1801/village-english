import { describe, expect, it } from 'vitest';
import { checkQuestion, checkSourceComplete, checkTextLength } from '../content/ai-checks';
import type { Question } from '../src/domain/types';

const source = { name: 'Original', license: 'CC0' };
const pp: Question = {
  id: 'pp', grade: '5', kind: 'pick-picture', promptJa: 'えをえらぼう', imageId: 'apple',
  choices: [{ id: 'a', textEn: 'apple' }, { id: 'b', textEn: 'dog' }, { id: 'c', textEn: 'cat' }], answer: 'a', source,
};
const lp: Question = { ...pp, id: 'lp', kind: 'listen-pick', speakEn: 'apple', imageId: undefined };
const lt: Question = { id: 'lt', grade: '5', kind: 'letter-tiles', promptJa: 'ならべよう', imageId: 'apple', answer: 'apple', source };
const pw: Question = {
  id: 'pw', grade: '4', kind: 'pick-word', promptJa: 'えらぼう', promptEn: 'I like ___.',
  choices: [{ id: 'a', textEn: 'cats' }, { id: 'b', textEn: 'run' }, { id: 'c', textEn: 'blue' }], answer: 'a', source,
};
const dc: Question = { ...pw, id: 'dc', kind: 'dialogue-choice', promptEn: 'A: How are you?\nB: ___.' };
const reasons = (q: Question, exists: (id: string) => boolean = () => true) => checkQuestion(q, { imageExists: exists });

describe('checkQuestion', () => {
  it.each([pp, lp, lt, pw, dc])('passes a clean $kind question', (q) => {
    expect(reasons(q)).toEqual([]);
  });

  it('requires exactly one choice equal to the answer and unique choice ids', () => {
    expect(reasons({ ...pp, answer: 'zz' }).join()).toMatch(/answer/);
    expect(
      reasons({ ...pp, choices: [{ id: 'a', textEn: 'apple' }, { id: 'a', textEn: 'dog' }, { id: 'c', textEn: 'cat' }] }).join(),
    ).toMatch(/ids/);
  });

  it('requires unique choice texts, case-insensitively', () => {
    const q = { ...pw, choices: [{ id: 'a', textEn: 'Cats' }, { id: 'b', textEn: 'cats' }, { id: 'c', textEn: 'blue' }] };
    expect(reasons(q).join()).toMatch(/duplicate choice text/);
  });

  it('requires an emoji file for every imageId used (question and choices)', () => {
    expect(reasons(pp, (id) => id !== 'apple').join()).toMatch(/apple/);
    const q = { ...pp, choices: [{ id: 'a', textEn: 'apple', imageId: 'zzz' }, ...pp.choices!.slice(1)] };
    expect(reasons(q, (id) => id !== 'zzz').join()).toMatch(/zzz/);
  });

  it('rejects incomplete sources', () => {
    expect(checkSourceComplete({ name: '', license: 'CC0' })).not.toEqual([]);
    expect(checkSourceComplete({ name: 'X', license: ' ' })).not.toEqual([]);
    expect(checkSourceComplete({ name: 'X', license: 'CC BY 2.0' })).not.toEqual([]); // attribution licence needs author or url
    expect(checkSourceComplete({ name: 'X', license: 'CC BY 2.0', url: 'https://x' })).toEqual([]);
    expect(checkSourceComplete({ name: 'X', license: 'CC0' })).toEqual([]);
  });

  it('sanity-checks text length', () => {
    expect(checkTextLength({ ...pw, promptEn: 'x'.repeat(300) + ' ___' })).not.toEqual([]);
    expect(checkTextLength({ ...pp, choices: [{ id: 'a', textEn: 'y'.repeat(80) }, ...pp.choices!.slice(1)] })).not.toEqual([]);
    expect(checkTextLength(pw)).toEqual([]);
  });

  it('letter-tiles: the prompt must not already contain the answer word', () => {
    expect(reasons({ ...lt, promptEn: 'Spell: apple' }).join()).toMatch(/contains the answer/);
    expect(reasons({ ...lt, promptEn: 'A red fruit' })).toEqual([]);
  });

  it('pick-picture / listen-pick: no other choice may have the answer text', () => {
    const q = { ...pp, choices: [{ id: 'a', textEn: 'apple' }, { id: 'b', textEn: 'APPLE' }, { id: 'c', textEn: 'cat' }] };
    expect(reasons(q).length).toBeGreaterThan(0);
  });

  it('pick-word / dialogue-choice need exactly one ___', () => {
    expect(reasons({ ...pw, promptEn: 'I like cats.' }).join()).toMatch(/___/);
    expect(reasons({ ...dc, promptEn: 'A: ___?\nB: ___.' }).join()).toMatch(/___/);
  });

  it('reports schema failures as reasons', () => {
    expect(reasons({ ...pp, promptJa: '漢字' }).join()).toMatch(/promptJa/);
  });
});
