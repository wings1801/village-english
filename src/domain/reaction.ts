import type { Pose } from '../assets/manifest';

export type ReactionEvent = 'correct' | 'streak' | 'wrong' | 'hint' | 'timeup' | 'idle';

const POSE_BY_EVENT: Record<ReactionEvent, Pose> = {
  correct: 'happy',
  streak: 'excited',
  wrong: 'surprised',
  hint: 'thinking',
  timeup: 'sleepy',
  idle: 'idle',
};

export function poseFor(event: ReactionEvent): Pose {
  return POSE_BY_EVENT[event];
}

/** Gentle copy shown after a wrong answer (never a cross, never "mistake"). */
export const WRONG_COPY = 'もういちど！';
