import { GRADES, type GradeId } from './grades';
import type { DayState, WordProgress } from './types';

/** Words the child gets wrong most often: seen >= 2 and wrong > 0, by wrong/seen desc, wrong desc, wordId asc. */
export function weakWords(progress: WordProgress[], n: number): WordProgress[] {
  if (!(n > 0)) return [];
  return progress
    .filter((p) => p.seen >= 2 && p.wrong > 0)
    .sort((a, b) => b.wrong / b.seen - a.wrong / a.seen || b.wrong - a.wrong || (a.wordId < b.wordId ? -1 : a.wordId > b.wordId ? 1 : 0))
    .slice(0, Math.floor(n));
}

/** Upper bound for minutesByDay's `last` (about ten years). */
export const MAX_DAYS = 3660;

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

function parseKey(key: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return [y, mo, d];
}

/** Whole minutes played on each of the `last` calendar days ending at `today` (inclusive), oldest first. */
export function minutesByDay(
  daysLog: DayState[],
  last: number,
  today: string,
): { dateKey: string; minutes: number }[] {
  const parts = parseKey(today);
  if (!parts || !Number.isInteger(last) || last < 1 || last > MAX_DAYS) return [];
  const seconds = new Map<string, number>();
  for (const d of daysLog) seconds.set(d.dateKey, (seconds.get(d.dateKey) ?? 0) + d.playSeconds);
  const [y, mo, d] = parts;
  const out: { dateKey: string; minutes: number }[] = [];
  for (let i = last - 1; i >= 0; i--) {
    const dt = new Date(Date.UTC(y, mo - 1, d - i)); // UTC date parts: no DST involved
    const dateKey = `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
    out.push({ dateKey, minutes: Math.round((seconds.get(dateKey) ?? 0) / 60) });
  }
  return out;
}

/**
 * Per-grade totals. Progress entries for unknown wordIds are ignored. If several entries share a wordId
 * the word is counted once, using the entry with the highest box (ties: highest seen).
 */
export function masteryByGrade(
  progress: WordProgress[],
  wordGrades: Record<string, GradeId>,
): Record<GradeId, { total: number; seen: number; mastered: number }> {
  const out = {} as Record<GradeId, { total: number; seen: number; mastered: number }>;
  for (const g of GRADES) out[g] = { total: 0, seen: 0, mastered: 0 };
  for (const id of Object.keys(wordGrades)) out[wordGrades[id]].total++;
  const best = new Map<string, WordProgress>();
  for (const p of progress) {
    if (!Object.hasOwn(wordGrades, p.wordId)) continue;
    const cur = best.get(p.wordId);
    if (!cur || p.box > cur.box || (p.box === cur.box && p.seen > cur.seen)) best.set(p.wordId, p);
  }
  for (const [id, p] of best) {
    if (p.seen < 1) continue;
    const e = out[wordGrades[id]];
    e.seen++;
    if (p.box >= 4) e.mastered++;
  }
  return out;
}
