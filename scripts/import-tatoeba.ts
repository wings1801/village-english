// Called by `npm run import-tatoeba`. Parses (never executes) the Tatoeba per-language detailed
// sentence exports (eng, jpn) and the eng-jpn links file, and writes content/work/sentences-<grade>.json:
// { [wordId]: { id, en, ja?, author }[] } with up to 3 short, simple example sentences per word.
import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

export interface Sentence {
  id: number;
  text: string;
  author: string;
}
export interface PickedSentence {
  id: number;
  en: string;
  ja?: string;
  author: string;
}

/** Function words and a few names allowed in addition to the grade word lists. */
export const STOPLIST: ReadonlySet<string> = new Set(
  (
    "a an the i you he she it we they me him her us them my your his its our their this that these those " +
    "am is are was were be been do does did have has had will would can could shall should may must " +
    "not no yes and or but so if to of in on at for with from by up down out here there what who where when why how " +
    "very too also some any all oh please " +
    "i'm it's don't can't that's he's she's what's let's isn't we're you're they're i'll doesn't didn't " +
    "tom mary"
  ).split(' '),
);

/**
 * Word stems that make a sentence unsuitable as a child's example (the word list itself stays untouched).
 * Categories: violence, sexual, profanity, substances, slurs. Matching covers simple inflections (see isBlocked).
 */
export const BLOCK_STEMS: readonly string[] = [
  // violence
  'kill', 'die', 'dead', 'death', 'murder', 'suicide', 'gun', 'shoot', 'stab', 'blood', 'rape', 'bomb', 'weapon',
  // sexual
  'sex', 'sexy', 'naked', 'nude', 'porn', 'bottom', 'breast', 'kiss',
  // profanity
  'hell', 'damn', 'crap', 'shit', 'fuck', 'ass', 'bitch', 'bastard', 'stupid', 'idiot', 'shut',
  // substances
  'drunk', 'beer', 'wine', 'drug', 'cigarette', 'smoke', 'alcohol', 'vodka', 'whisky', 'cocaine',
  // slurs / hateful
  'gay', 'fat', 'hate', 'retard', 'nigger', 'fag',
];

function stemForms(t: string): string[] {
  const out = [t];
  if (t.endsWith('ies')) out.push(t.slice(0, -3) + 'y');
  if (t.endsWith('es')) out.push(t.slice(0, -2));
  if (t.endsWith('s')) out.push(t.slice(0, -1));
  if (t.endsWith('ed')) out.push(t.slice(0, -2), t.slice(0, -1));
  if (t.endsWith('ing')) out.push(t.slice(0, -3), t.slice(0, -3) + 'e');
  if (t.endsWith('er')) out.push(t.slice(0, -2));
  // doubled final consonant (shotting -> shot, stabbed -> stab)
  for (const x of [...out]) if (x.length > 3 && x[x.length - 1] === x[x.length - 2]) out.push(x.slice(0, -1));
  return out;
}

const BLOCK_SET = new Set(BLOCK_STEMS);
export function isBlocked(token: string): boolean {
  return stemForms(token).some((f) => BLOCK_SET.has(f));
}

export function parseSentenceLine(line: string): Sentence | null {
  const [id, , text, author] = line.split('\t');
  if (!/^\d+$/.test(id ?? '') || !text || !author || author === '\\N') return null;
  return { id: Number(id), text, author };
}

export function parseSentences(tsv: string): Map<number, Sentence> {
  const out = new Map<number, Sentence>();
  for (const line of tsv.split(/\r?\n/)) {
    const s = parseSentenceLine(line);
    if (s) out.set(s.id, s);
  }
  return out;
}

export function parseLinks(tsv: string): [number, number][] {
  const out: [number, number][] = [];
  for (const line of tsv.split(/\r?\n/)) {
    const m = /^(\d+)\t(\d+)$/.exec(line);
    if (m) out.push([Number(m[1]), Number(m[2])]);
  }
  return out;
}

const JA_KANA_ONLY = /^[ぁ-ゖァ-ヺー　-〿！？\s]+$/;

/** English id -> Japanese translation, only where the Japanese is kana-only. */
export function pairJapanese(
  eng: Map<number, Sentence>,
  jpn: Map<number, Sentence>,
  links: [number, number][],
): Map<number, string> {
  const out = new Map<number, string>();
  for (const [a, b] of links) {
    const ja = jpn.get(b);
    if (eng.has(a) && ja && !out.has(a) && JA_KANA_ONLY.test(ja.text)) out.set(a, ja.text);
  }
  return out;
}

export function tokens(text: string): string[] {
  return text.toLowerCase().replace(/[.?!,]/g, ' ').split(/\s+/).filter(Boolean);
}

export function hasWholeWord(text: string, word: string): boolean {
  return tokens(text).includes(word.toLowerCase());
}

function lemmas(t: string): string[] {
  const out = [t];
  if (t.endsWith('ies')) out.push(t.slice(0, -3) + 'y');
  if (t.endsWith('es')) out.push(t.slice(0, -2));
  if (t.endsWith('s')) out.push(t.slice(0, -1));
  if (t.endsWith('ed')) out.push(t.slice(0, -2), t.slice(0, -1));
  if (t.endsWith('ing')) out.push(t.slice(0, -3), t.slice(0, -3) + 'e');
  if (t.endsWith("'s")) out.push(t.slice(0, -2));
  const stem = out.slice(1).filter((x) => x.length > 2 && x[x.length - 1] === x[x.length - 2]);
  for (const x of stem) out.push(x.slice(0, -1));
  return out;
}

export function isAllowedToken(t: string, allowed: ReadonlySet<string>): boolean {
  return STOPLIST.has(t) || lemmas(t).some((l) => allowed.has(l));
}

/** Short (3-8 words), child-safe (no blocklisted word), ASCII, ends with . ? !, and every word comes from `allowed` or the stoplist. */
export function isSimpleSentence(text: string, allowed: ReadonlySet<string>): boolean {
  if (!/^[\x20-\x7E]+$/.test(text) || !/[.?!]$/.test(text)) return false;
  const ts = tokens(text);
  if (ts.length < 3 || ts.length > 8) return false;
  if (ts.some(isBlocked)) return false;
  return ts.every((t) => /^[a-z']+$/.test(t) && isAllowedToken(t, allowed));
}

/** Up to `max` sentences per word, shortest first (ties by id), each containing the word as a whole word. */
export function selectSentences(
  wordIds: string[],
  sentences: Map<number, Sentence>,
  ja: Map<number, string>,
  allowed: ReadonlySet<string>,
  max = 3,
): Record<string, PickedSentence[]> {
  const simple = [...sentences.values()]
    .filter((s) => isSimpleSentence(s.text, allowed))
    .sort((a, b) => tokens(a.text).length - tokens(b.text).length || a.text.length - b.text.length || a.id - b.id);
  const byToken = new Map<string, Sentence[]>();
  for (const s of simple) {
    for (const t of new Set(tokens(s.text))) {
      const list = byToken.get(t) ?? [];
      list.push(s);
      byToken.set(t, list);
    }
  }
  const out: Record<string, PickedSentence[]> = {};
  for (const w of wordIds) {
    const picked = (byToken.get(w) ?? []).slice(0, max).map((s) => {
      const j = ja.get(s.id);
      return { id: s.id, en: s.text, ...(j ? { ja: j } : {}), author: s.author };
    });
    if (picked.length) out[w] = picked;
  }
  return out;
}

async function readFiltered(path: string, keep: (s: Sentence) => boolean): Promise<Map<number, Sentence>> {
  const out = new Map<number, Sentence>();
  const rl = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity });
  for await (const line of rl) {
    const s = parseSentenceLine(line);
    if (s && keep(s)) out.set(s.id, s);
  }
  return out;
}

async function main(): Promise<void> {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const dir = resolve(root, 'content/sources/tatoeba');
  for (const f of ['eng.tsv', 'jpn.tsv', 'links.tsv']) {
    if (!existsSync(resolve(dir, f))) throw new Error(`missing ${f} (see docs/content-sources.md)`);
  }
  const read = (g: string) =>
    JSON.parse(readFileSync(resolve(root, `content/work/words-${g}.json`), 'utf8')) as { wordId: string }[];
  const w5 = read('5').map((w) => w.wordId);
  const w4 = read('4').map((w) => w.wordId);
  const allowed5 = new Set(w5);
  const allowed4 = new Set([...w5, ...w4]);

  const eng = await readFiltered(resolve(dir, 'eng.tsv'), (s) => isSimpleSentence(s.text, allowed4));
  const jpn = await readFiltered(resolve(dir, 'jpn.tsv'), (s) => JA_KANA_ONLY.test(s.text));
  const ja = pairJapanese(eng, jpn, parseLinks(readFileSync(resolve(dir, 'links.tsv'), 'utf8')));

  for (const [g, ids, allowed] of [['5', w5, allowed5], ['4', w4, allowed4]] as const) {
    const out = selectSentences(ids, eng, ja, allowed, 3);
    writeFileSync(resolve(root, `content/work/sentences-${g}.json`), JSON.stringify(out, null, 1) + '\n');
    const all = Object.values(out).flat();
    const authors = new Set(all.map((s) => s.author));
    console.log(`grade ${g}: ${Object.keys(out).length}/${ids.length} words with sentences, ${all.length} sentences, ${authors.size} authors`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
