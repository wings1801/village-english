import { dateKey } from '../domain/daily-limit';
import { loadQuestions } from '../domain/content';
import type { GradeId } from '../domain/grades';
import type { DayState, Settings, WordProgress } from '../domain/types';
import { loadWordGrades } from '../domain/word-grades';
import { getDegraded } from '../store/degraded';
import type { Store } from '../store/store';

export interface GradeApproval {
  parent: number;
  ai: number;
  total: number;
}
export type ApprovalSummary = Record<'5' | '4', GradeApproval>;

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** Reads content/approval-summary.json (written by build-content). Never throws; any problem yields null (no summary shown). */
export async function loadApprovalSummary(
  fetchFn?: typeof fetch,
  baseUrl: string = import.meta.env.BASE_URL,
): Promise<ApprovalSummary | null> {
  try {
    const f = fetchFn ?? fetch;
    const res = await f(`${baseUrl}content/approval-summary.json`);
    if (res.status !== 200) return null;
    const data: unknown = await res.json();
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
    const out = {} as ApprovalSummary;
    for (const g of ['5', '4'] as const) {
      const e = (data as Record<string, unknown>)[g] as Partial<GradeApproval> | undefined;
      if (typeof e !== 'object' || e === null || !isCount(e.parent) || !isCount(e.ai) || !isCount(e.total)) return null;
      out[g] = { parent: e.parent, ai: e.ai, total: e.total };
    }
    return out;
  } catch {
    return null;
  }
}

export interface DashData {
  today: string;
  settings: Settings;
  day: DayState;
  daysLog: DayState[];
  progress: WordProgress[];
  wordGrades: Record<string, GradeId>;
  /** Approved questions per playable grade. */
  counts: Record<'5' | '4', number>;
  /** Who approved the shipped questions; null when the summary file is missing or unreadable. */
  approval: ApprovalSummary | null;
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
  const [settings, day, daysLog, progress, wordGrades, q5, q4, approval, health, persisted] = await Promise.all([
    store.getSettings(),
    store.getDay(),
    store.getDaysLog().catch(() => [] as DayState[]),
    store.allProgress(),
    loadWordGrades(),
    loadQuestions('5'),
    loadQuestions('4'),
    loadApprovalSummary(),
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
    approval,
    health,
    degradedReason: getDegraded(),
    persisted,
  };
}
