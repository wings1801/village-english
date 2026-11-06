import { describe, expect, it } from 'vitest';
import { validateQuestion } from '../content/schema';
import fixture from './fixtures/content-5.json';

describe('tests/fixtures/content-5.json', () => {
  it('has at least 8 questions covering all five kinds, all valid', () => {
    expect(fixture.length).toBeGreaterThanOrEqual(8);
    expect(new Set(fixture.map((q) => q.kind)).size).toBe(5);
    for (const q of fixture) expect(validateQuestion(q).ok, q.id).toBe(true);
  });
});
