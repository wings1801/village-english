import { GRADES, type GradeId } from './grades';

/** Loads the wordId -> grade table. Never throws; any failure yields {}. */
export async function loadWordGrades(
  fetchFn?: typeof fetch,
  baseUrl: string = import.meta.env.BASE_URL,
): Promise<Record<string, GradeId>> {
  try {
    const f = fetchFn ?? fetch; // resolved inside try: a missing global fetch must not throw
    const res = await f(`${baseUrl}content/word-grades.json`);
    if (res.status !== 200) return {};
    const data: unknown = await res.json();
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return {};
    const out: Record<string, GradeId> = {};
    for (const [id, g] of Object.entries(data)) {
      if (id !== '__proto__' && typeof g === 'string' && (GRADES as readonly string[]).includes(g)) out[id] = g as GradeId;
    }
    return out;
  } catch {
    return {};
  }
}
