import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadWordGrades } from '../src/domain/word-grades';
import { buildWordGrades } from '../scripts/build-word-grades';

afterEach(() => vi.restoreAllMocks());

describe('buildWordGrades', () => {
  it('maps wordIds to grades, grade 5 wins on overlap, keys sorted', () => {
    const out = buildWordGrades({
      '5': [{ wordId: 'b' }, { wordId: 'a' }],
      '4': [{ wordId: 'c' }, { wordId: 'a' }],
    });
    expect(out).toEqual({ a: '5', b: '5', c: '4' });
    expect(Object.keys(out)).toEqual(['a', 'b', 'c']);
  });
  it('handles missing grades', () => {
    expect(buildWordGrades({ '4': [{ wordId: 'x' }] })).toEqual({ x: '4' });
    expect(buildWordGrades({})).toEqual({});
  });
});

const res = (body: string, status = 200) => async () => new Response(body, { status });

describe('loadWordGrades', () => {
  it('loads and fetches the right url', async () => {
    const f = vi.fn(res(JSON.stringify({ a: '5', b: '4' })));
    expect(await loadWordGrades(f as unknown as typeof fetch, '/base/')).toEqual({ a: '5', b: '4' });
    expect(f).toHaveBeenCalledWith('/base/content/word-grades.json');
  });
  it('404 -> {}', async () => {
    expect(await loadWordGrades(res('nope', 404) as unknown as typeof fetch, '/')).toEqual({});
  });
  it('rejection -> {}', async () => {
    const f = (async () => {
      throw new TypeError('offline');
    }) as unknown as typeof fetch;
    expect(await loadWordGrades(f, '/')).toEqual({});
  });
  it('bad JSON and non-object JSON -> {}', async () => {
    expect(await loadWordGrades(res('{oops') as unknown as typeof fetch, '/')).toEqual({});
    expect(await loadWordGrades(res('[1]') as unknown as typeof fetch, '/')).toEqual({});
    expect(await loadWordGrades(res('null') as unknown as typeof fetch, '/')).toEqual({});
  });
  it('drops entries with an invalid grade', async () => {
    const body = JSON.stringify({ a: '5', b: '9', c: 4, d: null, e: 'p1', f: 'toString' });
    expect(await loadWordGrades(res(body) as unknown as typeof fetch, '/')).toEqual({ a: '5', e: 'p1' });
  });
  it('never throws without a fetch', async () => {
    vi.stubGlobal('fetch', undefined);
    expect(await loadWordGrades(undefined, '/')).toEqual({});
    vi.unstubAllGlobals();
  });
});
