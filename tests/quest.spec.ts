import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openStore, type Store } from '../src/store/store';
import { runQuest } from '../src/domain/quest';
import type { Question, WordProgress } from '../src/domain/types';

let n = 0;
let store: Store;
let failWrites = false;
const TODAY = '2026-11-06';

beforeEach(async () => {
  failWrites = false;
  store = await openStore(`quest-db-${++n}`, {
    beforeWrite: () => {
      if (failWrites) throw new DOMException('full', 'QuotaExceededError');
    },
  });
});
afterEach(() => {
  store.close();
  vi.restoreAllMocks();
});

const mk = (i: number, over: Partial<Question> = {}): Question => ({
  id: `q${i}`,
  grade: '5',
  kind: 'pick-word',
  wordId: `w${i}`,
  promptJa: 'x',
  choices: [{ id: 'a', textEn: 'a' }, { id: 'b', textEn: 'b' }],
  answer: 'a',
  source: { name: 's', license: 'l' },
  ...over,
});
const pool = (k = 8) => Array.from({ length: k }, (_, i) => mk(i));
const seq = () => 0.5;
const wp = (wordId: string, box: WordProgress['box'], dueDate = '2000-01-01'): WordProgress => ({
  wordId, box, dueDate, seen: 2, wrong: 0,
});

describe('runQuest', () => {
  it('ends after 5 correct answers', async () => {
    const s = await runQuest({ store, pool: pool(), today: TODAY, rng: seq });
    for (let i = 0; i < 5; i++) {
      expect(s.isDone()).toBe(false);
      const q = s.next()!;
      const r = await s.answer(q.answer);
      expect(r.done).toBe(i === 4);
    }
    expect(s.isDone()).toBe(true);
    expect(s.next()).toBeNull();
    expect(s.summary()).toEqual({ answered: 5, correctFirstTry: 5, bellsEarned: 10 + 10 + 15 + 15 + 15 });
    expect(await store.getBells()).toBe(65);
  });

  it('respects a custom size', async () => {
    const s = await runQuest({ store, pool: pool(), today: TODAY, rng: seq, size: 2 });
    await s.answer('a');
    expect((await s.answer('a')).done).toBe(true);
  });

  it('correct first try raises box and computes dueDate', async () => {
    await store.putProgress(wp('w0', 3));
    const s = await runQuest({ store, pool: [mk(0)], today: '2026-11-30', rng: seq });
    const r = await s.answer('a');
    expect(r.correct).toBe(true);
    expect(r.reward).toBe(10);
    expect(r.pose).toBe('happy');
    // box 3 -> 4, interval 7
    expect(await store.getProgress('w0')).toEqual({ wordId: 'w0', box: 4, dueDate: '2026-12-07', seen: 3, wrong: 0 });
  });

  it('dueDate crosses year end', async () => {
    await store.putProgress(wp('w0', 3));
    const s = await runQuest({ store, pool: [mk(0)], today: '2026-12-28', rng: seq });
    await s.answer('a');
    expect((await store.getProgress('w0'))!.dueDate).toBe('2027-01-04');
  });

  it('new word starts at box 1 then moves to 2', async () => {
    const s = await runQuest({ store, pool: [mk(0)], today: TODAY, rng: seq });
    await s.answer('a');
    expect(await store.getProgress('w0')).toEqual({ wordId: 'w0', box: 2, dueDate: '2026-11-07', seen: 1, wrong: 0 });
  });

  it('bells 10 / 10 / 15 for consecutive first-try correct answers', async () => {
    const s = await runQuest({ store, pool: pool(), today: TODAY, rng: seq });
    const rewards: number[] = [];
    const poses: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await s.answer('a');
      rewards.push(r.reward);
      poses.push(r.pose);
    }
    expect(rewards).toEqual([10, 10, 15]);
    expect(poses).toEqual(['happy', 'happy', 'excited']);
  });

  it('wrong -> box 1, 0 bells, same question stays, then correct earns 0 and does not re-touch progress', async () => {
    await store.putProgress(wp('w0', 4));
    const s = await runQuest({ store, pool: [mk(0), mk(1)], today: TODAY, rng: seq, size: 2 });
    const first = s.next()!;
    await store.putProgress(wp(first.wordId!, 4));
    const w = await s.answer('b');
    expect(w).toMatchObject({ correct: false, reward: 0, pose: 'surprised', streak: 0, done: false });
    expect(s.next()).toBe(first);
    expect(await store.getProgress(first.wordId!)).toEqual({ wordId: first.wordId, box: 1, dueDate: TODAY, seen: 3, wrong: 1 });
    const w2 = await s.answer('b'); // second wrong: no further progress change
    expect(w2.correct).toBe(false);
    expect((await store.getProgress(first.wordId!))!.wrong).toBe(1);
    const c = await s.answer('a');
    expect(c).toMatchObject({ correct: true, reward: 0, done: false });
    expect(await store.getProgress(first.wordId!)).toEqual({ wordId: first.wordId, box: 1, dueDate: TODAY, seen: 3, wrong: 1 });
    expect(await store.getBells()).toBe(0);
    expect(s.next()).not.toBe(first);
    expect(s.summary()).toEqual({ answered: 1, correctFirstTry: 0, bellsEarned: 0 });
  });

  it('wrong answer resets the streak', async () => {
    const s = await runQuest({ store, pool: pool(), today: TODAY, rng: seq });
    await s.answer('a');
    await s.answer('a');
    await s.answer('b');
    await s.answer('a'); // retry, no bells
    const r1 = await s.answer('a');
    const r2 = await s.answer('a');
    expect([r1.reward, r1.streak, r2.reward, r2.streak]).toEqual([10, 1, 10, 2]);
  });

  it('letter-tiles lowercases the given word', async () => {
    const q = mk(0, { kind: 'letter-tiles', answer: 'cat', choices: undefined });
    const s = await runQuest({ store, pool: [q], today: TODAY, rng: seq });
    expect((await s.answer('CAT')).correct).toBe(true);
  });

  it('other kinds compare exactly', async () => {
    const s = await runQuest({ store, pool: [mk(0)], today: TODAY, rng: seq });
    expect((await s.answer('A')).correct).toBe(false);
  });

  it('time up at creation', async () => {
    await store.putDay({ dateKey: TODAY, playSeconds: 1800 });
    const s = await runQuest({ store, pool: pool(), today: TODAY, rng: seq });
    expect(s.timeUp).toBe(true);
    expect(s.next()).toBeNull();
    expect(s.isDone()).toBe(true);
    await expect(s.answer('a')).rejects.toThrow('quest finished');
  });

  it('uses settings limit and explicit limitSeconds', async () => {
    await store.putSettings({ dailyLimitSeconds: 100 });
    await store.putDay({ dateKey: TODAY, playSeconds: 100 });
    expect((await runQuest({ store, pool: pool(), today: TODAY })).timeUp).toBe(true);
    expect((await runQuest({ store, pool: pool(), today: TODAY, limitSeconds: 500 })).timeUp).toBe(false);
  });

  it('tick reaches the limit, returns true and persists', async () => {
    const s = await runQuest({ store, pool: pool(), today: TODAY, rng: seq, limitSeconds: 90 });
    expect(await s.tick(60)).toBe(false);
    expect(await s.tick(30)).toBe(true);
    expect(await store.getDay()).toEqual({ dateKey: TODAY, playSeconds: 90 });
  });

  it('answer after done rejects', async () => {
    const s = await runQuest({ store, pool: [mk(0)], today: TODAY, rng: seq, size: 1 });
    await s.answer('a');
    await expect(s.answer('a')).rejects.toThrow('quest finished');
  });

  it('empty pool is done immediately, not time up', async () => {
    const s = await runQuest({ store, pool: [], today: TODAY });
    expect(s.next()).toBeNull();
    expect(s.isDone()).toBe(true);
    expect(s.timeUp).toBe(false);
  });

  it('hint returns thinking without state change', async () => {
    const s = await runQuest({ store, pool: pool(), today: TODAY, rng: seq });
    const q = s.next();
    expect(s.hint()).toBe('thinking');
    expect(s.next()).toBe(q);
    expect(s.summary().answered).toBe(0);
  });

  it('a failing store write does not break answer and warns once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const s = await runQuest({ store, pool: pool(), today: TODAY, rng: seq });
    failWrites = true;
    const r1 = await s.answer('a');
    const r2 = await s.answer('a');
    expect(r1).toMatchObject({ correct: true, reward: 10 });
    expect(r2.correct).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    await s.tick(5); // tick failure shares the same once-per-session warning
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('questions without wordId store no progress but give bells', async () => {
    const q = mk(0, { wordId: undefined });
    const s = await runQuest({ store, pool: [q], today: TODAY, rng: seq });
    const r = await s.answer('a');
    expect(r.reward).toBe(10);
    expect(await store.allProgress()).toEqual([]);
    expect(await store.getBells()).toBe(10);
  });

  describe('fix round 1', () => {
    it('overlapping answers never double-pay or corrupt', async () => {
      const s = await runQuest({ store, pool: pool(), today: TODAY, rng: seq });
      const [r1, r2] = await Promise.all([s.answer('a'), s.answer('a')]);
      expect([r1.streak, r2.streak]).toEqual([1, 2]);
      expect(s.summary()).toEqual({ answered: 2, correctFirstTry: 2, bellsEarned: 20 });
      expect(await store.getBells()).toBe(20);
    });

    it('five overlapping answers finish exactly once', async () => {
      const s = await runQuest({ store, pool: pool(), today: TODAY, rng: seq });
      const rs = await Promise.all([1, 2, 3, 4, 5].map(() => s.answer('a')));
      expect(rs.map((r) => r.done)).toEqual([false, false, false, false, true]);
      expect(await store.getBells()).toBe(65);
      await expect(s.answer('a')).rejects.toThrow('quest finished');
    });

    it('concurrent wrong taps count wrong/seen once', async () => {
      const s = await runQuest({ store, pool: [mk(0)], today: TODAY, rng: seq });
      await Promise.all([s.answer('b'), s.answer('b')]);
      expect(await store.getProgress('w0')).toMatchObject({ box: 1, seen: 1, wrong: 1 });
    });

    it('tick and answer interleaved stay consistent', async () => {
      const s = await runQuest({ store, pool: pool(), today: TODAY, rng: seq, limitSeconds: 1000 });
      await Promise.all([s.tick(10), s.answer('a'), s.tick(20), s.answer('a'), s.tick(30)]);
      expect(await store.getDay()).toEqual({ dateKey: TODAY, playSeconds: 60 });
      expect(await store.getBells()).toBe(20);
    });

    it('progress read failure keeps the stored record, still pays bells, warns once', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await store.putProgress(wp('w0', 4));
      const bad: Store = { ...store, getProgress: () => Promise.reject(new Error('read')) };
      const s = await runQuest({ store: bad, pool: [mk(0), mk(1)], today: TODAY, rng: seq, size: 2 });
      await s.answer('b');
      await s.answer('a');
      await s.answer('a');
      expect(await store.getProgress('w0')).toEqual(wp('w0', 4));
      expect(await store.getProgress('w1')).toBeUndefined();
      expect(await store.getBells()).toBe(10);
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('rejects an invalid today', async () => {
      for (const t of ['', '2026-1-06', '2026-02-30', '2026-13-01', 'abc', '2026-11-06T00:00']) {
        await expect(runQuest({ store, pool: pool(), today: t })).rejects.toThrow('invalid today');
      }
    });

    it('dueDate across a leap day', async () => {
      await store.putProgress(wp('w0', 3));
      const s = await runQuest({ store, pool: [mk(0)], today: '2028-02-28', rng: seq });
      await s.answer('a'); // box 4 -> 7 days
      expect((await store.getProgress('w0'))!.dueDate).toBe('2028-03-06');
    });

    it('leap day + 3 days', async () => {
      await store.putProgress(wp('w0', 2));
      const s = await runQuest({ store, pool: [mk(0)], today: '2028-02-28', rng: seq });
      await s.answer('a'); // box 3 -> 3 days
      expect((await store.getProgress('w0'))!.dueDate).toBe('2028-03-02');
    });

    it('dueDate across DST boundaries', async () => {
      for (const [today, due] of [['2026-03-08', '2026-03-15'], ['2026-10-31', '2026-11-07'], ['2026-03-28', '2026-04-04']]) {
        const st = await openStore(`quest-dst-${++n}`);
        await st.putProgress(wp('w0', 3));
        const s = await runQuest({ store: st, pool: [mk(0)], today, rng: seq });
        await s.answer('a');
        expect((await st.getProgress('w0'))!.dueDate).toBe(due);
        st.close();
      }
    });

    it('creation read failures fall back to safe defaults with one warning', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const boom = () => Promise.reject(new Error('read'));
      const bad: Store = { ...store, allProgress: boom, getSettings: boom, getDay: boom };
      const s = await runQuest({ store: bad, pool: pool(), today: TODAY, rng: seq });
      expect(s.timeUp).toBe(false);
      expect(s.next()).not.toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('bellsEarned counts only successful writes', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const s = await runQuest({ store, pool: pool(), today: TODAY, rng: seq });
      await s.answer('a');
      failWrites = true;
      const r = await s.answer('a');
      expect(r.reward).toBe(10);
      expect(s.summary().bellsEarned).toBe(10);
      expect(s.summary().correctFirstTry).toBe(2);
    });

    it('pool smaller than size ends after the pool', async () => {
      const s = await runQuest({ store, pool: pool(3), today: TODAY, rng: seq });
      await s.answer('a');
      await s.answer('a');
      expect((await s.answer('a')).done).toBe(true);
      expect(s.next()).toBeNull();
    });

    it('tick reaching the limit stops the quiz mid-quest', async () => {
      const s = await runQuest({ store, pool: pool(), today: TODAY, rng: seq, limitSeconds: 30 });
      await s.answer('a');
      expect(await s.tick(30)).toBe(true);
      expect(s.timeUp).toBe(true);
      expect(s.next()).toBeNull();
      expect(s.isDone()).toBe(true);
      await expect(s.answer('a')).rejects.toThrow('quest finished');
    });

    it('tick tolerates NaN, negative and huge seconds', async () => {
      const s = await runQuest({ store, pool: pool(), today: TODAY, rng: seq, limitSeconds: 1000 });
      await s.tick(NaN);
      await s.tick(-5);
      expect((await store.getDay()).playSeconds).toBe(0);
      await s.tick(1e9);
      expect((await store.getDay()).playSeconds).toBe(60);
    });
  });
});
