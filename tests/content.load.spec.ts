import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadQuestions } from '../src/domain/content';

const q = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  grade: '5',
  kind: 'pick-word',
  choices: [{ id: 'a' }],
  promptJa: 'x',
  answer: 'a',
  source: { name: 's', license: 'l' },
  ...over,
});
const res = (body: string, status = 200) => async () => new Response(body, { status });

afterEach(() => vi.restoreAllMocks());

describe('loadQuestions', () => {
  it('loads valid questions from the right url', async () => {
    const f = vi.fn(res(JSON.stringify([q('a'), q('b')])));
    const out = await loadQuestions('5', f as unknown as typeof fetch, '/base/');
    expect(out.map((x) => x.id)).toEqual(['a', 'b']);
    expect(f).toHaveBeenCalledWith('/base/content/5.json');
  });
  it('404 -> []', async () => {
    expect(await loadQuestions('5', res('nope', 404) as unknown as typeof fetch, '/')).toEqual([]);
  });
  it('rejection -> []', async () => {
    const f = (async () => {
      throw new TypeError('offline');
    }) as unknown as typeof fetch;
    expect(await loadQuestions('5', f, '/')).toEqual([]);
  });
  it('invalid JSON -> []', async () => {
    expect(await loadQuestions('5', res('{oops') as unknown as typeof fetch, '/')).toEqual([]);
  });
  it('non-array -> []', async () => {
    expect(await loadQuestions('5', res('{"a":1}') as unknown as typeof fetch, '/')).toEqual([]);
  });
  it('drops invalid entries with ONE warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const body = [q('ok'), q('wrong-grade', { grade: '4' }), q('no-answer', { answer: undefined }), null, 5, q('bad-kind', { kind: 'zzz' })];
    const out = await loadQuestions('5', res(JSON.stringify(body)) as unknown as typeof fetch, '/');
    expect(out.map((x) => x.id)).toEqual(['ok']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('5');
  });
  it('no warning when all valid', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await loadQuestions('5', res(JSON.stringify([q('a')])) as unknown as typeof fetch, '/');
    expect(warn).not.toHaveBeenCalled();
  });

  it('resolves the default fetch inside try (missing global fetch -> [])', async () => {
    vi.stubGlobal('fetch', undefined);
    try {
      expect(await loadQuestions('5', undefined, '/')).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('requires choices for choice kinds', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const body = [
      q('ok'),
      q('none', { choices: undefined }),
      q('notarray', { choices: 'x' }),
      q('noid', { choices: [{ textEn: 'a' }] }),
      q('tiles', { kind: 'letter-tiles', choices: undefined }),
    ];
    const out = await loadQuestions('5', res(JSON.stringify(body)) as unknown as typeof fetch, '/');
    expect(out.map((x) => x.id)).toEqual(['ok', 'tiles']);
  });
  it('drops duplicate ids keeping the first, in the single warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const body = [q('d', { answer: 'first' }), q('d', { answer: 'second' }), q('e')];
    const out = await loadQuestions('5', res(JSON.stringify(body)) as unknown as typeof fetch, '/');
    expect(out.map((x) => x.answer)).toEqual(['first', 'a']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('1');
  });
});
