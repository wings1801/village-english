// Called by `npm run build-word-grades`. Reads content/work/words-<grade>.json and writes
// public/content/word-grades.json: { "<wordId>": "5" | "4" } (grade 5 wins when a word is in both).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GRADES, type GradeId } from '../src/domain/grades';

export function buildWordGrades(tables: Partial<Record<GradeId, { wordId: string }[]>>): Record<string, GradeId> {
  const map = new Map<string, GradeId>();
  for (const g of GRADES) // GRADES lists 5 first, so the lowest grade wins
    for (const { wordId } of tables[g] ?? []) if (!map.has(wordId)) map.set(wordId, g);
  return Object.fromEntries([...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)));
}

function main(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const tables: Partial<Record<GradeId, { wordId: string }[]>> = {};
  for (const g of ['5', '4'] as const)
    tables[g] = JSON.parse(readFileSync(resolve(root, `content/work/words-${g}.json`), 'utf8')) as { wordId: string }[];
  const out = buildWordGrades(tables);
  const dir = resolve(root, 'public/content');
  mkdirSync(dir, { recursive: true });
  const text = JSON.stringify(out) + '\n';
  writeFileSync(resolve(dir, 'word-grades.json'), text);
  console.log(`${Object.keys(out).length} words, ${text.length} bytes`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
