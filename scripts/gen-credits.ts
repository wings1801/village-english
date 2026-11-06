// Called by `npm run gen-credits`. Reads content/authored/*.json and writes src/content/credits-data.json:
// the Tatoeba sentences actually used by authored questions (source.name starts with 'Tatoeba'), sorted by id.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface CreditsData {
  tatoeba: { sentenceId: number; author: string }[];
}
type SentenceFile = Record<string, { id: number; en?: string; author: string }[]>;

export function collectCredits(files: SentenceFile[]): CreditsData {
  const byId = new Map<number, string>();
  for (const f of files) for (const list of Object.values(f)) for (const s of list) {
        const prev = byId.get(s.id);
        if (prev !== undefined && prev !== s.author) {
          throw new Error(`sentence ${s.id} has two authors: "${prev}" and "${s.author}"`);
        }
        byId.set(s.id, s.author);
      }
  return {
    tatoeba: [...byId.entries()].sort((a, b) => a[0] - b[0]).map(([sentenceId, author]) => ({ sentenceId, author })),
  };
}

interface UsedSource { name?: unknown; url?: unknown; author?: unknown }

/** Tatoeba sentence id and author of every question whose source is Tatoeba (id parsed from source.url). */
export function collectUsedTatoeba(files: unknown[][]): CreditsData {
  const byId = new Map<number, string>();
  for (const list of files) {
    for (const q of list) {
      const src = (q as { source?: UsedSource } | null)?.source;
      if (!src || typeof src.name !== 'string' || !src.name.startsWith('Tatoeba')) continue;
      const m = typeof src.url === 'string' ? /\/sentences\/show\/(\d+)/.exec(src.url) : null;
      if (!m || typeof src.author !== 'string' || src.author.trim() === '') {
        throw new Error(`Tatoeba question ${(q as { id?: unknown }).id}: source needs url /sentences/show/<id> and author`);
      }
      const id = Number(m[1]);
      const prev = byId.get(id);
      if (prev !== undefined && prev !== src.author) throw new Error(`sentence ${id} has two authors: "${prev}" and "${src.author}"`);
      byId.set(id, src.author);
    }
  }
  return {
    tatoeba: [...byId.entries()].sort((a, b) => a[0] - b[0]).map(([sentenceId, author]) => ({ sentenceId, author })),
  };
}

function main(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const dir = resolve(root, 'content/authored');
  const files = readdirSync(dir)
    .filter((f) => /^.+\.json$/.test(f))
    .map((f) => JSON.parse(readFileSync(resolve(dir, f), 'utf8')) as unknown[]);
  const data = collectUsedTatoeba(files);
  mkdirSync(resolve(root, 'src/content'), { recursive: true });
  writeFileSync(resolve(root, 'src/content/credits-data.json'), JSON.stringify(data, null, 1) + '\n');
  console.log(`${data.tatoeba.length} sentences, ${new Set(data.tatoeba.map((s) => s.author)).size} authors`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
