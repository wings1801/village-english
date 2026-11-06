import { describe, expect, it } from 'vitest';
import { canonicalJson, questionHash } from '../content/hash';
import { validateQuestion } from '../content/schema';
import { buildAll, buildContent, type Approvals } from '../scripts/build-content';
import { renderReviewHtml } from '../scripts/build-review-page';
import type { Question } from '../src/domain/types';

const source = { name: 'Original', license: 'CC0' };
const ok = (q: Question) => ({ status: 'approved' as const, hash: questionHash(q) });
const no = { status: 'rejected' as const };
const ch = (...ids: string[]) => ids.map((id) => ({ id, textEn: id }));

const samples: Record<string, Question> = {
  'pick-picture': {
    id: 'pp1', grade: '5', kind: 'pick-picture', promptJa: 'えをえらぼう',
    imageId: 'apple', choices: ch('apple', 'dog', 'cat'), answer: 'apple', source,
  },
  'listen-pick': {
    id: 'lp1', grade: '5', kind: 'listen-pick', promptJa: 'きいてえらぼう',
    speakEn: 'apple', choices: ch('apple', 'dog', 'cat'), answer: 'dog', source,
  },
  'letter-tiles': {
    id: 'lt1', grade: '5', kind: 'letter-tiles', promptJa: 'ならべよう',
    imageId: 'apple', answer: 'apple', source,
  },
  'pick-word': {
    id: 'pw1', grade: '4', kind: 'pick-word', promptJa: 'えらぼう',
    promptEn: 'I like ___.', choices: ch('a', 'b', 'c'), answer: 'b', source,
  },
  'dialogue-choice': {
    id: 'dc1', grade: '4', kind: 'dialogue-choice', promptJa: 'こたえよう',
    promptEn: 'A: How are you?\nB: ___.', choices: ch('a', 'b', 'c'), answer: 'c', source,
  },
};

const errorsOf = (q: unknown): string[] => {
  const r = validateQuestion(q);
  if (r.ok) throw new Error('expected failure');
  return r.errors;
};
const mut = (kind: string, patch: Record<string, unknown>) => ({ ...samples[kind], ...patch });

describe('validateQuestion', () => {
  it.each(Object.keys(samples))('accepts a valid %s', (kind) => {
    const r = validateQuestion(samples[kind]);
    expect(r.ok).toBe(true);
  });

  it('rejects non-objects', () => {
    expect(validateQuestion(null).ok).toBe(false);
    expect(validateQuestion('x').ok).toBe(false);
  });

  it('rejects empty id', () => {
    expect(errorsOf(mut('pick-picture', { id: '' })).join('|')).toContain('id');
  });
  it('rejects bad grade', () => {
    expect(errorsOf(mut('pick-picture', { grade: '9' })).join('|')).toContain('grade');
  });
  it('rejects bad kind', () => {
    expect(errorsOf(mut('pick-picture', { kind: 'nope' })).join('|')).toContain('kind');
  });
  it('rejects empty promptJa', () => {
    expect(errorsOf(mut('pick-picture', { promptJa: '' })).join('|')).toContain('promptJa');
  });
  it('rejects missing source', () => {
    expect(errorsOf(mut('pick-picture', { source: undefined })).join('|')).toContain('source');
  });
  it('rejects source without license', () => {
    expect(errorsOf(mut('pick-picture', { source: { name: 'x', license: '' } })).join('|')).toContain('source.license');
  });
  it('rejects source without name', () => {
    expect(errorsOf(mut('pick-picture', { source: { license: 'x' } })).join('|')).toContain('source.name');
  });
  it('rejects empty answer', () => {
    expect(errorsOf(mut('letter-tiles', { answer: '' })).join('|')).toContain('answer');
  });

  it('rejects kanji outside ruby', () => {
    const e = errorsOf(mut('pick-picture', { promptJa: '犬をえらぼう' }));
    expect(e.join('|')).toContain('promptJa');
  });
  it('allows kanji inside ruby', () => {
    expect(validateQuestion(mut('pick-picture', { promptJa: '<ruby>犬<rt>いぬ</rt></ruby>をえらぼう' })).ok).toBe(true);
  });
  it('rejects kanji outside ruby even when ruby is present', () => {
    expect(validateQuestion(mut('pick-picture', { promptJa: '<ruby>犬<rt>いぬ</rt></ruby>と猫' })).ok).toBe(false);
  });
  it('treats 々 and 一 as kanji', () => {
    expect(validateQuestion(mut('pick-picture', { promptJa: '人々' })).ok).toBe(false);
    expect(validateQuestion(mut('pick-picture', { promptJa: '一つ' })).ok).toBe(false);
  });

  it('pick-picture requires imageId', () => {
    expect(errorsOf(mut('pick-picture', { imageId: undefined })).join('|')).toContain('imageId');
  });
  it('pick-picture requires 3 choices', () => {
    expect(errorsOf(mut('pick-picture', { choices: ch('apple', 'dog') })).join('|')).toContain('choices');
  });
  it('pick-picture answer must be a choice id', () => {
    expect(errorsOf(mut('pick-picture', { answer: 'zzz' })).join('|')).toContain('answer');
  });
  it('rejects duplicate choice ids', () => {
    expect(errorsOf(mut('pick-picture', { choices: ch('apple', 'apple', 'cat') })).join('|')).toContain('choices');
  });
  it('listen-pick requires speakEn', () => {
    expect(errorsOf(mut('listen-pick', { speakEn: undefined })).join('|')).toContain('speakEn');
  });
  it('listen-pick answer must be a choice id', () => {
    expect(errorsOf(mut('listen-pick', { answer: 'zzz' })).join('|')).toContain('answer');
  });
  it('letter-tiles answer must be lowercase letters 2-12', () => {
    expect(errorsOf(mut('letter-tiles', { answer: 'Apple' })).join('|')).toContain('answer');
    expect(errorsOf(mut('letter-tiles', { answer: 'a' })).join('|')).toContain('answer');
    expect(errorsOf(mut('letter-tiles', { answer: 'abcdefghijklm' })).join('|')).toContain('answer');
  });
  it('letter-tiles needs imageId or promptEn', () => {
    expect(errorsOf(mut('letter-tiles', { imageId: undefined })).join('|')).toContain('imageId');
    expect(validateQuestion(mut('letter-tiles', { imageId: undefined, promptEn: 'a fruit' })).ok).toBe(true);
  });
  it('pick-word needs exactly one blank', () => {
    expect(errorsOf(mut('pick-word', { promptEn: 'I like apples.' })).join('|')).toContain('promptEn');
    expect(errorsOf(mut('pick-word', { promptEn: '___ and ___' })).join('|')).toContain('promptEn');
    expect(errorsOf(mut('pick-word', { promptEn: undefined })).join('|')).toContain('promptEn');
  });
  it('pick-word needs 3 choices and answer in choices', () => {
    expect(errorsOf(mut('pick-word', { choices: ch('a', 'b') })).join('|')).toContain('choices');
    expect(errorsOf(mut('pick-word', { answer: 'zzz' })).join('|')).toContain('answer');
  });
  it('dialogue-choice needs two lines', () => {
    expect(errorsOf(mut('dialogue-choice', { promptEn: 'B: ___.' })).join('|')).toContain('promptEn');
  });
  it('dialogue-choice needs exactly one blank', () => {
    expect(errorsOf(mut('dialogue-choice', { promptEn: 'A: Hi\nB: Hello' })).join('|')).toContain('promptEn');
    expect(errorsOf(mut('dialogue-choice', { promptEn: 'A: ___\nB: ___' })).join('|')).toContain('promptEn');
  });
  it('dialogue-choice needs choices and answer in choices', () => {
    expect(errorsOf(mut('dialogue-choice', { choices: ch('a', 'b') })).join('|')).toContain('choices');
    expect(errorsOf(mut('dialogue-choice', { answer: 'zzz' })).join('|')).toContain('answer');
  });

  it('requires a non-empty rt in every ruby', () => {
    expect(errorsOf(mut('pick-picture', { promptJa: '<ruby>犬</ruby>' })).join('|')).toContain('promptJa');
    expect(errorsOf(mut('pick-picture', { promptJa: '<ruby>犬<rt></rt></ruby>' })).join('|')).toContain('promptJa');
  });
  it('rejects kanji inside rt', () => {
    expect(errorsOf(mut('pick-picture', { promptJa: '<ruby>犬<rt>犬</rt></ruby>' })).join('|')).toContain('promptJa');
  });
  it('rejects unbalanced ruby markup', () => {
    expect(errorsOf(mut('pick-picture', { promptJa: '<ruby>犬<rt>いぬ</rt>' })).join('|')).toContain('promptJa');
    expect(errorsOf(mut('pick-picture', { promptJa: 'あ</ruby>' })).join('|')).toContain('promptJa');
    expect(errorsOf(mut('pick-picture', { promptJa: '<ruby>犬<rt>いぬ</ruby>' })).join('|')).toContain('promptJa');
  });
  it('accepts multi-segment ruby with rp', () => {
    expect(validateQuestion(mut('pick-picture', { promptJa: '<ruby>漢<rp>(</rp><rt>かん</rt><rp>)</rp>字<rt>じ</rt></ruby>' })).ok).toBe(true);
  });
  it('rejects a choice with neither textEn nor imageId', () => {
    expect(errorsOf(mut('pick-picture', { choices: [{ id: 'apple', textEn: 'a' }, { id: 'dog' }, { id: 'cat', textEn: 'c' }] })).join('|')).toContain('choices');
  });

  it('collects multiple errors at once', () => {
    const e = errorsOf({ id: '', grade: '9', kind: 'pick-word', promptJa: '', answer: '' });
    expect(e.length).toBeGreaterThanOrEqual(5);
    const j = e.join('|');
    for (const f of ['id', 'grade', 'promptJa', 'source', 'answer']) expect(j).toContain(f);
  });
});

describe('buildContent', () => {
  it('throws on an unknown approvals value', () => {
    expect(() => buildContent([samples['pick-picture']], { pp1: 'approve' } as unknown as Approvals)).toThrow(/pp1.*approve/);
  });

  const authored = [samples['pick-picture'], samples['listen-pick'], samples['letter-tiles']];
  it('returns only approved, in authored order', () => {
    const out = buildContent(authored, { lt1: ok(samples['letter-tiles']), pp1: ok(samples['pick-picture']), lp1: no });
    expect(out.map((q) => q.id)).toEqual(['pp1', 'lt1']);
  });
  it('omits unlisted ids', () => {
    expect(buildContent(authored, {})).toEqual([]);
  });
  it('throws when an approved id is missing from authored', () => {
    expect(() => buildContent(authored, { ghost: { status: 'approved', hash: 'x' } })).toThrow(/ghost/);
  });
  it('ignores rejected ids missing from authored', () => {
    expect(buildContent(authored, { ghost: no })).toEqual([]);
  });
  it('throws on duplicate ids in authored', () => {
    expect(() => buildContent([samples['pick-picture'], samples['pick-picture']], {})).toThrow(/pp1/);
  });
});

describe('approval hashes', () => {
  const q = samples['pick-picture'];
  it('questionHash is 16 hex chars and ignores key order', () => {
    expect(questionHash(q)).toMatch(/^[0-9a-f]{16}$/);
    const shuffled = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(q).reverse()))) as Question;
    expect(questionHash(shuffled)).toBe(questionHash(q));
    expect(canonicalJson({ b: 1, a: { d: 1, c: [2, { z: 1, y: 2 }] } })).toBe('{"a":{"c":[2,{"y":2,"z":1}],"d":1},"b":1}');
  });
  it('any content change changes the hash', () => {
    expect(questionHash({ ...q, promptJa: 'ちがう' })).not.toBe(questionHash(q));
  });
  it('rejects a stale approval with a clear message', () => {
    const edited = { ...q, promptJa: 'あとでなおした' };
    expect(() => buildContent([edited], { pp1: ok(q) })).toThrow(
      'stale approval for pp1: the question changed after it was approved — review it again',
    );
    expect(() => buildAll({ '5': [edited], '4': [] }, { pp1: ok(q) })).toThrow(/stale approval for pp1/);
  });
  it('rejects an approved entry without a hash', () => {
    expect(() => buildContent([q], { pp1: { status: 'approved' } })).toThrow(/pp1.*no hash/);
  });
  it('rejects the old string format', () => {
    expect(() => buildContent([q], { pp1: 'approved' } as unknown as Approvals)).toThrow(/pp1/);
  });
  it('a stale REJECTED entry is harmless', () => {
    expect(buildContent([{ ...q, promptJa: 'x' }], { pp1: { status: 'rejected', hash: 'old' } })).toEqual([]);
  });
});

describe('buildAll', () => {
  it('builds valid approved questions per grade', () => {
    const out = buildAll({ '5': [samples['pick-picture']], '4': [samples['pick-word']] }, { pp1: ok(samples['pick-picture']) });
    expect(out['5'].map((q) => q.id)).toEqual(['pp1']);
    expect(out['4']).toEqual([]);
  });
  it('throws on an approved invalid question', () => {
    const bad = { ...samples['pick-picture'], promptJa: '犬' };
    expect(() => buildAll({ '5': [bad], '4': [] }, { pp1: ok(samples['pick-picture']) })).toThrow(/pp1/);
  });
  it('throws when grade does not match file', () => {
    expect(() => buildAll({ '4': [samples['pick-picture']], '5': [] }, { pp1: ok(samples['pick-picture']) })).toThrow(/pp1/);
  });
  it('throws on an id duplicated across files', () => {
    expect(() => buildAll({ '5': [samples['pick-picture']], '4': [{ ...samples['pick-picture'], grade: '4' }] }, { pp1: ok(samples['pick-picture']) })).toThrow(/pp1/);
  });
  it('throws on an approved id absent from all files', () => {
    expect(() => buildAll({ '5': [], '4': [] }, { ghost: { status: 'approved', hash: 'x' } })).toThrow(/ghost/);
  });
});

describe('renderReviewHtml', () => {
  it('keeps attribute-bearing ruby/rt tags escaped', () => {
    const html = renderReviewHtml([{ ...samples['pick-picture'], promptJa: '<ruby onclick="x">犬<rt style="y">いぬ</rt></ruby>' }]);
    expect(html).not.toContain('<ruby onclick');
    expect(html).not.toContain('<rt style');
    expect(html).toContain('&lt;ruby onclick=&quot;x&quot;&gt;');
  });
  it('escapes ids in data-id', () => {
    const html = renderReviewHtml([{ ...samples['pick-picture'], id: 'a"<b' }]);
    expect(html).toContain('data-id="a&quot;&lt;b"');
  });
  it('refuses duplicate ids', () => {
    expect(() => renderReviewHtml([samples['pick-picture'], samples['pick-picture']])).toThrow(/pp1/);
  });

  const qs = Object.values(samples).map((q, i) => ({ ...q, source: { ...q.source, name: `Src${i}` } }));
  it('contains every id and source name, lang ja, download button', () => {
    const html = renderReviewHtml(qs);
    for (const q of qs) {
      expect(html).toContain(q.id);
      expect(html).toContain(q.source.name);
    }
    expect(html).toContain('<html lang="ja"');
    expect(html).toContain('Download approvals.json');
  });
  it('keeps ruby tags in promptJa', () => {
    const html = renderReviewHtml([{ ...samples['pick-picture'], promptJa: '<ruby>犬<rt>いぬ</rt></ruby>' }]);
    expect(html).toContain('<ruby>犬<rt>いぬ</rt></ruby>');
  });
  it('escapes injected script tags in every field', () => {
    const evil = '<script>alert(1)</script>';
    const html = renderReviewHtml([{
      ...samples['pick-word'], id: 'x1', promptJa: `a${evil}`, promptEn: `${evil} ___`,
      speakEn: evil, choices: [{ id: 'a', textEn: evil }, { id: 'b' }, { id: 'c' }],
      source: { name: evil, license: evil, url: evil, author: evil },
    }]);
    // the only real <script> is the page's own inline one
    expect(html).not.toContain(evil);
    expect(html).toContain('&lt;script&gt;');
    expect((html.match(/<script>/g) ?? []).length).toBe(1);
  });
  it('is self-contained (no external references)', () => {
    const html = renderReviewHtml(qs);
    expect(html).not.toMatch(/(src|href)=["']https?:/);
  });
});
