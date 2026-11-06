import { dateKey } from '../domain/daily-limit';
import { loadQuestions } from '../domain/content';
import type { GradeId } from '../domain/grades';
import type { DayState, Settings, WordProgress } from '../domain/types';
import { loadWordGrades } from '../domain/word-grades';
import { getDegraded } from '../store/degraded';
import type { Store } from '../store/store';

export interface DashData {
  today: string;
  settings: Settings;
  day: DayState;
  daysLog: DayState[];
  progress: WordProgress[];
  wordGrades: Record<string, GradeId>;
  /** Approved questions per playable grade. */
  counts: Record<'5' | '4', number>;
  health: { ok: boolean; reason?: string };
  degradedReason: string | null;
  /** null when the browser cannot say. */
  persisted: boolean | null;
}

async function isPersisted(): Promise<boolean | null> {
  try {
    const r = await navigator.storage?.persisted?.();
    return typeof r === 'boolean' ? r : null;
  } catch {
    return null;
  }
}

/** Everything the dashboard shows. Rejects only if the store itself cannot be read. */
export async function loadDashData(store: Store): Promise<DashData> {
  const [settings, day, daysLog, progress, wordGrades, q5, q4, health, persisted] = await Promise.all([
    store.getSettings(),
    store.getDay(),
    store.getDaysLog().catch(() => [] as DayState[]),
    store.allProgress(),
    loadWordGrades(),
    loadQuestions('5'),
    loadQuestions('4'),
    store.health().catch((e: unknown) => ({ ok: false, reason: String(e) })),
    isPersisted(),
  ]);
  return {
    today: dateKey(new Date()),
    settings,
    day,
    daysLog,
    progress,
    wordGrades,
    counts: { '5': q5.length, '4': q4.length },
    health,
    degradedReason: getDegraded(),
    persisted,
  };
}
