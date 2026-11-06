import { describe, expect, it } from 'vitest';
import { poseFor, WRONG_COPY, type ReactionEvent } from '../src/domain/reaction';

describe('poseFor', () => {
  const cases: [ReactionEvent, string][] = [
    ['correct', 'happy'],
    ['streak', 'excited'],
    ['wrong', 'surprised'],
    ['hint', 'thinking'],
    ['timeup', 'sleepy'],
    ['idle', 'idle'],
  ];
  it.each(cases)('%s -> %s', (event, pose) => {
    expect(poseFor(event)).toBe(pose);
  });
});

describe('WRONG_COPY', () => {
  it('is gentle', () => {
    expect(WRONG_COPY).toBe('もういちど！');
    for (const bad of ['×', 'ざんねん', 'まちがい']) expect(WRONG_COPY).not.toContain(bad);
  });
});
