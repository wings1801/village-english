import type { Question, WordProgress } from './types';

type Box = 1 | 2 | 3 | 4 | 5;

const INTERVALS: Record<Box, number> = { 1: 0, 2: 1, 3: 3, 4: 7, 5: 14 };

function clampBox(box: number): Box {
  const b = Math.round(Number.isFinite(box) ? box : 1);
  return Math.min(5, Math.max(1, b)) as Box;
}

export function nextBox(box: number, correct: boolean): Box {
  return correct ? clampBox(Math.min(clampBox(box) + 1, 5)) : 1;
}

export function intervalDays(box: number): number {
  return INTERVALS[clampBox(box)];
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickQuestions(
  pool: Question[],
  progress: WordProgress[],
  today: string,
  n: number,
  rng: () => number = Math.random,
): Question[] {
  n = Math.floor(n);
  if (!(n > 0)) return [];
  const byWord = new Map(progress.map((p) => [p.wordId, p]));
  const seenIds = new Set<string>();
  const due: Question[] = [];
  const unseen: Question[] = [];
  const others: Question[] = [];
  for (const question of pool) {
    if (seenIds.has(question.id)) continue;
    seenIds.add(question.id);
    const p = question.wordId ? byWord.get(question.wordId) : undefined;
    if (!p) unseen.push(question);
    else if (p.dueDate <= today) due.push(question);
    else others.push(question);
  }
  const ordered = [...shuffle(due, rng), ...shuffle(unseen, rng), ...shuffle(others, rng)];

  const picked: Question[] = [];
  const usedWords = new Set<string>();
  const leftovers: Question[] = [];
  for (const question of ordered) {
    if (picked.length >= n) break;
    if (question.wordId && usedWords.has(question.wordId)) {
      leftovers.push(question);
      continue;
    }
    if (question.wordId) usedWords.add(question.wordId);
    picked.push(question);
  }
  for (const question of leftovers) {
    if (picked.length >= n) break;
    picked.push(question);
  }
  return picked;
}
