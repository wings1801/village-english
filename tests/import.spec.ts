import { describe, expect, it } from 'vitest';
import { collectCredits, collectUsedTatoeba } from '../scripts/gen-credits';
import { assignGrades, buildGlossIndex, buildWordTables, parseCefrj, pickJa, type JmdictWord } from '../scripts/import-wordlists';
import {
  hasWholeWord,
  isSimpleSentence,
  pairJapanese,
  parseLinks,
  parseSentences,
  selectSentences,
} from '../scripts/import-tatoeba';

// All fixtures below are synthetic.
const CEFR_TSV = [
  'headword\tpos\tCEFR\tCoreInventory 1\tCoreInventory 2\tThreshold',
  'apple\tnoun\tA1\t\t\t',
  'run\tverb\tA1\t\t\t',
  'run\tnoun\tA2\t\t\t',
  'color/colour\tnoun\tA1\t\t\t',
  'April\tnoun\tA1\t\t\t',
  'a.m./A.M./am/AM\tadverb\tA1\t\t\t',
  'ice cream\tnoun\tA1\t\t\t',
  'zebra\tnoun\tB2\t\t\t',
  'blue\tadjective\tA2\t\t\t',
  "'m\tbe-verb\tA1\t\t\t",
].join('\n');

const gloss = (...texts: string[]) => texts.map((text) => ({ lang: 'eng', text }));
const JM: JmdictWord[] = [
  {
    id: '1',
    kana: [{ text: 'りんご', common: true }],
    kanji: [{ text: '林檎', common: true }],
    sense: [{ partOfSpeech: ['n'], gloss: gloss('apple') }],
  },
  {
    id: '2',
    kana: [{ text: 'アップルパイ', common: true }],
    kanji: [],
    sense: [{ partOfSpeech: ['n'], gloss: gloss('apple pie', 'apple') }],
  },
  {
    id: '3',
    kana: [{ text: 'はしる', common: true }],
    kanji: [{ text: '走る', common: true }],
    sense: [{ partOfSpeech: ['v5r', 'vi'], gloss: gloss('to run', 'to dash') }],
  },
  {
    id: '4',
    kana: [{ text: 'あお', common: true }],
    kanji: [{ text: '青', common: true }],
    sense: [{ partOfSpeech: ['n', 'adj-no'], gloss: gloss('blue', 'green') }],
  },
  {
    id: '5',
    kana: [{ text: 'ブルー', common: true }],
    kanji: [],
    sense: [{ partOfSpeech: ['n'], gloss: gloss('blue') }],
  },
];

describe('parseCefrj', () => {
  it('keeps single lower-case words, first variant, and de-duplicates by lowest level', () => {
    const words = parseCefrj(CEFR_TSV);
    const ids = words.map((w) => w.wordId);
    expect(ids).toEqual(['apple', 'run', 'color', 'zebra', 'blue']);
    expect(words.find((w) => w.wordId === 'run')).toMatchObject({ en: 'run', pos: 'verb', cefr: 'A1' });
  });

  it('can restrict to levels', () => {
    expect(parseCefrj(CEFR_TSV, ['A2']).map((w) => w.wordId)).toEqual(['blue']);
  });
});

describe('JMdict reverse index', () => {
  const index = buildGlossIndex(JM);

  it('prefers the entry where the word is the first gloss, and returns kana only', () => {
    expect(pickJa(index, 'apple', 'noun')).toMatchObject({ ja: 'りんご', jaGlossRaw: '林檎' });
  });

  it('strips "to " for verbs', () => {
    expect(pickJa(index, 'run', 'verb')?.ja).toBe('はしる');
  });

  it('prefers the shortest reading among equally good candidates', () => {
    expect(pickJa(index, 'blue', 'adjective')?.ja).toBe('あお');
  });

  it('returns null when there is no gloss', () => {
    expect(pickJa(index, 'zebra', 'noun')).toBeNull();
  });
});

describe('assignGrades', () => {
  it('puts all A1 words in grade 5 and only the first part of A2 in grade 4 (no A1 in grade 4)', () => {
    const mk = (id: string, cefr: string) => ({ wordId: id, en: id, pos: 'noun', cefr, ja: 'あ' });
    const words = [mk('a1', 'A1'), mk('b1', 'A1'), mk('c1', 'A1'), mk('d2', 'A2'), mk('e2', 'A2'), mk('f2', 'A2')];
    const r = assignGrades(words, { '5': ['A1'], '4': ['A2'] }, 2);
    expect(r['5'].map((w) => w.wordId)).toEqual(['a1', 'b1', 'c1']);
    expect(r['4'].map((w) => w.wordId)).toEqual(['d2', 'e2']);
    expect(r['4'].some((w) => w.cefr === 'A1')).toBe(false);
  });
});

const ENG = [
  '1\teng\tI like this apple.\tAnn\t\\N\t2020-01-01 00:00:00',
  '2\teng\tNo author apple here.\t\\N\t\\N\t\\N',
  '3\teng\tThe apple is red.\tBob\t\\N\t2020-01-01 00:00:00',
  '4\teng\tI like to eat a big red apple every day now.\tCy\t\\N\t\\N',
  '5\teng\tI like pineapple.\tDee\t\\N\t\\N',
  '6\teng\tI like an apple\tEve\t\\N\t\\N',
  '7\teng\tI like an apple.\t\tx\ty',
].join('\n');

describe('Tatoeba parsing and pairing', () => {
  it('drops sentences without an author', () => {
    const m = parseSentences(ENG);
    expect(m.has(2)).toBe(false);
    expect(m.has(7)).toBe(false);
    expect(m.get(1)).toEqual({ id: 1, text: 'I like this apple.', author: 'Ann' });
  });

  it('pairs through links and keeps only kana-only Japanese', () => {
    const eng = parseSentences(ENG);
    const jpn = parseSentences('10\tjpn\tこれはりんごです。\tTaro\t\\N\t\\N\n11\tjpn\t私はりんごが好き。\tHana\t\\N\t\\N');
    const links = parseLinks('1\t10\n3\t11\n3\t999');
    const paired = pairJapanese(eng, jpn, links);
    expect(paired.get(1)).toBe('これはりんごです。');
    expect(paired.has(3)).toBe(false);
  });
});

describe('sentence filters', () => {
  const allowed = new Set(['apple', 'like', 'this', 'red', 'eat', 'big', 'day', 'be']);
  it('matches whole words only', () => {
    expect(hasWholeWord('I like pineapple.', 'apple')).toBe(false);
    expect(hasWholeWord('I like Apple!', 'apple')).toBe(true);
  });
  it('accepts short, simple, punctuated sentences', () => {
    expect(isSimpleSentence('I like this apple.', allowed)).toBe(true);
    expect(isSimpleSentence('The apple is red.', allowed)).toBe(true);
  });
  it('rejects too long, unpunctuated, non-ASCII and out-of-list words', () => {
    expect(isSimpleSentence('I like to eat a big red apple every day now.', allowed)).toBe(false);
    expect(isSimpleSentence('I like an apple', allowed)).toBe(false);
    expect(isSimpleSentence('I like an apple。', allowed)).toBe(false);
    expect(isSimpleSentence('I like quantum apple.', allowed)).toBe(false);
  });
  it('rejects blocklisted words and two-word fragments', () => {
    expect(isSimpleSentence('I like the bottom.', new Set(['like', 'bottom']))).toBe(false);
    expect(isSimpleSentence('Good apple.', allowed)).toBe(false);
  });
  it('selects up to 3 shortest sentences per word', () => {
    const sentences = parseSentences(ENG);
    const more = parseSentences(
      ['20\teng\tI like apple.\tZed\t\\N\t\\N', '21\teng\tThis apple is red.\tY\t\\N\t\\N', '22\teng\tThe red apple is big.\tX\t\\N\t\\N'].join('\n'),
    );
    for (const [k, v] of more) sentences.set(k, v);
    const out = selectSentences(['apple'], sentences, new Map(), allowed, 3);
    expect(out.apple).toHaveLength(3);
    expect(out.apple.every((s) => s.author.length > 0)).toBe(true);
    expect(out.apple[0].id).toBe(20);
    expect(out.apple.map((s) => s.id)).not.toContain(2);
  });
});

describe('collectCredits', () => {
  it('is unique and sorted by sentence id', () => {
    const r = collectCredits([
      { apple: [{ id: 9, en: 'x.', author: 'B' }, { id: 3, en: 'y.', author: 'A' }] },
      { dog: [{ id: 3, en: 'y.', author: 'A' }, { id: 5, en: 'z.', author: 'C' }] },
    ]);
    expect(r).toEqual({
      tatoeba: [
        { sentenceId: 3, author: 'A' },
        { sentenceId: 5, author: 'C' },
        { sentenceId: 9, author: 'B' },
      ],
    });
  });
});

describe('ja confidence and tables', () => {
  const jm: JmdictWord[] = [
    { id: 'a', kana: [{ text: 'いぬ' }], kanji: [{ text: '犬' }], sense: [{ partOfSpeech: ['n'], gloss: gloss('dog') }] },
    {
      id: 'b',
      kana: [{ text: 'しょうとつ' }],
      kanji: [],
      sense: [{ partOfSpeech: ['n'], gloss: gloss('collision') }, { partOfSpeech: ['n'], gloss: gloss('brush') }],
    },
    { id: 'c', kana: [{ text: 'ねこ' }], kanji: [], sense: [{ partOfSpeech: ['n'], gloss: gloss('cat (animal)') }] },
    { id: 'd', kana: [{ text: 'ホテル' }], kanji: [], sense: [{ partOfSpeech: ['n'], gloss: gloss('hotel') }] },
    { id: 'e', kana: [{ text: 'やど' }], kanji: [], sense: [{ partOfSpeech: ['n'], gloss: gloss('inn', 'hotel') }] },
  ];
  const index = buildGlossIndex(jm);

  it('is clean only for an exact first gloss of the first sense', () => {
    expect(pickJa(index, 'dog', 'noun')?.jaLookup).toBe('clean');
    expect(pickJa(index, 'brush', 'noun')?.jaLookup).toBe('doubtful'); // second sense
    expect(pickJa(index, 'cat', 'noun')?.jaLookup).toBe('doubtful'); // parenthetical, not exact
    expect(pickJa(index, 'hotel', 'noun')?.jaLookup).toBe('clean');
  });

  it('lists a katakana loanword candidate first among alternatives', () => {
    const idx = buildGlossIndex([
      { id: 'x', kana: [{ text: 'いえ' }], kanji: [], sense: [{ partOfSpeech: ['n'], gloss: gloss('house') }] },
      { id: 'y', kana: [{ text: 'ハウス' }], kanji: [], sense: [{ partOfSpeech: ['n'], gloss: gloss('house') }] },
    ]);
    const r = pickJa(idx, 'house', 'noun');
    expect(r?.ja).toBe('いえ');
    expect(r?.jaAlts?.[0]).toBe('ハウス');
  });

  it('emits only kana in ja and a review list of low-confidence entries', () => {
    const words = parseCefrj('h\tp\tc\ndog\tnoun\tA1\nbrush\tnoun\tA1\nzzz\tnoun\tA1');
    const t = buildWordTables(words, index, { '5': ['A1'], '4': ['A2'] }, { grade4A2Fraction: 0.5 });
    for (const w of [...t['5'].words, ...t['4'].words]) expect(w.ja).toMatch(/^[ぁ-ゖァ-ヺー]+$/);
    expect(t['5'].unmatched.map((u) => u.wordId)).toEqual(['zzz']);
    expect(t['5'].review.map((r) => r.wordId)).toEqual(['brush']);
    expect(t['5'].review[0]).toMatchObject({ en: 'brush', ja: 'しょうとつ' });
  });
});

describe('blocklist', () => {
  const allowed = new Set(['kill', 'gun', 'sex', 'damn', 'beer', 'see', 'tom']);
  const bad = [
    'I kill the dog.', 'He kills it.', 'Tom was killing it.', 'They killed Tom.', // violence
    'We saw two guns.', // violence
    'See the sexy beer.', // sexual / substances
    'Damn it all, Tom.', // profanity
    'Tom drinks beers.', // substances
    'Tom is a bastard.', // slur / profanity
  ];
  it.each(bad)('rejects %s', (t) => {
    expect(isSimpleSentence(t, new Set([...allowed, 'dog', 'it', 'saw', 'two', 'all', 'drink', 'drinks', 'beers', 'bastard', 'killing', 'kills', 'killed', 'guns', 'sexy', 'damn']))).toBe(false);
  });
  it('still accepts a harmless sentence', () => {
    expect(isSimpleSentence('Tom can see it.', new Set(['see']))).toBe(true);
  });
});

describe('collectCredits conflicts', () => {
  it('throws when an id has two authors', () => {
    expect(() =>
      collectCredits([{ a: [{ id: 1, author: 'A' }] }, { b: [{ id: 1, author: 'B' }] }]),
    ).toThrow(/sentence 1/);
  });
});

describe('collectUsedTatoeba', () => {
  const tat = (id: number, author: string) => ({
    id: `q${id}`,
    source: { name: 'Tatoeba', license: 'CC BY 2.0 FR', url: `https://tatoeba.org/en/sentences/show/${id}`, author },
  });
  it('lists only Tatoeba-sourced questions, unique and sorted by id', () => {
    const r = collectUsedTatoeba([
      [tat(9, 'B'), { id: 'x', source: { name: 'original', license: 'n/a' } }, tat(3, 'A')],
      [tat(9, 'B'), { id: 'y', source: { name: 'CEFR-J Wordlist Version 1.6', license: 'c' } }],
    ]);
    expect(r).toEqual({ tatoeba: [{ sentenceId: 3, author: 'A' }, { sentenceId: 9, author: 'B' }] });
  });
  it('also counts names like "Tatoeba (first line); reply original"', () => {
    const q = { id: 'z', source: { name: 'Tatoeba (first line); reply original', license: 'CC BY 2.0 FR', url: 'https://tatoeba.org/en/sentences/show/5', author: 'C' } };
    expect(collectUsedTatoeba([[q]])).toEqual({ tatoeba: [{ sentenceId: 5, author: 'C' }] });
  });
  it('throws for a Tatoeba source without a parsable url or author, or with conflicting authors', () => {
    expect(() => collectUsedTatoeba([[{ id: 'q', source: { name: 'Tatoeba', license: 'x', author: 'A' } }]])).toThrow(/url/);
    expect(() => collectUsedTatoeba([[tat(1, 'A'), tat(1, 'B')]])).toThrow(/sentence 1/);
  });
});
