import { describe, expect, it, vi } from 'vitest';
import { questionHash } from '../content/hash';
import { emojiSrc, renderReviewHtml, storageKey } from '../scripts/build-review-page';
import type { Question } from '../src/domain/types';

const source = { name: 'Original', license: 'CC0' };
const ch = (...ids: string[]) => ids.map((id) => ({ id, textEn: id }));
const pp: Question = {
  id: 'pp1', grade: '5', kind: 'pick-picture', promptJa: 'えをえらぼう',
  imageId: 'apple', choices: ch('apple', 'dog', 'cat'), answer: 'apple', source,
};
const lp: Question = {
  id: 'lp1', grade: '5', kind: 'listen-pick', promptJa: 'きいてえらぼう',
  speakEn: 'apple', choices: ch('apple', 'dog', 'cat'), answer: 'dog', source,
};
const lt: Question = {
  id: 'lt1', grade: '5', kind: 'letter-tiles', promptJa: 'ならべよう', imageId: 'apple', answer: 'apple', source,
};
const ok = (q: Question) => ({ status: 'approved' as const, hash: questionHash(q) });

describe('review page: pictures and hashes', () => {
  it('renders an <img> with an escaped relative src for imageId items and choices', () => {
    const html = renderReviewHtml([
      { ...pp, imageId: 'a"b<c', choices: [{ id: 'x', textEn: 'x', imageId: 'dog' }, { id: 'y' }, { id: 'z' }] },
    ]);
    expect(emojiSrc('dog')).toBe('../public/assets/emoji/dog.svg');
    expect(html).toContain('<img class="pic" src="../public/assets/emoji/dog.svg" alt="dog"');
    expect(html).toContain('src="../public/assets/emoji/a%22b%3Cc.svg"');
    expect(html).toContain('alt="a&quot;b&lt;c"');
    expect(html).not.toContain('<c.svg');
  });

  it('embeds the question hash and a storage key derived from the id list', () => {
    const html = renderReviewHtml([pp]);
    expect(html).toContain(`data-hash="${questionHash(pp)}"`);
    expect(storageKey([pp])).not.toBe(storageKey([pp, lp]));
    expect(html).toContain(storageKey([pp]));
  });
});

describe('review page: behaviour in a browser', () => {
  const qs = [pp, lp, lt];
  function open(questions: Question[], stored?: unknown) {
    const html = renderReviewHtml(questions);
    localStorage.clear();
    if (stored !== undefined) localStorage.setItem(storageKey(questions), JSON.stringify(stored));
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const code = doc.querySelector('script')!.textContent!;
    doc.querySelector('script')!.remove();
    document.head.innerHTML = doc.head.innerHTML;
    document.body.innerHTML = doc.body.innerHTML;
    document.body.className = '';
    new Function(code)();
  }
  const card = (id: string) => document.querySelector(`.card[data-id=${id}]`)!;
  const click = (id: string, act: string) => (card(id).querySelector(`button[data-act=${act}]`) as HTMLElement).click();
  const count = () => document.getElementById('count')!.textContent;
  const loadFile = (content: string) => {
    const input = document.getElementById('load') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [new File([content], 'approvals.json')], configurable: true });
    input.dispatchEvent(new Event('change'));
  };

  it('counts, saves to localStorage and restores on reopen', () => {
    open(qs);
    expect(count()).toBe('approved 0 / rejected 0 / undecided 3');
    click('pp1', 'approved');
    click('lp1', 'rejected');
    expect(count()).toBe('approved 1 / rejected 1 / undecided 1');
    const saved = JSON.parse(localStorage.getItem(storageKey(qs))!);
    expect(saved).toEqual({ pp1: ok(pp), lp1: { status: 'rejected', hash: questionHash(lp) } });
    open(qs, saved);
    expect(count()).toBe('approved 1 / rejected 1 / undecided 1');
    expect(card('pp1').className).toContain('approved');
  });

  it('drops stored decisions whose question changed, unknown ids and junk', () => {
    open(qs, { pp1: { status: 'approved', hash: 'old' }, ghost: ok(pp), lp1: 'approved', lt1: ok(lt) });
    expect(count()).toBe('approved 1 / rejected 0 / undecided 2');
  });

  it('survives a localStorage that throws', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    open(qs);
    click('pp1', 'approved');
    expect(count()).toBe('approved 1 / rejected 0 / undecided 2');
    get.mockRestore();
    set.mockRestore();
  });

  it('the undecided filter toggles a body class', () => {
    open(qs);
    const only = document.getElementById('only') as HTMLInputElement;
    only.checked = true;
    only.dispatchEvent(new Event('change'));
    expect(document.body.classList.contains('only-undecided')).toBe(true);
  });

  it('loading a file MERGES valid decisions and ignores the rest', async () => {
    open(qs);
    click('pp1', 'approved');
    loadFile(JSON.stringify({ lp1: ok(lp), ghost: ok(lt), lt1: { status: 'approved', hash: 'stale' }, pp1: 'bad' }));
    await vi.waitFor(() => expect(count()).toBe('approved 2 / rejected 0 / undecided 1'));
    expect(document.getElementById('msg')!.textContent).toContain('Loaded 1');
    expect(document.getElementById('msg')!.textContent).toContain('ignored 3');
  });

  it('refuses a file that is not an approvals object', async () => {
    open(qs);
    loadFile('[1,2]');
    await vi.waitFor(() => expect(document.getElementById('msg')!.textContent).toContain('Not an approvals.json'));
  });
});

describe('validate-content approvals check', () => {
  it('passes {} and reports stale or malformed approvals', async () => {
    const { validateApprovals } = await import('../scripts/validate-content');
    const grades = { '5': [pp, lp, lt], '4': [] };
    expect(validateApprovals(grades, {})).toEqual([]);
    expect(validateApprovals(grades, { pp1: ok(pp) })).toEqual([]);
    expect(validateApprovals(grades, { pp1: { status: 'approved', hash: 'old' } })[0]).toContain('stale approval for pp1');
    expect(validateApprovals(grades, [])[0]).toContain('must be an object');
  });
});
