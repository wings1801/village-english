import type { GradeId, Question, QuestionKind } from './types';

const KINDS: readonly QuestionKind[] = ['pick-picture', 'listen-pick', 'letter-tiles', 'pick-word', 'dialogue-choice'];

function isQuestion(v: unknown, grade: GradeId): v is Question {
  if (typeof v !== 'object' || v === null) return false;
  const q = v as Record<string, unknown>;
  if (
    typeof q.id !== 'string' ||
    typeof q.kind !== 'string' ||
    !(KINDS as readonly string[]).includes(q.kind) ||
    typeof q.answer !== 'string' ||
    q.grade !== grade
  )
    return false;
  if (q.kind !== 'letter-tiles') {
    const c = q.choices;
    if (!Array.isArray(c) || !c.every((x) => typeof x === 'object' && x !== null && typeof (x as { id?: unknown }).id === 'string'))
      return false;
  }
  return true;
}

/** Loads a grade's questions. Never throws; any failure yields []. */
export async function loadQuestions(
  grade: GradeId,
  fetchFn?: typeof fetch,
  baseUrl: string = import.meta.env.BASE_URL,
): Promise<Question[]> {
  try {
    const f = fetchFn ?? fetch; // resolved inside try: a missing global fetch must not throw
    const res = await f(`${baseUrl}content/${grade}.json`);
    if (res.status !== 200) return [];
    const data: unknown = await res.json();
    if (!Array.isArray(data)) return [];
    const ids = new Set<string>();
    const good: Question[] = [];
    for (const x of data) {
      if (!isQuestion(x, grade) || ids.has(x.id)) continue; // invalid shape or duplicate id (first wins)
      ids.add(x.id);
      good.push(x);
    }
    const dropped = data.length - good.length;
    if (dropped > 0) console.warn(`content ${grade}: dropped ${dropped} invalid or duplicate question(s)`);
    return good;
  } catch {
    return [];
  }
}
