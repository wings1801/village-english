import type { DayState } from './types';

const MAX_SECONDS_PER_CALL = 60;

/** Local date as YYYY-MM-DD (not UTC). */
export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function recordPlay(state: DayState, seconds: number, today: string): DayState {
  const s = Number.isNaN(seconds) ? 0 : Math.min(MAX_SECONDS_PER_CALL, Math.max(0, seconds));
  // Clock moved backwards: the stored (later) day stays current.
  if (state.dateKey !== '' && today <= state.dateKey) {
    return { dateKey: state.dateKey, playSeconds: state.playSeconds + s };
  }
  return { dateKey: today, playSeconds: s };
}

export function isTimeUp(state: DayState, limitSeconds: number, today: string): boolean {
  if (state.dateKey === '' || state.dateKey < today) return false;
  return state.playSeconds >= limitSeconds;
}
