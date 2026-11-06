import type { Pose } from '../assets/manifest';
import { poseFor } from './reaction';
import { isTimeUp, recordPlay } from './daily-limit';
import { intervalDays, nextBox, pickQuestions } from './srs';
import type { DayState, Question, Settings, WordProgress } from './types';
import { rewardFor } from './wallet';
import type { Store } from '../store/store';

export interface QuestDeps {
  store: Store;
  pool: Question[];
  today: string;
  rng?: () => number;
  limitSeconds?: number;
  size?: number;
}

export interface AnswerResult {
  correct: boolean;
  reward: number;
  pose: Pose;
  streak: number;
  done: boolean;
}

export interface QuestSession {
  /** Current unanswered question, or null when done / time up / pool empty. */
  next(): Question | null;
  /** Calls are serialized: an overlapping call runs as if it arrived after the previous one finished. */
  answer(given: string): Promise<AnswerResult>;
  hint(): Pose;
  /** Adds active play seconds (serialized with answer); true when the daily limit is reached. */
  tick(seconds: number): Promise<boolean>;
  isDone(): boolean;
  /** bellsEarned counts only rewards whose addBells write succeeded. */
  summary(): { answered: number; correctFirstTry: number; bellsEarned: number };
  readonly timeUp: boolean;
}

const DEFAULT_SETTINGS: Settings = { dailyLimitSeconds: 1800 };

/** today + days, using local date parts (immune to DST and month/year ends). */
function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(y, m - 1, d + days);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

function isRealDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(y, m - 1, d);
  return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d;
}

export async function runQuest(deps: QuestDeps): Promise<QuestSession> {
  const { store, pool, today, rng } = deps;
  if (typeof today !== 'string' || !isRealDate(today)) throw new Error('invalid today');

  let warned = false;
  const warnOnce = (e: unknown, what: string): void => {
    if (warned) return;
    warned = true;
    console.warn(`quest: ${what}`, e);
  };

  // Policy: if loading progress/settings/day fails, warn once and continue with
  // safe defaults (no progress, 1800s limit, empty day) instead of rejecting.
  const load = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      warnOnce(e, 'could not read saved data, using defaults');
      return fallback;
    }
  };
  const [all, settings, loadedDay] = await Promise.all([
    load(() => store.allProgress(), [] as WordProgress[]),
    load(() => store.getSettings(), DEFAULT_SETTINGS),
    load(() => store.getDay(), { dateKey: '', playSeconds: 0 } as DayState),
  ]);
  const limit = deps.limitSeconds ?? settings.dailyLimitSeconds;
  let day: DayState = loadedDay;
  let timeUp = isTimeUp(day, limit, today);
  const list = timeUp ? [] : pickQuestions(pool, all, today, deps.size ?? 5, rng);

  let index = 0;
  let streak = 0;
  let wrongOnCurrent = false;
  let firstTry = 0;
  let bells = 0;

  const safe = async (fn: () => Promise<unknown>): Promise<boolean> => {
    try {
      await fn();
      return true;
    } catch (e) {
      warnOnce(e, 'could not save progress');
      return false;
    }
  };
  const isDone = () => timeUp || index >= list.length;

  // Serialize answer/tick: each op starts only after the previous one settled.
  let chain: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(op: () => Promise<T>): Promise<T> => {
    const run = chain.then(op, op);
    chain = run.catch(() => {});
    return run;
  };

  /** undefined = read failed (skip the write); a fresh record only when the read succeeded with nothing. */
  async function loadProgress(q: Question): Promise<WordProgress | undefined> {
    try {
      return (await store.getProgress(q.wordId!)) ?? { wordId: q.wordId!, box: 1, dueDate: today, seen: 0, wrong: 0 };
    } catch (e) {
      warnOnce(e, 'could not read progress');
      return undefined;
    }
  }

  async function doAnswer(given: string): Promise<AnswerResult> {
    if (isDone()) throw new Error('quest finished');
    const q = list[index];
    const correct = (q.kind === 'letter-tiles' ? given.toLowerCase() : given) === q.answer;

    if (!correct) {
      streak = 0;
      if (!wrongOnCurrent) {
        wrongOnCurrent = true;
        if (q.wordId) {
          const p = await loadProgress(q);
          if (p) {
            const box = nextBox(p.box, false);
            await safe(() =>
              store.putProgress({ ...p, box, seen: p.seen + 1, wrong: p.wrong + 1, dueDate: addDays(today, intervalDays(box)) }),
            );
          }
        }
      }
      return { correct: false, reward: 0, pose: poseFor('wrong'), streak: 0, done: false };
    }

    let reward = 0;
    if (!wrongOnCurrent) {
      streak += 1;
      firstTry += 1;
      reward = rewardFor(true, streak);
      if (q.wordId) {
        const p = await loadProgress(q);
        if (p) {
          const box = nextBox(p.box, true);
          await safe(() => store.putProgress({ ...p, box, seen: p.seen + 1, dueDate: addDays(today, intervalDays(box)) }));
        }
      }
      if (reward > 0 && (await safe(() => store.addBells(reward)))) bells += reward;
    }
    const outStreak = streak;
    index += 1;
    wrongOnCurrent = false;
    return {
      correct: true,
      reward,
      pose: poseFor(reward > 0 && outStreak >= 3 ? 'streak' : 'correct'),
      streak: outStreak,
      done: isDone(),
    };
  }

  return {
    get timeUp() {
      return timeUp;
    },
    next: () => (isDone() ? null : list[index]),
    isDone,
    hint: () => poseFor('hint'),
    summary: () => ({ answered: index, correctFirstTry: firstTry, bellsEarned: bells }),
    tick: (seconds) =>
      enqueue(async () => {
        day = recordPlay(day, seconds, today);
        await safe(() => store.putDay(day));
        const up = isTimeUp(day, limit, today);
        if (up) timeUp = true;
        return up;
      }),
    answer: (given) => enqueue(() => doAnswer(given)),
  };
}
