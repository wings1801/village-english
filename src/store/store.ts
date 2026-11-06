import { openDB, type IDBPDatabase } from 'idb';
import { GRADES } from '../domain/grades';
import type { PlacedDecor } from '../domain/village';
import type { BackupV1, DayState, Settings, WordProgress } from '../domain/types';

export interface Store {
  getProgress(wordId: string): Promise<WordProgress | undefined>;
  putProgress(p: WordProgress): Promise<void>;
  allProgress(): Promise<WordProgress[]>;
  getBells(): Promise<number>;
  addBells(n: number): Promise<number>;
  getOwned(): Promise<string[]>;
  getPlaced(): Promise<PlacedDecor[]>;
  putPlaced(p: PlacedDecor[]): Promise<void>;
  /**
   * Atomic purchase in one transaction. Fails (ok:false, nothing written) when the item is already
   * owned, bells < price, the price is not a non-negative integer, or decorId is not a non-empty string.
   */
  buyDecor(decorId: string, price: number): Promise<{ ok: boolean; bells: number; owned: string[] }>;
  getSettings(): Promise<Settings>;
  putSettings(s: Settings): Promise<void>;
  getDay(): Promise<DayState>;
  putDay(d: DayState): Promise<void>;
  /**
   * Parent "reset today": the current day becomes { dateKey: today, playSeconds: 0 }. A stored day earlier
   * than `today` is appended to the log first (like putDay); a stored day LATER than `today` (the clock
   * moved forward earlier) is discarded without logging, and log entries later than `today` are dropped.
   * The in-memory fallback store has no days log, so the log clauses apply to the IndexedDB store only.
   * Rejects Error('invalid today') unless `today` looks like YYYY-MM-DD.
   */
  resetDay(today: string): Promise<void>;
  getDaysLog(): Promise<DayState[]>;
  exportAll(): Promise<BackupV1>;
  importAll(b: unknown): Promise<void>;
  health(): Promise<{ ok: boolean; reason?: string }>;
  /** Closes the underlying IndexedDB handle so a later openStore() on the same name is not blocked. Idempotent. */
  close(): void;
}

/**
 * Test seam: `beforeWrite` runs at the start of every write operation. If it
 * throws, the error is handled exactly like a failure raised by IndexedDB
 * itself (e.g. a QuotaExceededError DOMException), without touching idb.
 */
export interface StoreOptions {
  beforeWrite?: () => void;
}

const DAYS_LOG_CAP = 400;
const DEFAULT_SETTINGS: Settings = { dailyLimitSeconds: 1800 };
const TODAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMPTY_DAY: DayState = { dateKey: '', playSeconds: 0 };

// "progress" holds one record per word; "kv" holds the other key groups
// (bells, owned, placed, settings, day, daysLog) under fixed keys.
type KvKey = 'bells' | 'owned' | 'placed' | 'settings' | 'day' | 'daysLog';

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isUnit = (v: unknown): v is number => isNum(v) && v >= 0 && v <= 1;
const isPlaced = (v: unknown): v is PlacedDecor =>
  isObj(v) && isStr(v.decorId) && isUnit(v.x) && isUnit(v.y);
const isDay = (v: unknown): v is DayState =>
  isObj(v) && isStr(v.dateKey) && isNum(v.playSeconds);
const isProgress = (v: unknown): v is WordProgress =>
  isObj(v) &&
  isStr(v.wordId) &&
  isNum(v.box) &&
  Number.isInteger(v.box) &&
  v.box >= 1 &&
  v.box <= 5 &&
  isStr(v.dueDate) &&
  isNum(v.seen) &&
  isNum(v.wrong);

/**
 * Pure shape check for a backup value: the single source of truth used by importAll and by the parent
 * screen's pre-check. `reason` is a short English field name such as "version" or "progress".
 */
export function validateBackupShape(b: unknown): { ok: true } | { ok: false; reason: string } {
  const bad = (reason: string) => ({ ok: false as const, reason });
  if (!isObj(b)) return bad('not an object');
  if (b.version !== 1) return bad('unsupported version');
  if (!isStr(b.exportedAt)) return bad('exportedAt');
  if (!Array.isArray(b.progress) || !b.progress.every(isProgress)) return bad('progress');
  if (!isNum(b.bells)) return bad('bells');
  if (!Array.isArray(b.owned) || !b.owned.every(isStr)) return bad('owned');
  if (!Array.isArray(b.placed) || !b.placed.every(isPlaced)) return bad('placed');
  if (!isDay(b.day)) return bad('day');
  if (!Array.isArray(b.daysLog) || !b.daysLog.every(isDay)) return bad('daysLog');
  const s = b.settings;
  if (
    !isObj(s) ||
    !isNum(s.dailyLimitSeconds) ||
    (s.pinHash !== undefined && !isStr(s.pinHash)) ||
    (s.pinSalt !== undefined && !isStr(s.pinSalt)) ||
    (s.currentGrade !== undefined && !(isStr(s.currentGrade) && (GRADES as readonly string[]).includes(s.currentGrade)))
  )
    return bad('settings');
  return { ok: true };
}

function parseBackup(b: unknown): BackupV1 {
  const r = validateBackupShape(b);
  if (!r.ok) throw new Error(`invalid backup: ${r.reason}`);
  return b as BackupV1;
}

export async function openStore(name = 'village-english', opts: StoreOptions = {}): Promise<Store> {
  const db: IDBPDatabase = await openDB(name, 1, {
    upgrade(d) {
      d.createObjectStore('progress', { keyPath: 'wordId' });
      d.createObjectStore('kv');
    },
  });
  try {
    void Promise.resolve(navigator.storage?.persist?.()).catch(() => {});
  } catch {
    /* persistence is best effort */
  }

  let quotaHit = false;
  const write = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      opts.beforeWrite?.();
      return await fn();
    } catch (e) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') quotaHit = true;
      throw e;
    }
  };
  const kvGet = async <T>(key: KvKey, fallback: T): Promise<T> =>
    ((await db.get('kv', key)) as T | undefined) ?? fallback;

  return {
    getProgress: (id) => db.get('progress', id),
    putProgress: (p) => write(async () => void (await db.put('progress', p))),
    allProgress: () => db.getAll('progress'),
    getBells: () => kvGet<number>('bells', 0),
    addBells: (n) =>
      write(async () => {
        const tx = db.transaction('kv', 'readwrite');
        const next = (((await tx.store.get('bells')) as number | undefined) ?? 0) + n;
        await tx.store.put(next, 'bells');
        await tx.done;
        return next;
      }),
    getOwned: () => kvGet<string[]>('owned', []),
    getPlaced: () => kvGet<PlacedDecor[]>('placed', []),
    putPlaced: (p) => write(async () => void (await db.put('kv', p, 'placed'))),
    buyDecor: (decorId, price) =>
      write(async () => {
        const tx = db.transaction('kv', 'readwrite');
        const rawBells = await tx.store.get('bells');
        const rawOwned = await tx.store.get('owned');
        // Corrupt stored values count as 0 / [] and NaN is never written back.
        const bells = isNum(rawBells) ? rawBells : 0;
        const owned = Array.isArray(rawOwned) ? rawOwned.filter(isStr) : [];
        const valid =
          isStr(decorId) && decorId !== '' && Number.isInteger(price) && price >= 0;
        if (!valid || owned.includes(decorId) || bells < price) {
          await tx.done;
          return { ok: false, bells, owned };
        }
        const next = bells - price;
        const nextOwned = [...owned, decorId];
        await tx.store.put(next, 'bells');
        await tx.store.put(nextOwned, 'owned');
        await tx.done;
        return { ok: true, bells: next, owned: nextOwned };
      }),
    getSettings: async () => ({ ...DEFAULT_SETTINGS, ...(await kvGet<Partial<Settings>>('settings', {})) }),
    putSettings: (s) => write(async () => void (await db.put('kv', s, 'settings'))),
    getDay: () => kvGet<DayState>('day', { ...EMPTY_DAY }),
    putDay: (d) =>
      write(async () => {
        const tx = db.transaction('kv', 'readwrite');
        const prev = ((await tx.store.get('day')) as DayState | undefined) ?? EMPTY_DAY;
        if (prev.dateKey !== '' && prev.dateKey !== d.dateKey) {
          const log = ((await tx.store.get('daysLog')) as DayState[] | undefined) ?? [];
          log.push(prev);
          await tx.store.put(log.slice(-DAYS_LOG_CAP), 'daysLog');
        }
        await tx.store.put(d, 'day');
        await tx.done;
      }),
    resetDay: (today) =>
      write(async () => {
        if (!TODAY_RE.test(today)) throw new Error('invalid today');
        const tx = db.transaction('kv', 'readwrite');
        const prev = ((await tx.store.get('day')) as DayState | undefined) ?? EMPTY_DAY;
        // ISO date strings compare chronologically
        const log = (((await tx.store.get('daysLog')) as DayState[] | undefined) ?? []).filter(
          (e) => e.dateKey <= today,
        );
        if (prev.dateKey !== '' && prev.dateKey < today) log.push(prev);
        await tx.store.put(log.slice(-DAYS_LOG_CAP), 'daysLog');
        await tx.store.put({ dateKey: today, playSeconds: 0 }, 'day');
        await tx.done;
      }),
    getDaysLog: () => kvGet<DayState[]>('daysLog', []),
    async exportAll() {
      const tx = db.transaction(['progress', 'kv'], 'readonly');
      const kv = tx.objectStore('kv');
      const [progress, bells, owned, placed, settings, day, daysLog] = await Promise.all([
        tx.objectStore('progress').getAll(),
        kv.get('bells'),
        kv.get('owned'),
        kv.get('placed'),
        kv.get('settings'),
        kv.get('day'),
        kv.get('daysLog'),
      ]);
      return {
        version: 1,
        exportedAt: new Date().toISOString(),
        progress,
        bells: bells ?? 0,
        owned: owned ?? [],
        placed: placed ?? [],
        day: day ?? { ...EMPTY_DAY },
        daysLog: daysLog ?? [],
        settings: { ...DEFAULT_SETTINGS, ...(settings ?? {}) },
      };
    },
    async importAll(b) {
      const backup = parseBackup(b); // validate fully before any write
      await write(async () => {
        const tx = db.transaction(['progress', 'kv'], 'readwrite');
        const kv = tx.objectStore('kv');
        const ops: Promise<unknown>[] = [tx.objectStore('progress').clear(), kv.clear()];
        for (const p of backup.progress) ops.push(tx.objectStore('progress').put(p));
        ops.push(
          kv.put(backup.bells, 'bells'),
          kv.put(backup.owned, 'owned'),
          kv.put(backup.placed, 'placed'),
          kv.put(backup.settings, 'settings'),
          kv.put(backup.day, 'day'),
          kv.put(backup.daysLog.slice(-DAYS_LOG_CAP), 'daysLog'),
        );
        await Promise.all([...ops, tx.done]);
      });
    },
    async health() {
      return quotaHit ? { ok: false, reason: 'quota' } : { ok: true };
    },
    close() {
      try {
        db.close();
      } catch {
        /* already closed */
      }
    },
  };
}
