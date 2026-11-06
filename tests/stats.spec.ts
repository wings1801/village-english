import { describe, expect, it } from 'vitest';
import { masteryByGrade, minutesByDay, weakWords } from '../src/domain/stats';
import type { WordProgress } from '../src/domain/types';

const w = (wordId: string, seen: number, wrong: number, box: WordProgress['box'] = 1): WordProgress => ({
  wordId, box, dueDate: '2026-11-07', seen, wrong,
});

describe('weakWords', () => {
  it('filters seen>=2 and wrong>0, sorts by ratio, then wrong, then wordId', () => {
    const p = [
      w('a', 4, 2), // 0.5
      w('b', 2, 1), // 0.5, fewer wrong
      w('c', 10, 9), // 0.9
      w('d', 1, 1), // seen<2
      w('e', 5, 0), // wrong 0
      w('f', 4, 2), // 0.5, ties with a -> wordId
      w('g', 3, 3), // 1.0
    ];
    expect(weakWords(p, 10).map((x) => x.wordId)).toEqual(['g', 'c', 'a', 'f', 'b']);
  });
  it('limits to n; bad n -> []', () => {
    const p = [w('a', 2, 1), w('b', 2, 2)];
    expect(weakWords(p, 1).map((x) => x.wordId)).toEqual(['b']);
    expect(weakWords(p, 0)).toEqual([]);
    expect(weakWords(p, -3)).toEqual([]);
    expect(weakWords(p, NaN)).toEqual([]);
  });
  it('does not mutate input', () => {
    const p = [w('a', 2, 1), w('b', 2, 2)];
    weakWords(p, 5);
    expect(p.map((x) => x.wordId)).toEqual(['a', 'b']);
  });
});

describe('minutesByDay', () => {
  const d = (dateKey: string, playSeconds: number) => ({ dateKey, playSeconds });
  it('fills missing days with 0, oldest first, ending today', () => {
    expect(minutesByDay([d('2026-11-06', 600)], 3, '2026-11-07')).toEqual([
      { dateKey: '2026-11-05', minutes: 0 },
      { dateKey: '2026-11-06', minutes: 10 },
      { dateKey: '2026-11-07', minutes: 0 },
    ]);
  });
  it('rounds seconds to minutes', () => {
    const m = (s: number) => minutesByDay([d('2026-11-07', s)], 1, '2026-11-07')[0].minutes;
    expect([m(29), m(30), m(89), m(90)]).toEqual([0, 1, 1, 2]);
  });
  it('crosses month and year ends and leap days', () => {
    expect(minutesByDay([], 3, '2027-01-01').map((x) => x.dateKey)).toEqual(['2026-12-30', '2026-12-31', '2027-01-01']);
    expect(minutesByDay([], 3, '2026-03-01').map((x) => x.dateKey)).toEqual(['2026-02-27', '2026-02-28', '2026-03-01']);
    expect(minutesByDay([], 3, '2028-03-01').map((x) => x.dateKey)).toEqual(['2028-02-28', '2028-02-29', '2028-03-01']);
  });
  it('sums duplicate dateKeys', () => {
    expect(minutesByDay([d('2026-11-07', 60), d('2026-11-07', 120)], 1, '2026-11-07')).toEqual([
      { dateKey: '2026-11-07', minutes: 3 },
    ]);
  });
  it('returns exactly 7 entries', () => {
    expect(minutesByDay([], 7, '2026-11-07')).toHaveLength(7);
  });
  it('invalid today or last -> []', () => {
    expect(minutesByDay([], 7, 'nope')).toEqual([]);
    expect(minutesByDay([], 7, '2026-13-01')).toEqual([]);
    expect(minutesByDay([], 7, '2026-02-30')).toEqual([]);
    expect(minutesByDay([], 0, '2026-11-07')).toEqual([]);
    expect(minutesByDay([], NaN, '2026-11-07')).toEqual([]);
  });
});

describe('masteryByGrade', () => {
  it('counts totals, seen and mastered; ignores unknown words', () => {
    const grades = { a: '5', b: '5', c: '5', x: '4' } as const;
    const out = masteryByGrade(
      [w('a', 1, 0, 4), w('b', 3, 1, 2), w('x', 2, 0, 5), w('zzz', 9, 0, 5), w('c', 0, 0, 5)],
      grades,
    );
    expect(out['5']).toEqual({ total: 3, seen: 2, mastered: 1 });
    expect(out['4']).toEqual({ total: 1, seen: 1, mastered: 1 });
    for (const g of ['3', 'p2', '2', 'p1', '1'] as const) expect(out[g]).toEqual({ total: 0, seen: 0, mastered: 0 });
    expect(Object.keys(out)).toHaveLength(7);
  });
});

describe('minutesByDay bounds', () => {
  it('rejects huge, infinite, NaN and fractional last; accepts 3660', () => {
    expect(minutesByDay([], 1e9, '2026-11-07')).toEqual([]);
    expect(minutesByDay([], Infinity, '2026-11-07')).toEqual([]);
    expect(minutesByDay([], NaN, '2026-11-07')).toEqual([]);
    expect(minutesByDay([], 2.5, '2026-11-07')).toEqual([]);
    expect(minutesByDay([], 3661, '2026-11-07')).toEqual([]);
    expect(minutesByDay([], 3660, '2026-11-07')).toHaveLength(3660);
  });
});

describe('masteryByGrade robustness', () => {
  it('counts a duplicated wordId once, using the highest box then seen', () => {
    const out = masteryByGrade([w('a', 1, 0, 2), w('a', 5, 0, 4), w('a', 9, 0, 4)], { a: '5' });
    expect(out['5']).toEqual({ total: 1, seen: 1, mastered: 1 });
    const out2 = masteryByGrade([w('a', 0, 0, 5), w('a', 0, 0, 1)], { a: '5' });
    expect(out2['5']).toEqual({ total: 1, seen: 0, mastered: 0 });
  });
  it('ignores inherited Object.prototype names as progress wordIds', () => {
    const out = masteryByGrade(
      [w('constructor', 3, 0, 5), w('__proto__', 3, 0, 5), w('toString', 3, 0, 5)],
      { a: '5' },
    );
    expect(out['5']).toEqual({ total: 1, seen: 0, mastered: 0 });
  });
  it('treats own keys with those names as ordinary words', () => {
    const table = JSON.parse('{"constructor":"5","__proto__":"4","toString":"5"}') as Record<string, '5' | '4'>;
    const out = masteryByGrade([w('constructor', 3, 0, 5), w('toString', 1, 0, 1)], table);
    expect(out['5']).toEqual({ total: 2, seen: 2, mastered: 1 });
    expect(out['4'].total).toBe(1);
  });
});
