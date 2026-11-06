import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Real tts module on purpose (no mock): checks the pre-unlock queue survives leaving the quest intro.
import { speak, unlockAudio } from '../src/audio/tts';
import { Quest } from '../src/ui/quest';

class MockUtterance {
  lang = '';
  voice = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

describe('Quest intro and pre-unlock speech', () => {
  it('opening the quest and tapping もどる leaves speech queued by another caller intact', async () => {
    const spoken: string[] = [];
    const synth = {
      getVoices: () => [],
      speak: vi.fn((u: MockUtterance) => {
        spoken.push(u.text);
        queueMicrotask(() => u.onend?.());
      }),
      cancel: vi.fn(),
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true, writable: true });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: MockUtterance, configurable: true, writable: true });

    void speak('queued by someone else', 'en-US'); // before the first gesture
    const { unmount } = render(<Quest villagerId="mimi" />);
    fireEvent.click(await screen.findByText('もどる'));
    await new Promise((r) => setTimeout(r, 50)); // let effects flush so the cleanup is registered
    act(() => unmount()); // cleanup runs cancelSpeech()
    expect(synth.cancel).toHaveBeenCalled(); // the cleanup really ran
    expect(spoken).toEqual([]);
    unlockAudio();
    // the intro's own greeting (the villager's name) is queued after the other caller's speech
    expect(spoken).toEqual(['queued by someone else', 'ミミ']);
  });
});
