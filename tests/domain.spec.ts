import { describe, it, expect } from 'vitest';
import { nextBox, intervalDays, pickQuestions } from '../src/domain/srs';
import { dateKey, recordPlay, isTimeUp } from '../src/domain/daily-limit';
import { rewardFor, canBuy } from '../src/domain/wallet';
import type { Question, WordProgress } from '../src/domain/types';

const q = (id: string, wordId?: string): Question => ({
  id,
  grade: '5',
  kind: 'pick-word',
  wordId,
  promptJa: 'x',
  answer: 'a',
  source: { name: 't', license: 'CC0' },
});
const wp = (wordId: string, dueDate: string): WordProgress => ({
  wordId,
  box: 2,
  dueDate,
  seen: 1,
  wrong: 0,
});
const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

describe('srs', () => {
  it('nextBox', () => {
    expect(nextBox(5, true)).toBe(5);
    expect(nextBox(3, false)).toBe(1);
    expect(nextBox(1, true)).toBe(2);
    expect(nextBox(2, true)).toBe(3);
  });
  it('intervalDays', () => {
    expect([1, 2, 3, 4, 5].map(intervalDays)).toEqual([0, 1, 3, 7, 14]);
    expect(intervalDays(0)).toBe(0);
    expect(intervalDays(9)).toBe(14);
  });
  const pool = [q('q1', 'w1'), q('q2', 'w2'), q('q3', 'w3'), q('q4', 'w4'), q('q5')];
  const progress = [wp('w1', '2026-11-05'), wp('w2', '2026-11-06'), wp('w3', '2026-12-01')];
  it('due first, then unseen, then others', () => {
    const r = pickQuestions(pool, progress, '2026-11-06', 5, seeded(1));
    const ids = r.map((x) => x.id);
    expect(new Set(ids.slice(0, 2))).toEqual(new Set(['q1', 'q2']));
    expect(new Set(ids.slice(2, 4))).toEqual(new Set(['q4', 'q5']));
    expect(ids[4]).toBe('q3');
  });
  it('is deterministic with a seeded rng', () => {
    const a = pickQuestions(pool, progress, '2026-11-06', 5, seeded(7)).map((x) => x.id);
    const b = pickQuestions(pool, progress, '2026-11-06', 5, seeded(7)).map((x) => x.id);
    expect(a).toEqual(b);
  });
  it('never duplicates ids, even with duplicate pool entries', () => {
    const dup = [...pool, q('q1', 'w1'), q('q4', 'w4')];
    const ids = pickQuestions(dup, progress, '2026-11-06', 10, seeded(3)).map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(5);
  });
  it('returns fewer than n for a small pool, and [] for n <= 0', () => {
    expect(pickQuestions(pool, [], '2026-11-06', 50)).toHaveLength(5);
    expect(pickQuestions(pool, [], '2026-11-06', 0)).toEqual([]);
    expect(pickQuestions(pool, [], '2026-11-06', -2)).toEqual([]);
  });
  it('floors fractional n', () => {
    expect(pickQuestions(pool, [], '2026-11-06', 2.5, seeded(1))).toHaveLength(2);
  });
  it('handles rng returning 0 and 1.0', () => {
    for (const v of [0, 1]) {
      const ids = pickQuestions(pool, progress, '2026-11-06', 5, () => v).map((x) => x.id);
      expect(ids).toHaveLength(5);
      expect(new Set(ids).size).toBe(5);
    }
  });
  it('prefers distinct words, repeating only when needed', () => {
    const p = [q('a1', 'w1'), q('a2', 'w1'), q('b1', 'w2')];
    const two = pickQuestions(p, [], '2026-11-06', 2, seeded(5));
    expect(new Set(two.map((x) => x.wordId))).toEqual(new Set(['w1', 'w2']));
    expect(pickQuestions(p, [], '2026-11-06', 3, seeded(5))).toHaveLength(3);
  });
});

describe('daily-limit', () => {
  it('dateKey is the local date', () => {
    expect(dateKey(new Date(2026, 10, 6))).toBe('2026-11-06');
    expect(dateKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
  it('resets on a new day then adds', () => {
    expect(recordPlay({ dateKey: '2026-11-06', playSeconds: 100 }, 30, '2026-11-07')).toEqual({
      dateKey: '2026-11-07',
      playSeconds: 30,
    });
  });
  it('adds on the same day, capped at 60 per call', () => {
    const s = { dateKey: '2026-11-06', playSeconds: 100 };
    expect(recordPlay(s, 20, '2026-11-06').playSeconds).toBe(120);
    expect(recordPlay(s, 500, '2026-11-06').playSeconds).toBe(160);
  });
  it('treats NaN and negative seconds as 0', () => {
    const s = { dateKey: '2026-11-06', playSeconds: 100 };
    expect(recordPlay(s, NaN, '2026-11-06').playSeconds).toBe(100);
    expect(recordPlay(s, -50, '2026-11-06').playSeconds).toBe(100);
  });
  it('keeps adding to the stored day when the clock moves backwards', () => {
    const s = { dateKey: '2026-11-06', playSeconds: 100 };
    expect(recordPlay(s, 30, '2026-11-05')).toEqual({ dateKey: '2026-11-06', playSeconds: 130 });
  });
  it('clamps Infinity to 60 and NaN to 0', () => {
    const s = { dateKey: '2026-11-06', playSeconds: 100 };
    expect(recordPlay(s, Infinity, '2026-11-06').playSeconds).toBe(160);
    expect(recordPlay(s, -Infinity, '2026-11-06').playSeconds).toBe(100);
  });
  it('starts from empty state', () => {
    expect(recordPlay({ dateKey: '', playSeconds: 0 }, 10, '2026-11-06')).toEqual({
      dateKey: '2026-11-06',
      playSeconds: 10,
    });
  });
  it('isTimeUp', () => {
    expect(isTimeUp({ dateKey: '2026-11-06', playSeconds: 1800 }, 1800, '2026-11-06')).toBe(true);
    expect(isTimeUp({ dateKey: '2026-11-06', playSeconds: 1799 }, 1800, '2026-11-06')).toBe(false);
    expect(isTimeUp({ dateKey: '2026-11-06', playSeconds: 5000 }, 1800, '2026-11-07')).toBe(false);
  });
  it('isTimeUp still applies when the clock moved back', () => {
    expect(isTimeUp({ dateKey: '2026-11-06', playSeconds: 1800 }, 1800, '2026-11-05')).toBe(true);
    expect(isTimeUp({ dateKey: '2026-11-06', playSeconds: 10 }, 1800, '2026-11-05')).toBe(false);
  });
  it('isTimeUp is false for the empty state', () => {
    expect(isTimeUp({ dateKey: '', playSeconds: 0 }, 1800, '2026-11-06')).toBe(false);
  });
});

describe('wallet', () => {
  it('rewardFor', () => {
    expect(rewardFor(false, 5)).toBe(0);
    expect(rewardFor(true, 1)).toBe(10);
    expect(rewardFor(true, 2)).toBe(10);
    expect(rewardFor(true, 3)).toBe(15);
  });
  it('canBuy', () => {
    expect(canBuy(100, 100)).toBe(true);
    expect(canBuy(99, 100)).toBe(false);
    expect(canBuy(10, -5)).toBe(false);
  });
});
