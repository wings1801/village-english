// Called by `npm run import-words`. Parses (never executes) the CEFR-J wordlist TSV dump and the
// jmdict-simplified English "common" JSON, then writes content/work/words-<grade>.json and
// content/work/unmatched-<grade>.json. All source data is untrusted: parse only.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface CefrWord {
  wordId: string;
  en: string;
  pos: string;
  cefr: string;
}
export type JaLookup = 'clean' | 'doubtful';
export interface WordEntry extends CefrWord {
  ja: string;
  jaGlossRaw?: string;
  /**
   * `ja` is an unverified dictionary hint; 'clean' only means the lookup was structurally unambiguous
   * (exact whole-gloss, first gloss, first sense), NOT that the meaning is right for a child.
   * Authors must write the child-facing Japanese meaning themselves.
   */
  jaLookup: JaLookup;
  /** Other candidate kana readings, for the author to choose from if `ja` is wrong. */
  jaAlts?: string[];
  imageHint?: string;
}
export interface Unmatched extends CefrWord {
  reason: string;
}

interface JmGloss {
  lang?: string;
  text: string;
}
export interface JmdictWord {
  id: string;
  kana: { text: string; common?: boolean }[];
  kanji: { text: string; common?: boolean }[];
  sense: { partOfSpeech: string[]; gloss: JmGloss[]; misc?: string[] }[];
}

const KANA_ONLY = /^[ぁ-ゖァ-ヺー]+$/;
const SKIP_MISC = new Set(['arch', 'vulg', 'derog', 'obs', 'rare', 'sl', 'X', 'obsc', 'col']);

/** Parse the ALL sheet (as TSV: headword, pos, CEFR, ...). Single lower-case words only, de-duplicated. */
export function parseCefrj(tsv: string, levels?: string[]): CefrWord[] {
  const byId = new Map<string, CefrWord>();
  const rank = (c: string) => c.charCodeAt(0) * 10 + Number(c.slice(1) || 0);
  for (const line of tsv.split(/\r?\n/).slice(1)) {
    const [head = '', pos = '', cefr = ''] = line.split('\t');
    if (!/^[ABC][12]$/.test(cefr)) continue;
    const first = head.split('/')[0].trim();
    if (!/^[a-z]+$/.test(first)) continue;
    const prev = byId.get(first);
    if (prev && rank(prev.cefr) <= rank(cefr)) continue;
    byId.set(first, { wordId: first, en: first, pos: pos.trim(), cefr });
  }
  const all = [...byId.values()];
  return levels ? all.filter((w) => levels.includes(w.cefr)) : all;
}

interface Candidate {
  kana: string;
  kanji?: string;
  senseIdx: number;
  glossIdx: number;
  exact: boolean;
  senseSize: number;
  entrySenses: number;
  pos: string[];
}
export type GlossIndex = Map<string, Candidate[]>;

/** Reverse index: lower-case English gloss -> candidate Japanese entries. */
export function buildGlossIndex(words: JmdictWord[]): GlossIndex {
  const index: GlossIndex = new Map();
  for (const w of words) {
    const kana = (w.kana.find((k) => k.common) ?? w.kana[0])?.text;
    if (!kana || !KANA_ONLY.test(kana)) continue;
    const kanji = (w.kanji.find((k) => k.common) ?? w.kanji[0])?.text;
    w.sense.forEach((s, senseIdx) => {
      if (s.misc?.some((m) => SKIP_MISC.has(m))) return;
      s.gloss.forEach((g, glossIdx) => {
        if (g.lang && g.lang !== 'eng') return;
        if (/^[A-Z]/.test(g.text.trim())) return; // proper nouns / months
        const exact = !g.text.includes('(');
        let key = g.text.replace(/\([^)]*\)/g, '').trim().toLowerCase();
        if (!key || /[^a-z' -]/.test(key)) return;
        if (s.partOfSpeech.some((p) => p.startsWith('v')) && key.startsWith('to ')) key = key.slice(3);
        const list = index.get(key) ?? [];
        list.push({ kana, kanji, senseIdx, glossIdx, exact, senseSize: s.gloss.length, entrySenses: w.sense.length, pos: s.partOfSpeech });
        index.set(key, list);
      });
    });
  }
  return index;
}

const isKatakana = (k: string) => /^[゠-ヿ]+$/.test(k);

function posCompatible(cefrPos: string, jm: string[]): boolean {
  if (cefrPos === 'verb') return jm.some((p) => p.startsWith('v'));
  if (cefrPos === 'noun') return jm.some((p) => p.startsWith('n'));
  if (cefrPos === 'adjective') return jm.some((p) => p.startsWith('adj'));
  if (cefrPos === 'adverb') return jm.some((p) => p.startsWith('adv'));
  return true;
}

/**
 * Best kana meaning for an English word, or null. Ranks exact (no parenthetical) glosses first, then first-gloss matches, sense order, native (non-katakana) readings, then gloss order, fewer synonyms, then kana length. `jaAlts` lists other candidates for the author.
 */
export function pickJa(
  index: GlossIndex,
  en: string,
  pos: string,
): { ja: string; jaGlossRaw?: string; jaAlts?: string[]; jaLookup: JaLookup } | null {
  const all = index.get(en.toLowerCase());
  if (!all?.length) return null;
  const compat = all.filter((c) => posCompatible(pos, c.pos));
  const pool = compat.length ? compat : all;
  const sorted = [...pool].sort(
    (a, b) =>
      Number(b.exact) - Number(a.exact) ||
      Number(a.glossIdx > 0) - Number(b.glossIdx > 0) ||
      a.senseIdx - b.senseIdx ||
      Number(isKatakana(a.kana)) - Number(isKatakana(b.kana)) ||
      a.glossIdx - b.glossIdx ||
      a.senseSize - b.senseSize ||
      a.kana.length - b.kana.length,
  );
  const best = sorted[0];
  const alts = [...new Set(sorted.map((c) => c.kana))]
    .filter((k) => k !== best.kana)
    .sort((a, b) => Number(isKatakana(b)) - Number(isKatakana(a))) // loanword reading first (stable)
    .slice(0, 3);
  const clean = best.exact && best.glossIdx === 0 && (best.entrySenses === 1 || best.senseIdx === 0);
  return { ja: best.kana, ...(best.kanji ? { jaGlossRaw: best.kanji } : {}), ...(alts.length ? { jaAlts: alts } : {}), jaLookup: clean ? 'clean' : 'doubtful' };
}

export interface GradeLimits {
  /** Fraction of the A2 words (in list order) that go to grade 4. */
  grade4A2Fraction: number;
}
export type GradeMap = { '5': string[]; '4': string[]; limits?: GradeLimits };

/**
 * Grade 5 takes every word of its levels (all CEFR-J A1); grade 4 takes the other words of its levels, with at most
 * `cap4A2` non-A1 words (the first part of A2). Input order is the CEFR-J order.
 */
export function assignGrades<T extends CefrWord>(
  words: T[],
  map: GradeMap,
  cap4A2: number,
): Record<'5' | '4', T[]> {
  const five = words.filter((w) => map['5'].includes(w.cefr));
  const used = new Set(five.map((w) => w.wordId));
  const four: T[] = [];
  let a2 = 0;
  for (const w of words) {
    if (used.has(w.wordId) || !map['4'].includes(w.cefr)) continue;
    if (w.cefr !== 'A1') {
      if (a2 >= cap4A2) continue;
      a2++;
    }
    four.push(w);
  }
  return { '5': five, '4': four };
}

export interface ReviewEntry {
  wordId: string;
  en: string;
  ja: string;
  jaAlts?: string[];
  jaGlossRaw?: string;
}
export interface GradeTable {
  words: WordEntry[];
  unmatched: Unmatched[];
  review: ReviewEntry[];
}

/** Assign words to grades (using the limits) and look up a kana hint for each. */
export function buildWordTables(
  cefr: CefrWord[],
  index: GlossIndex,
  map: Pick<GradeMap, '5' | '4'>,
  limits: GradeLimits,
): Record<'5' | '4', GradeTable> {
  const a2Count = cefr.filter((w) => w.cefr === 'A2').length;
  const grades = assignGrades(cefr, map, Math.floor(a2Count * limits.grade4A2Fraction));
  const out = {} as Record<'5' | '4', GradeTable>;
  for (const g of ['5', '4'] as const) {
    const t: GradeTable = { words: [], unmatched: [], review: [] };
    for (const w of grades[g]) {
      const hit = pickJa(index, w.en, w.pos);
      if (!hit) {
        t.unmatched.push({ ...w, reason: 'no common JMdict entry with this exact English gloss and a kana reading' });
        continue;
      }
      t.words.push({ ...w, ...hit });
      if (hit.jaLookup === 'doubtful') {
        t.review.push({
          wordId: w.wordId,
          en: w.en,
          ja: hit.ja,
          ...(hit.jaAlts ? { jaAlts: hit.jaAlts } : {}),
          ...(hit.jaGlossRaw ? { jaGlossRaw: hit.jaGlossRaw } : {}),
        });
      }
    }
    out[g] = t;
  }
  return out;
}

function main(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const tsvPath = resolve(root, 'content/sources/cefrj/all.tsv');
  const jmPath = resolve(root, 'content/sources/jmdict/jmdict-eng-common-3.6.2.json');
  for (const p of [tsvPath, jmPath]) {
    if (!existsSync(p)) throw new Error(`missing source ${p} (see docs/content-sources.md)`);
  }
  const map = JSON.parse(readFileSync(resolve(root, 'content/grade-map.json'), 'utf8')) as GradeMap;
  if (!map.limits) throw new Error('content/grade-map.json needs a "limits" key');
  const cefr = parseCefrj(readFileSync(tsvPath, 'utf8'), [...new Set([...map['5'], ...map['4']])]);
  const jm = JSON.parse(readFileSync(jmPath, 'utf8')) as { words: JmdictWord[] };
  const tables = buildWordTables(cefr, buildGlossIndex(jm.words), map, map.limits);
  mkdirSync(resolve(root, 'content/work'), { recursive: true });
  const write = (name: string, data: unknown) =>
    writeFileSync(resolve(root, `content/work/${name}.json`), JSON.stringify(data, null, 1) + '\n');
  for (const g of ['5', '4'] as const) {
    write(`words-${g}`, tables[g].words);
    write(`unmatched-${g}`, tables[g].unmatched);
    write(`review-ja-${g}`, tables[g].review);
    const clean = tables[g].words.length - tables[g].review.length;
    console.log(
      `grade ${g}: ${tables[g].words.length} words (${clean} clean, ${tables[g].review.length} doubtful), ${tables[g].unmatched.length} unmatched`,
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
