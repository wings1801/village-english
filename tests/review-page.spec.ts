import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('review page: filters and bulk actions', () => {
  const pp2: Question = { ...pp, id: 'pp2', imageId: 'dog', answer: 'b' };
  const lp4: Question = { ...lp, id: 'lp4', grade: '4' };
  const lt4: Question = { ...lt, id: 'lt4', grade: '4' };
  const qs = [pp, pp2, lp, lt, lp4, lt4];
  const aiOk = (q: Question) => ({ ...ok(q), by: 'ai' as const });

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
  const card = (id: string) => document.querySelector(`.card[data-id=${id}]`) as HTMLElement;
  const shown = () => [...document.querySelectorAll<HTMLElement>('.card')].filter((c) => !c.hidden).map((c) => c.dataset.id);
  const count = () => document.getElementById('count')!.textContent;
  const live = () => document.getElementById('shown')!.textContent;
  const setF = (id: string, v: string) => {
    const el = document.getElementById(id) as HTMLSelectElement;
    el.value = v;
    el.dispatchEvent(new Event('change'));
  };
  const bulk = (name: 'approve' | 'reject' | 'clear') => (document.getElementById(`bulk-${name}`) as HTMLElement).click();
  const click2 = (id: string, act: string) => (card(id).querySelector(`button[data-act=${act}]`) as HTMLElement).click();
  const saved = () => JSON.parse(localStorage.getItem(storageKey(qs))!);
  let confirmMock: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    confirmMock = vi.spyOn(window, 'confirm').mockReturnValue(true);
  });
  afterEach(() => confirmMock.mockRestore());

  it('defaults to undecided and shows a live count', () => {
    open(qs);
    expect((document.getElementById('f-status') as HTMLSelectElement).value).toBe('undecided');
    expect(shown()).toHaveLength(6);
    expect(live()).toBe('Showing 6 of 6');
  });

  it('status filter: all / undecided / approved / rejected / ai', () => {
    open(qs, { pp1: ok(pp), pp2: { status: 'rejected', hash: questionHash(pp2) }, lp1: aiOk(lp) });
    expect(shown()).toEqual(['lt1', 'lp4', 'lt4']);
    setF('f-status', 'all');
    expect(shown()).toHaveLength(6);
    setF('f-status', 'approved');
    expect(shown()).toEqual(['pp1', 'lp1']);
    setF('f-status', 'rejected');
    expect(shown()).toEqual(['pp2']);
    setF('f-status', 'ai');
    expect(shown()).toEqual(['lp1']);
    expect(live()).toBe('Showing 1 of 6');
  });

  it('kind and grade filters, combinable with status', () => {
    open(qs);
    setF('f-kind', 'listen-pick');
    expect(shown()).toEqual(['lp1', 'lp4']);
    setF('f-grade', '4');
    expect(shown()).toEqual(['lp4']);
    setF('f-kind', 'all');
    expect(shown()).toEqual(['lp4', 'lt4']);
    setF('f-grade', '5');
    expect(shown()).toEqual(['pp1', 'pp2', 'lp1', 'lt1']);
    setF('f-kind', 'pick-picture');
    click2('pp1', 'approved');
    expect(shown()).toEqual(['pp2']);
    setF('f-status', 'all');
    expect(shown()).toEqual(['pp1', 'pp2']);
  });

  it('Approve all shown: confirm text states count and filters; only shown items change; counts and storage update', () => {
    open(qs);
    setF('f-kind', 'pick-picture');
    bulk('approve');
    expect(confirmMock).toHaveBeenCalledWith('Approve 2 shown questions (kind: pick-picture, status: undecided)?');
    expect(saved()).toEqual({ pp1: ok(pp), pp2: ok(pp2) });
    expect(count()).toBe('approved 2 / rejected 0 / undecided 4');
    expect(card('pp1').className).toContain('approved');
    expect(card('lp1').className).not.toContain('approved');
    expect(shown()).toEqual([]);
    expect(live()).toBe('Showing 0 of 6');
  });

  it('Reject all shown and Clear all shown', () => {
    open(qs, { pp1: ok(pp), lt1: ok(lt) });
    setF('f-grade', '4');
    bulk('reject');
    expect(confirmMock).toHaveBeenLastCalledWith('Reject 2 shown questions (grade: 4, status: undecided)?');
    expect(saved()).toEqual({
      pp1: ok(pp),
      lt1: ok(lt),
      lp4: { status: 'rejected', hash: questionHash(lp4) },
      lt4: { status: 'rejected', hash: questionHash(lt4) },
    });
    setF('f-status', 'rejected');
    bulk('clear');
    expect(confirmMock).toHaveBeenLastCalledWith('Clear the decision of 2 shown questions (grade: 4, status: rejected)?');
    expect(saved()).toEqual({ pp1: ok(pp), lt1: ok(lt) });
    expect(count()).toBe('approved 2 / rejected 0 / undecided 4');
  });

  it('a cancelled confirm changes nothing', () => {
    open(qs);
    confirmMock.mockReturnValue(false);
    bulk('approve');
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(count()).toBe('approved 0 / rejected 0 / undecided 6');
    expect(localStorage.getItem(storageKey(qs))).toBeNull();
  });

  it('with no filters the confirm says so, and nothing shown means no confirm', () => {
    open(qs);
    setF('f-status', 'all');
    bulk('approve');
    expect(confirmMock).toHaveBeenLastCalledWith('Approve 6 shown questions (no filter)?');
    confirmMock.mockClear();
    setF('f-status', 'undecided');
    bulk('approve');
    expect(confirmMock).not.toHaveBeenCalled();
    expect(document.getElementById('msg')!.textContent).toContain('Nothing is shown');
  });

  it('approve-all overwrites decided items only when the status filter shows them', () => {
    open(qs, { pp1: { status: 'rejected', hash: questionHash(pp) } });
    bulk('approve');
    expect(saved().pp1.status).toBe('rejected');
    setF('f-status', 'rejected');
    bulk('approve');
    expect(saved().pp1).toEqual(ok(pp));
  });

  it('parent decisions drop the AI mark; AI items show a badge and are counted', () => {
    open(qs, { pp1: aiOk(pp), pp2: aiOk(pp2) });
    expect(count()).toBe('approved 2 / rejected 0 / undecided 4 (AI-approved 2)');
    expect((card('pp1').querySelector('.ai-badge') as HTMLElement).hidden).toBe(false);
    expect((card('lp1').querySelector('.ai-badge') as HTMLElement).hidden).toBe(true);
    expect(card('pp1').querySelector('.ai-badge')!.textContent).toBe('AI-approved');
    click2('pp1', 'approved');
    expect(saved().pp1).toEqual(ok(pp));
    setF('f-status', 'ai');
    bulk('reject');
    expect(saved().pp2).toEqual({ status: 'rejected', hash: questionHash(pp2) });
    expect(count()).toBe('approved 1 / rejected 1 / undecided 4');
  });

  it('keeps by:"ai" when loading and ignores unknown by values', async () => {
    open(qs);
    const input = document.getElementById('load') as HTMLInputElement;
    const f = JSON.stringify({ pp1: aiOk(pp), pp2: { ...ok(pp2), by: 'robot' }, lp1: { ...ok(lp), by: 'parent' } });
    Object.defineProperty(input, 'files', { value: [new File([f], 'approvals.json')], configurable: true });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(Object.keys(saved())).toHaveLength(2));
    expect(saved()).toEqual({ pp1: aiOk(pp), lp1: ok(lp) });
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
