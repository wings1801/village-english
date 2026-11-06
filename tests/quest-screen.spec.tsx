import 'fake-indexeddb/auto';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from './fixtures/content-5.json';
import type { Question } from '../src/domain/types';

vi.mock('../src/audio/tts', () => ({
  speak: vi.fn(() => Promise.resolve()),
  cancelSpeech: vi.fn(),
  unlockAudio: vi.fn(),
}));
vi.mock('../src/domain/content', () => ({
  loadQuestions: vi.fn(),
}));

import { cancelSpeech, speak, unlockAudio } from '../src/audio/tts';
import { dateKey } from '../src/domain/daily-limit';
import { loadQuestions } from '../src/domain/content';
import { getDegraded, resetDegraded } from '../src/store/degraded';
import { FALLBACK_DAY_KEY } from '../src/store/memory-store';
import { openStore, type Store } from '../src/store/store';
import { StoreProvider } from '../src/store/store-context';
import { App } from '../src/app';
import { Quest } from '../src/ui/quest';

const POOL = fixture as Question[];
const byId = new Map(POOL.map((q) => [q.id, q]));
const FAST = { advanceMs: 5, tickMs: 10 };
let n = 0;
let store: Store;

beforeEach(async () => {
  store = await openStore(`quest-ui-${++n}`);
  vi.mocked(loadQuestions).mockResolvedValue(POOL);
  vi.mocked(speak).mockClear();
  vi.mocked(unlockAudio).mockClear();
  window.location.hash = '#/quest/mimi';
  resetDegraded();
  try {
    localStorage.removeItem(FALLBACK_DAY_KEY);
  } catch {
    /* ignore */
  }
});
afterEach(() => {
  cleanup();
  store.close();
  vi.restoreAllMocks();
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

function mount(villagerId = 'mimi', props: Record<string, unknown> = FAST) {
  return render(
    <StoreProvider open={() => Promise.resolve(store)}>
      <Quest villagerId={villagerId} {...props} />
    </StoreProvider>,
  );
}

async function start() {
  fireEvent.click(await screen.findByText('はじめる'));
  return screen.findByTestId('question');
}
const current = () => {
  const el = screen.getByTestId('question');
  return byId.get(el.getAttribute('data-question-id')!)!;
};
const pose = () => screen.getByTestId('quest-villager').getAttribute('data-pose');

function tapAnswer(q: Question, correct: boolean) {
  if (q.kind === 'letter-tiles') {
    const letters = [...q.answer];
    const order = correct ? letters : [...letters].reverse();
    for (const ch of order) {
      const t = screen.getAllByTestId('tile').find((x) => x.textContent === ch && !(x as HTMLButtonElement).disabled)!;
      fireEvent.click(t);
    }
    return;
  }
  const choices = screen.getAllByTestId('choice');
  const pick = choices.find((c) => (c.getAttribute('data-choice-id') === q.answer) === correct)!;
  fireEvent.click(pick);
}

/** Answers the current question correctly and waits for the next one (or the summary). */
async function answerRight() {
  const q = current();
  tapAnswer(q, true);
  await waitFor(() => {
    const el = screen.queryByTestId('question');
    expect(!el || el.getAttribute('data-question-id') !== q.id).toBe(true);
  });
}

describe('Quest intro', () => {
  it('shows the villager, a name chip and はじめる; start unlocks audio then shows a question', async () => {
    mount('mimi');
    expect(await screen.findByText('ミミ')).toBeTruthy();
    expect(screen.getByTestId('quest-villager').getAttribute('data-pose')).toBe('idle');
    expect(unlockAudio).not.toHaveBeenCalled();
    await start();
    expect(unlockAudio).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('question')).toBeTruthy();
    expect(loadQuestions).toHaveBeenCalledWith('5');
  });

  it('uses settings.currentGrade for the pool', async () => {
    await store.putSettings({ dailyLimitSeconds: 1800, currentGrade: '4' });
    mount('hana');
    await start().catch(() => {});
    await waitFor(() => expect(loadQuestions).toHaveBeenCalledWith('4'));
  });

  it('unknown villager id navigates to the village', async () => {
    window.location.hash = '#/quest/nobody';
    mount('nobody');
    await waitFor(() => expect(window.location.hash).toBe('#/'));
    expect(screen.queryByText('はじめる')).toBeNull();
  });

  it('empty pool shows もんだいを じゅんびちゅう with a back button', async () => {
    vi.mocked(loadQuestions).mockResolvedValue([]);
    mount();
    fireEvent.click(await screen.findByText('はじめる'));
    expect(await screen.findByText('もんだいを じゅんびちゅう')).toBeTruthy();
    fireEvent.click(screen.getByText('もどる'));
    expect(window.location.hash).toBe('#/');
  });

  it('time already up at start renders the daily-stop screen', async () => {
    await store.putDay({ dateKey: dateKey(new Date()), playSeconds: 99999 });
    mount();
    fireEvent.click(await screen.findByText('はじめる'));
    expect(await screen.findByText('きょうは おしまい。またあしたね！')).toBeTruthy();
    expect(screen.getByTestId('quest-villager').getAttribute('data-pose')).toBe('sleepy');
    expect(screen.getByTestId('quest-villager').getAttribute('src')).toContain('villagers/momo_chan/sleepy');
    expect(screen.queryByTestId('question')).toBeNull();
  });
});

describe('Quest gameplay', () => {
  it('speaks the Japanese instruction on a question, and 「きく」 repeats it with a thinking pose', async () => {
    mount();
    await start();
    const q = current();
    await waitFor(() => expect(speak).toHaveBeenCalledWith(expect.any(String), 'ja-JP'));
    vi.mocked(speak).mockClear();
    fireEvent.click(screen.getByLabelText('もんだいを きく'));
    expect(speak).toHaveBeenCalledWith(expect.stringContaining(q.promptJa.replace(/<[^>]*>/g, '').slice(0, 4)), 'ja-JP');
    expect(pose()).toBe('thinking');
  });

  it('listen-pick auto-plays the English word', async () => {
    vi.mocked(loadQuestions).mockResolvedValue(POOL.filter((q) => q.kind === 'listen-pick'));
    mount();
    await start();
    const q = current();
    await waitFor(() => expect(speak).toHaveBeenCalledWith(q.speakEn, 'en-US'));
  });

  it('a wrong answer shows もういちど！, a surprised villager, keeps the question, and never shows failure language', async () => {
    mount();
    await start();
    const q = current();
    tapAnswer(q, false);
    expect(await screen.findByText('もういちど！')).toBeTruthy();
    expect(pose()).toBe('surprised');
    expect(screen.getByTestId('question').getAttribute('data-question-id')).toBe(q.id);
    const text = document.body.textContent ?? '';
    for (const bad of ['×', '✕', '✗', 'ざんねん', 'まちがい', 'ブッ']) expect(text).not.toContain(bad);
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      expect(String(el.getAttribute('class') ?? '')).not.toMatch(/\b(red|error|danger|wrong|fail|incorrect)\b/i);
    }
    // choices remain tappable
    if (q.kind === 'letter-tiles') {
      await waitFor(() => expect(screen.getAllByTestId('tile').every((t) => !(t as HTMLButtonElement).disabled)).toBe(true));
    } else {
      expect(screen.getAllByTestId('choice').every((c) => !(c as HTMLButtonElement).disabled)).toBe(true);
    }
  });

  it('a correct answer shows a cheer and a happy/excited villager, then advances', async () => {
    mount();
    await start();
    const q = current();
    tapAnswer(q, true);
    const cheer = await screen.findByTestId('cheer');
    expect(['やったね！', 'すごい！', 'いいね！', 'そのちょうし！']).toContain(cheer.textContent!.trim());
    expect(['happy', 'excited']).toContain(pose());
    expect(screen.getByTestId('reward-float').textContent).toMatch(/^\+\d+/);
    await waitFor(() => expect(screen.getByTestId('question').getAttribute('data-question-id')).not.toBe(q.id));
    expect(screen.getByTestId('progress').getAttribute('data-done')).toBe('1');
    expect(pose()).toBe('idle');
  });

  it('speaks the English answer word after a correct pick-picture', async () => {
    vi.mocked(loadQuestions).mockResolvedValue(POOL.filter((q) => q.kind === 'pick-picture'));
    mount();
    await start();
    const q = current();
    vi.mocked(speak).mockClear();
    tapAnswer(q, true);
    const word = q.choices!.find((c) => c.id === q.answer)!.textEn;
    await waitFor(() => expect(speak).toHaveBeenCalledWith(word, 'en-US'));
  });

  it('speaks the completed sentence after a correct pick-word', async () => {
    vi.mocked(loadQuestions).mockResolvedValue(POOL.filter((q) => q.kind === 'pick-word'));
    mount();
    await start();
    const q = current();
    vi.mocked(speak).mockClear();
    tapAnswer(q, true);
    const word = q.choices!.find((c) => c.id === q.answer)!.textEn!;
    await waitFor(() => expect(speak).toHaveBeenCalledWith(q.promptEn!.replace('___', word), 'en-US'));
  });

  it('busy guard: a synchronous double tap on the correct choice answers only one question', async () => {
    vi.mocked(loadQuestions).mockResolvedValue(POOL.filter((q) => q.kind === 'pick-picture'));
    mount();
    await start();
    const q = current();
    const btn = screen.getAllByTestId('choice').find((c) => c.getAttribute('data-choice-id') === q.answer)!;
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(screen.getByTestId('question').getAttribute('data-question-id')).not.toBe(q.id));
    await new Promise((r) => setTimeout(r, 60));
    expect(screen.getByTestId('progress').getAttribute('data-done')).toBe('1');
    expect((await store.allProgress()).length).toBe(1);
  });

  it('busy guard: taps during the cheer delay are ignored', async () => {
    vi.mocked(loadQuestions).mockResolvedValue(POOL.filter((q) => q.kind === 'pick-picture'));
    mount('mimi', { ...FAST, advanceMs: 150 });
    await start();
    const q = current();
    tapAnswer(q, true);
    await screen.findByTestId('cheer');
    const next = screen.getAllByTestId('choice');
    expect(next.every((c) => (c as HTMLButtonElement).disabled)).toBe(true);
    for (const c of next) fireEvent.click(c);
    await waitFor(() => expect(screen.getByTestId('question').getAttribute('data-question-id')).not.toBe(q.id));
    expect(screen.getByTestId('progress').getAttribute('data-done')).toBe('1');
  });

  it('five correct answers end in a summary with bells, and もういっかい starts a new quest', async () => {
    mount();
    await start();
    for (let i = 0; i < 5; i++) {
      // eslint-disable-next-line no-await-in-loop
      await answerRight();
    }
    const summary = await screen.findByTestId('summary');
    expect(Number(screen.getByTestId('summary-bells').textContent)).toBeGreaterThan(0);
    expect(summary.querySelector('img[src*="coin"]')).not.toBeNull();
    expect(['happy', 'excited']).toContain(pose());
    expect(await store.getBells()).toBe(Number(screen.getByTestId('summary-bells').textContent));
    expect(screen.getByText('むらへもどる')).toBeTruthy();
    fireEvent.click(screen.getByText('もういっかい'));
    expect(await screen.findByTestId('question')).toBeTruthy();
    expect(screen.getByTestId('progress').getAttribute('data-done')).toBe('0');
  });

  it('むらへもどる from the summary goes to the village', async () => {
    mount();
    await start();
    for (let i = 0; i < 5; i++) {
      // eslint-disable-next-line no-await-in-loop
      await answerRight();
    }
    fireEvent.click(await screen.findByText('むらへもどる'));
    expect(window.location.hash).toBe('#/');
  });
});

/** Real-time poll (fake timers only fake the interval); optionally advances the fake clock each round. */
async function pollReal(cond: () => boolean, advanceFakeMs = 0, rounds = 300) {
  for (let i = 0; i < rounds; i++) {
    if (cond()) return true;
    // eslint-disable-next-line no-await-in-loop
    if (advanceFakeMs) await vi.advanceTimersByTimeAsync(advanceFakeMs);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 10));
  }
  return cond();
}

describe('Quest active-time tick (fake timers)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const noTick = { advanceMs: 5 }; // default tickMs = 1000, driven by the fake clock

  async function startFake() {
    fireEvent.click(screen.getByText('はじめる'));
    expect(await pollReal(() => !!screen.queryByTestId('question'))).toBe(true);
    await new Promise((r) => setTimeout(r, 60)); // let Preact flush the effect that creates the interval
  }

  it('does not count while the intro shows', async () => {
    mount('mimi', noTick);
    await vi.advanceTimersByTimeAsync(5000);
    expect((await store.getDay()).playSeconds).toBe(0);
  });

  it('counts one second per second while a question is shown and the page is visible', async () => {
    mount('mimi', noTick);
    await startFake();
    await vi.advanceTimersByTimeAsync(3000);
    let seconds = 0;
    await pollReal(() => {
      void store.getDay().then((d) => (seconds = d.playSeconds));
      return seconds === 3;
    });
    expect(seconds).toBe(3);
  });

  it('does not count while the page is hidden (hidden BEFORE start)', async () => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    mount('mimi', noTick);
    await startFake();
    await vi.advanceTimersByTimeAsync(5000);
    await pollReal(() => false, 0, 5);
    expect((await store.getDay()).playSeconds).toBe(0);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    await vi.advanceTimersByTimeAsync(2000);
    await pollReal(() => false, 0, 5);
    expect((await store.getDay()).playSeconds).toBe(2);
  });

  it('reaching the daily limit stops with the sleepy daily-stop screen', async () => {
    await store.putSettings({ dailyLimitSeconds: 3 });
    mount('mimi', noTick);
    await startFake();
    expect(await pollReal(() => !!screen.queryByText('きょうは おしまい。またあしたね！'), 1000)).toBe(true);
    expect(pose()).toBe('sleepy');
    expect(screen.queryByTestId('question')).toBeNull();
    expect((await store.getDay()).playSeconds).toBeGreaterThanOrEqual(3);
  });

  it('still stops at the limit when saving play time fails, and marks the app degraded', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await store.putSettings({ dailyLimitSeconds: 3 });
    await store.putDay({ dateKey: dateKey(new Date()), playSeconds: 1 });
    const failing = new Proxy(store, {
      get: (t, k) => (k === 'putDay' ? () => Promise.reject(new Error('full')) : Reflect.get(t, k)),
    });
    render(
      <StoreProvider open={() => Promise.resolve(failing)}>
        <Quest villagerId="mimi" {...noTick} />
      </StoreProvider>,
    );
    await startFake();
    expect(await pollReal(() => !!screen.queryByText('きょうは おしまい。またあしたね！'), 1000)).toBe(true);
    expect(getDegraded()).not.toBeNull();
  });
});

describe('Quest voice cancelling', () => {
  const events: string[] = [];
  beforeEach(() => {
    events.length = 0;
    vi.mocked(cancelSpeech)
      .mockReset()
      .mockImplementation(() => void events.push('cancel'));
    vi.mocked(speak).mockImplementation((_t, l) => {
      events.push(`speak:${l}`);
      return Promise.resolve();
    });
  });

  it('replay taps cancel before each speak, so they replace instead of stacking', async () => {
    mount();
    await start();
    // the intro screen speaks the villager's name; wait for the question's own prompt
    await waitFor(() => expect(vi.mocked(speak).mock.calls.some(([t, l]) => l === 'ja-JP' && t !== 'ミミ')).toBe(true));
    events.length = 0;
    const btn = screen.getByLabelText('もんだいを きく');
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(events).toEqual(['cancel', 'speak:ja-JP', 'cancel', 'speak:ja-JP', 'cancel', 'speak:ja-JP']);
  });

  it('a question change cancels the old speech before the new prompt', async () => {
    mount();
    await start();
    const first = current();
    events.length = 0;
    tapAnswer(first, true);
    await waitFor(() => expect(screen.getByTestId('question').getAttribute('data-question-id')).not.toBe(first.id));
    const nextPrompt = events.lastIndexOf('speak:ja-JP');
    expect(nextPrompt).toBeGreaterThan(0);
    expect(events[nextPrompt - 1]).toBe('cancel');
  });

  it('an answer cancels the prompt before the English answer is spoken', async () => {
    vi.mocked(loadQuestions).mockResolvedValue(POOL.filter((q) => q.kind === 'pick-picture'));
    mount();
    await start();
    events.length = 0;
    tapAnswer(current(), true);
    await waitFor(() => expect(events).toContain('speak:en-US'));
    expect(events.indexOf('cancel')).toBeLessThan(events.indexOf('speak:en-US'));
  });

  it('leaving the quest cancels speech', async () => {
    const { unmount } = mount();
    await start();
    vi.mocked(cancelSpeech).mockClear();
    act(() => unmount());
    expect(cancelSpeech).toHaveBeenCalled();
  });
});

describe('Quest polish', () => {
  it('the きく button is disabled during the cheer delay', async () => {
    mount('mimi', { ...FAST, advanceMs: 200 });
    await start();
    tapAnswer(current(), true);
    await screen.findByTestId('cheer');
    expect((screen.getByLabelText('もんだいを きく') as HTMLButtonElement).disabled).toBe(true);
  });

  it('もういっかい goes straight to a loading state, not the intro card', async () => {
    mount();
    await start();
    for (let i = 0; i < 5; i++) {
      // eslint-disable-next-line no-await-in-loop
      await answerRight();
    }
    fireEvent.click(await screen.findByText('もういっかい'));
    expect(screen.queryByText('はじめる')).toBeNull();
    expect(screen.getByTestId('quest').getAttribute('data-phase')).toBe('loading');
    expect(await screen.findByTestId('question')).toBeTruthy();
  });

  it('moves focus to the question container when the question changes', async () => {
    mount();
    await start();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('question')));
    const first = current();
    tapAnswer(first, true);
    await waitFor(() => expect(screen.getByTestId('question').getAttribute('data-question-id')).not.toBe(first.id));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('question')));
  });

  it('warns once per category: a settings failure and a day-record failure each warn', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bad = new Proxy(store, {
      get: (t, k) =>
        k === 'getSettings' || k === 'getDay' ? () => Promise.reject(new Error('x')) : Reflect.get(t, k),
    });
    render(
      <StoreProvider open={() => Promise.resolve(bad)}>
        <Quest villagerId="mimi" {...FAST} />
      </StoreProvider>,
    );
    await start();
    const mine = warn.mock.calls.map((c) => String(c[0])).filter((m) => m.startsWith('quest:'));
    expect(mine.filter((m) => m.includes('settings'))).toHaveLength(1);
    expect(mine.filter((m) => m.includes('day record'))).toHaveLength(1);
  });

  it('warns once when settings cannot be read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bad = new Proxy(store, {
      get: (t, k) => (k === 'getSettings' ? () => Promise.reject(new Error('x')) : Reflect.get(t, k)),
    });
    render(
      <StoreProvider open={() => Promise.resolve(bad)}>
        <Quest villagerId="mimi" {...FAST} />
      </StoreProvider>,
    );
    await start();
    expect(warn.mock.calls.some((c) => String(c[0]).includes('settings'))).toBe(true);
  });
});

describe('Quest with no store (degraded)', () => {
  it('warns, marks the app degraded, and keeps the daily limit across a reload via localStorage', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(FALLBACK_DAY_KEY, JSON.stringify({ dateKey: dateKey(new Date()), playSeconds: 99999 }));
    render(
      <StoreProvider open={() => Promise.reject(new Error('no idb'))}>
        <Quest villagerId="mimi" {...FAST} />
      </StoreProvider>,
    );
    fireEvent.click(await screen.findByText('はじめる'));
    expect(await screen.findByText('きょうは おしまい。またあしたね！')).toBeTruthy();
    expect(warn.mock.calls.some((c) => String(c[0]).includes('in-memory fallback'))).toBe(true);
    expect(getDegraded()).toMatch(/fallback/);
  });

  it('bells earned in a fallback quest show in the village and the shop (one shared store)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    window.location.hash = '#/quest/mimi';
    render(<App open={() => Promise.reject(new Error('no idb'))} />);
    await start();
    for (let i = 0; i < 5; i++) await answerRight();
    const earned = Number((await screen.findByTestId('summary-bells')).textContent);
    expect(earned).toBeGreaterThan(0);
    act(() => {
      window.location.hash = '#/';
    });
    await waitFor(() => expect(screen.getByTestId('bells').textContent).toBe(String(earned)));
    act(() => {
      window.location.hash = '#/shop';
    });
    await waitFor(() => expect(screen.getByTestId('bells').textContent).toBe(String(earned)));
  });

  it('mirrors played seconds into localStorage', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <StoreProvider open={() => Promise.reject(new Error('no idb'))}>
        <Quest villagerId="mimi" {...FAST} />
      </StoreProvider>,
    );
    await start();
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(FALLBACK_DAY_KEY) ?? 'null')?.playSeconds).toBeGreaterThan(0),
    );
  });

  it('still plays through using the in-memory fallback', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <StoreProvider open={() => Promise.reject(new Error('no idb'))}>
        <Quest villagerId="mimi" {...FAST} />
      </StoreProvider>,
    );
    await start();
    await answerRight();
    expect(screen.getByTestId('progress').getAttribute('data-done')).toBe('1');
  });

  it('survives a store whose reads and writes all reject', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = new Proxy({} as Store, {
      get: (_t, prop) => (prop === 'then' ? undefined : prop === 'close' ? () => {} : prop === 'health' ? async () => ({ ok: false }) : () => Promise.reject(new Error('x'))),
    });
    render(
      <StoreProvider open={() => Promise.resolve(broken)}>
        <Quest villagerId="mimi" {...FAST} />
      </StoreProvider>,
    );
    await start();
    await act(async () => {});
    await answerRight();
    expect(screen.getByTestId('progress').getAttribute('data-done')).toBe('1');
  });
});
