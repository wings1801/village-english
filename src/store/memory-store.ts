import type { DayState, Settings, WordProgress } from '../domain/types';
import type { PlacedDecor } from '../domain/village';
import type { Store } from './store';

export const FALLBACK_DAY_KEY = 'village-english.fallback-day.v1';

function readDay(): DayState {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(FALLBACK_DAY_KEY) ?? 'null');
    if (typeof v === 'object' && v !== null) {
      const d = v as Partial<DayState>;
      if (typeof d.dateKey === 'string' && typeof d.playSeconds === 'number' && Number.isFinite(d.playSeconds))
        return { dateKey: d.dateKey, playSeconds: d.playSeconds };
    }
  } catch {
    /* no localStorage */
  }
  return { dateKey: '', playSeconds: 0 };
}

/**
 * Minimal in-memory stand-in used by the quest screen when IndexedDB is
 * unavailable, so the child can still play. The ONLY thing persisted is the day
 * state (dateKey + playSeconds), mirrored to localStorage so the daily limit
 * survives a reload; progress, bells, owned and placed decor are kept in memory only. Settings
 * writes, the days log and export/import reject.
 */
export function createMemoryStore(): Store {
  const progress = new Map<string, WordProgress>();
  let bells = 0;
  let owned: string[] = [];
  let placed: PlacedDecor[] = [];
  let day: DayState = readDay();
  const settings: Settings = { dailyLimitSeconds: 1800 };
  const unsupported = () => Promise.reject(new Error('not supported by the in-memory store'));
  return {
    getProgress: async (id) => progress.get(id),
    putProgress: async (p) => void progress.set(p.wordId, p),
    allProgress: async () => [...progress.values()],
    getBells: async () => bells,
    addBells: async (n) => (bells += n),
    getOwned: async () => [...owned],
    getPlaced: async () => [...placed],
    putPlaced: async (p) => void (placed = [...p]),
    buyDecor: async (decorId, price) => {
      const valid = typeof decorId === 'string' && decorId !== '' && Number.isInteger(price) && price >= 0;
      if (!valid || owned.includes(decorId) || bells < price) return { ok: false, bells, owned: [...owned] };
      bells -= price;
      owned = [...owned, decorId];
      return { ok: true, bells, owned: [...owned] };
    },
    getSettings: async () => settings,
    putSettings: unsupported,
    getDay: async () => day,
    putDay: async (d) => {
      day = d;
      try {
        localStorage.setItem(FALLBACK_DAY_KEY, JSON.stringify(d));
      } catch {
        /* keep in memory only */
      }
    },
    resetDay: async (today) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error('invalid today');
      day = { dateKey: today, playSeconds: 0 }; // the days log is not kept by this store
      try {
        localStorage.setItem(FALLBACK_DAY_KEY, JSON.stringify(day));
      } catch {
        /* keep in memory only */
      }
    },
    getDaysLog: unsupported,
    exportAll: unsupported,
    importAll: unsupported,
    health: async () => ({ ok: false, reason: 'in-memory fallback' }),
    close: () => {},
  } as Store;
}
