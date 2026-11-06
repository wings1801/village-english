import 'fake-indexeddb/auto';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/audio/tts', () => ({
  speak: vi.fn(() => Promise.resolve()),
  cancelSpeech: vi.fn(),
  unlockAudio: vi.fn(),
  listVoices: vi.fn(() => Promise.resolve([])),
}));
vi.mock('../src/domain/content', () => ({ loadQuestions: vi.fn(() => Promise.resolve([])) }));

import { cancelSpeech, speak, unlockAudio } from '../src/audio/tts';
import { App } from '../src/app';
import { DECOR } from '../src/assets/manifest';
import { LOCKED_MESSAGE } from '../src/domain/islands';
import { PRICES } from '../src/domain/village';
import { openStore, type Store } from '../src/store/store';
import { StoreProvider } from '../src/store/store-context';
import { Decorate, HINT_PICK, HINT_PLACE, MSG_SAVE_FAILED } from '../src/ui/decorate';
import { IslandMap, MAP_PROMPT } from '../src/ui/island-map';
import { MSG_EMPTY, Quest } from '../src/ui/quest';
import { MSG_BOUGHT, MSG_TOO_POOR, Shop } from '../src/ui/shop';
import { ToastHost, showToast } from '../src/ui/toast';
import { useSpokenMessage } from '../src/ui/use-spoken';

let n = 0;
let store: Store;
beforeEach(async () => {
  store = await openStore(`voice-test-${++n}`);
  vi.mocked(speak).mockClear();
  vi.mocked(cancelSpeech).mockClear();
  vi.mocked(unlockAudio).mockClear();
});
afterEach(() => {
  cleanup();
  store.close();
  window.location.hash = '';
  vi.restoreAllMocks();
});

const mount = (ui: preact.ComponentChildren) =>
  render(<StoreProvider open={() => Promise.resolve(store)}>{ui}</StoreProvider>);
const spokenTexts = () => vi.mocked(speak).mock.calls.map((c) => c[0]);

function Probe({ text, nonce }: { text: string | null; nonce?: number }) {
  useSpokenMessage(text, 'ja-JP', nonce);
  return null;
}

describe('useSpokenMessage', () => {
  it('speaks plain Japanese once, not on every render', () => {
    const { rerender } = render(<Probe text="<ruby>今日<rt>きょう</rt></ruby>は あめ" />);
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledWith('きょうは あめ', 'ja-JP');
    rerender(<Probe text="<ruby>今日<rt>きょう</rt></ruby>は あめ" />);
    expect(speak).toHaveBeenCalledTimes(1);
  });

  it('a changed text speaks again and cancels the old one first', () => {
    const { rerender } = render(<Probe text="あ" />);
    vi.mocked(cancelSpeech).mockClear();
    rerender(<Probe text="い" />);
    expect(cancelSpeech).toHaveBeenCalledTimes(1);
    expect(spokenTexts()).toEqual(['あ', 'い']);
  });

  it('a new nonce repeats the same text', () => {
    const { rerender } = render(<Probe text="あ" nonce={1} />);
    rerender(<Probe text="あ" nonce={2} />);
    expect(spokenTexts()).toEqual(['あ', 'あ']);
  });

  it('unmount cancels; null never speaks nor cancels', async () => {
    await new Promise((r) => setTimeout(r, 30)); // let effects of earlier tests settle
    vi.mocked(speak).mockClear();
    vi.mocked(cancelSpeech).mockClear();
    const quiet = render(<Probe text={null} />);
    act(() => quiet.unmount());
    expect(speak).not.toHaveBeenCalled();
    expect(cancelSpeech).not.toHaveBeenCalled();
    const { unmount } = render(<Probe text="あ" />);
    expect(speak).toHaveBeenCalledTimes(1);
    act(() => unmount());
    expect(cancelSpeech).toHaveBeenCalledTimes(1);
  });
});

describe('first-gesture unlock at the app root', () => {
  it('unlocks audio exactly once, from a capture-phase pointerdown or keydown', () => {
    mount(<App />);
    expect(unlockAudio).not.toHaveBeenCalled();
    fireEvent.pointerDown(document.body);
    fireEvent.keyDown(document.body, { key: 'a' });
    fireEvent.pointerDown(document.body);
    expect(unlockAudio).toHaveBeenCalledTimes(1);
  });
});

describe('screens speak their messages', () => {
  it('map: the prompt once, the locked note after each tap on a locked island', () => {
    render(<IslandMap />);
    expect(spokenTexts()).toEqual([MAP_PROMPT]);
    const locked = screen.getAllByTestId('island')[2];
    fireEvent.click(locked);
    fireEvent.click(locked);
    expect(spokenTexts()).toEqual([MAP_PROMPT, LOCKED_MESSAGE, LOCKED_MESSAGE]);
  });

  it('map: choosing an island speaks the toast after leaving the map, never cut by the map cleanup', async () => {
    window.location.hash = '#/map';
    mount(<App />);
    vi.mocked(speak).mockClear();
    fireEvent.click(screen.getAllByTestId('island')[0]);
    await waitFor(() => expect(spokenTexts()).toContain('このしまで あそぼう！'));
    const lastCancel = vi.mocked(cancelSpeech).mock.invocationCallOrder.at(-1)!;
    const toastSpeak = vi.mocked(speak).mock.invocationCallOrder[spokenTexts().indexOf('このしまで あそぼう！')];
    // the only cancel after the toast's speak is its own removal later; none may sit between map exit and speak
    expect(vi.mocked(cancelSpeech).mock.invocationCallOrder.filter((o) => o > toastSpeak)).toHaveLength(
      lastCancel > toastSpeak ? 1 : 0,
    );
  });

  it('toast host speaks a toast once', () => {
    render(<ToastHost />);
    act(() => showToast('やったね'));
    expect(spokenTexts()).toEqual(['やったね']);
  });

  it('shop: too poor (and again on a second tap), then bought', async () => {
    mount(<Shop />);
    const row = (await screen.findAllByTestId('shop-item'))[0];
    const id = row.getAttribute('data-decor-id')!;
    fireEvent.click(row.querySelector('button')!);
    await waitFor(() => expect(spokenTexts()).toEqual([MSG_TOO_POOR]));
    fireEvent.click(row.querySelector('button')!);
    await waitFor(() => expect(spokenTexts()).toEqual([MSG_TOO_POOR, MSG_TOO_POOR]));
    cleanup(); // closes the provider's store
    store = await openStore(`voice-test-${n}`);
    await store.addBells(PRICES[id]);
    vi.mocked(speak).mockClear();
    mount(<Shop />);
    await waitFor(() => expect(screen.getByTestId('bells').textContent).toBe(String(PRICES[id])));
    const row2 = (await screen.findAllByTestId('shop-item'))[0];
    fireEvent.click(row2.querySelector('button')!);
    await waitFor(() => expect(spokenTexts()).toEqual([MSG_BOUGHT]));
  });

  it('decorate: hint for choosing, hint for placing, and the save-failed chip', async () => {
    await store.addBells(1000);
    await store.buyDecor(DECOR[0].id, PRICES[DECOR[0].id]);
    vi.spyOn(store, 'putPlaced').mockRejectedValue(new Error('quota'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount(<Decorate />);
    await waitFor(() => expect(spokenTexts()).toEqual([HINT_PICK]));
    fireEvent.click(await screen.findByTestId('tray-item'));
    await waitFor(() => expect(spokenTexts()).toEqual([HINT_PICK, HINT_PLACE]));
    const scene = screen.getByTestId('decor-scene');
    scene.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    fireEvent.click(scene, { clientX: 50, clientY: 50 });
    await waitFor(() => expect(spokenTexts()).toContain(MSG_SAVE_FAILED));
  });

  it('quest: the villager intro and the empty-content screen speak once each', async () => {
    window.location.hash = '#/quest/mimi';
    mount(<Quest villagerId="mimi" />);
    await waitFor(() => expect(spokenTexts()).toEqual(['ミミ']));
    fireEvent.click(await screen.findByText('はじめる'));
    await waitFor(() => expect(spokenTexts()).toContain(MSG_EMPTY));
    expect(spokenTexts().filter((t) => t === MSG_EMPTY)).toHaveLength(1);
  });
});
