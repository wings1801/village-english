import type { GradeId } from './types';

export interface Island {
  grade: GradeId;
  labelJa: string;
  unlocked: boolean;
}

export const LOCKED_MESSAGE = 'もうすこしまってね';

/** Seven islands, easiest first. Only the first two are playable for now. */
export const ISLANDS: Island[] = [
  { grade: '5', labelJa: 'ごきゅう', unlocked: true },
  { grade: '4', labelJa: 'よんきゅう', unlocked: true },
  { grade: '3', labelJa: 'さんきゅう', unlocked: false },
  { grade: 'p2', labelJa: 'じゅんにきゅう', unlocked: false },
  { grade: '2', labelJa: 'にきゅう', unlocked: false },
  { grade: 'p1', labelJa: 'じゅんいっきゅう', unlocked: false },
  { grade: '1', labelJa: 'いっきゅう', unlocked: false },
];
