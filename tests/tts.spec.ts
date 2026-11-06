import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Voice = { name: string; lang: string; localService: boolean };

class MockUtterance {
  text: string;
  lang = '';
  voice: Voice | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

function installSynth(voices: Voice[], speakImpl?: (u: MockUtterance) => void) {
  const synth = {
    getVoices: vi.fn(() => voices),
    speak: vi.fn((u: MockUtterance) => {
      if (speakImpl) return speakImpl(u);
      queueMicrotask(() => u.onend?.());
    }),
    cancel: vi.fn(),
    onvoiceschanged: null as null | (() => void),
    listeners: [] as (() => void)[],
    addEventListener: vi.fn((_: string, fn: () => void) => {
      synth.listeners.push(fn);
    }),
    removeEventListener: vi.fn((_: string, fn: () => void) => {
      synth.listeners = synth.listeners.filter((l) => l !== fn);
    }),
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true, writable: true });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: MockUtterance, configurable: true, writable: true });
  return synth;
}

async function loadTts() {
  vi.resetModules();
  return import('../src/audio/tts');
}

describe('tts', () => {
  beforeEach(() => {
    delete (window as any).speechSynthesis;
    delete (window as any).SpeechSynthesisUtterance;
    delete (window as any).AudioContext;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not speak before unlockAudio', async () => {
    const synth = installSynth([]);
    const { speak } = await loadTts();
    void speak('Hello', 'en-US');
    await Promise.resolve();
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it('speaks the queued utterance with the right lang after unlock', async () => {
    const synth = installSynth([{ name: 'Kyoko', lang: 'ja-JP', localService: true }]);
    const { speak, unlockAudio } = await loadTts();
    const p = speak('こんにちは', 'ja-JP');
    unlockAudio();
    await p;
    expect(synth.speak).toHaveBeenCalledTimes(1);
    const u = synth.speak.mock.calls[0][0] as MockUtterance;
    expect(u.text).toBe('こんにちは');
    expect(u.lang).toBe('ja-JP');
    expect(u.voice?.name).toBe('Kyoko');
  });

  it('resolves without throwing when speechSynthesis is missing', async () => {
    const { speak, unlockAudio, listVoices } = await loadTts();
    unlockAudio();
    await expect(speak('Hello', 'en-US')).resolves.toBeUndefined();
    await expect(listVoices()).resolves.toEqual([]);
  });

  it('speaks queued utterances in order after unlock', async () => {
    const synth = installSynth([]);
    const { speak, unlockAudio } = await loadTts();
    const ps = [speak('one', 'en-US'), speak('two', 'en-US'), speak('three', 'ja-JP')];
    unlockAudio();
    await Promise.all(ps);
    const texts = synth.speak.mock.calls.map((c) => (c[0] as MockUtterance).text);
    expect(texts).toEqual(['one', 'two', 'three']);
  });

  it('unlockAudio is idempotent and creates one AudioContext', async () => {
    installSynth([]);
    const resume = vi.fn(() => Promise.resolve());
    const ctor = vi.fn(function (this: any) {
      this.state = 'suspended';
      this.resume = resume;
    });
    (window as any).AudioContext = ctor;
    const { unlockAudio } = await loadTts();
    unlockAudio();
    unlockAudio();
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(resume).toHaveBeenCalled();
  });

  it('resolves when the underlying speak throws', async () => {
    installSynth([], () => {
      throw new Error('boom');
    });
    const { speak, unlockAudio } = await loadTts();
    unlockAudio();
    await expect(speak('Hello', 'en-US')).resolves.toBeUndefined();
  });

  it('prefers exact lang match and local voices', async () => {
    const synth = installSynth([
      { name: 'Remote GB', lang: 'en-GB', localService: false },
      { name: 'Remote US', lang: 'en-US', localService: false },
      { name: 'Local GB', lang: 'en-GB', localService: true },
      { name: 'Local US', lang: 'en-US', localService: true },
    ]);
    const { speak, unlockAudio } = await loadTts();
    unlockAudio();
    await speak('Hi', 'en-US');
    expect((synth.speak.mock.calls[0][0] as MockUtterance).voice?.name).toBe('Local US');
  });

  it('falls back to a same-language voice and always sets utterance.lang', async () => {
    const synth = installSynth([{ name: 'Daniel', lang: 'en-GB', localService: true }]);
    const { speak, unlockAudio } = await loadTts();
    unlockAudio();
    await speak('Hi', 'en-US');
    const u = synth.speak.mock.calls[0][0] as MockUtterance;
    expect(u.voice?.name).toBe('Daniel');
    expect(u.lang).toBe('en-US');
  });

  it('listVoices maps voices to plain objects', async () => {
    installSynth([{ name: 'Samantha', lang: 'en-US', localService: true }]);
    const { listVoices } = await loadTts();
    expect(await listVoices()).toEqual([{ name: 'Samantha', lang: 'en-US', localService: true }]);
  });

  it('listVoices resolves [] after 1000 ms if no voices ever arrive', async () => {
    vi.useFakeTimers();
    installSynth([]);
    const { listVoices } = await loadTts();
    const p = listVoices();
    await vi.advanceTimersByTimeAsync(1000);
    await expect(p).resolves.toEqual([]);
  });

  it('speak resolves via fallback timer when onend never fires', async () => {
    vi.useFakeTimers();
    installSynth([], () => {});
    const { speak, unlockAudio } = await loadTts();
    unlockAudio();
    let done = false;
    void speak('Hi', 'en-US').then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(2999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });

  it('fallback timer scales with text length', async () => {
    vi.useFakeTimers();
    installSynth([], () => {});
    const { speak, unlockAudio } = await loadTts();
    unlockAudio();
    let done = false;
    void speak('x'.repeat(20), 'en-US').then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(4999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });

  it('listVoices resolves when voiceschanged delivers voices', async () => {
    vi.useFakeTimers();
    const voices: Voice[] = [];
    const synth = installSynth(voices);
    const { listVoices } = await loadTts();
    const p = listVoices();
    voices.push({ name: 'Kyoko', lang: 'ja-JP', localService: true });
    synth.listeners.forEach((l) => l());
    await expect(p).resolves.toEqual([{ name: 'Kyoko', lang: 'ja-JP', localService: true }]);
  });

  it('listVoices keeps waiting if voiceschanged fires with no voices', async () => {
    vi.useFakeTimers();
    const voices: Voice[] = [];
    const synth = installSynth(voices);
    const { listVoices } = await loadTts();
    let result: unknown;
    void listVoices().then((r) => {
      result = r;
    });
    await vi.advanceTimersByTimeAsync(500);
    synth.listeners.forEach((l) => l());
    await vi.advanceTimersByTimeAsync(0);
    expect(result).toBeUndefined();
    voices.push({ name: 'Late', lang: 'en-US', localService: true });
    synth.listeners.forEach((l) => l());
    await vi.advanceTimersByTimeAsync(0);
    expect(result).toEqual([{ name: 'Late', lang: 'en-US', localService: true }]);
  });

  describe('cancelSpeech', () => {
    it('cancels the synth and resolves pending speak promises', async () => {
      const synth = installSynth([], () => {}); // never ends
      const { speak, unlockAudio, cancelSpeech } = await loadTts();
      unlockAudio();
      let resolved = 0;
      void speak('one', 'en-US').then(() => resolved++);
      void speak('two', 'en-US').then(() => resolved++);
      await Promise.resolve();
      cancelSpeech();
      await Promise.resolve();
      await Promise.resolve();
      expect(synth.cancel).toHaveBeenCalledTimes(1);
      expect(resolved).toBe(2);
    });

    it('does NOT touch items queued before unlock; they are still spoken after unlockAudio', async () => {
      const synth = installSynth([]);
      const { speak, unlockAudio, cancelSpeech } = await loadTts();
      let resolved = false;
      void speak('queued', 'en-US').then(() => (resolved = true));
      cancelSpeech();
      await Promise.resolve();
      expect(resolved).toBe(false);
      expect(synth.speak).not.toHaveBeenCalled();
      unlockAudio();
      expect(synth.speak).toHaveBeenCalledTimes(1);
      expect((synth.speak.mock.calls[0][0] as MockUtterance).text).toBe('queued');
    });

    it('defers the next speak by one macrotask after cancelling something in flight', async () => {
      vi.useFakeTimers();
      const synth = installSynth([], () => {}); // never ends
      const { speak, unlockAudio, cancelSpeech } = await loadTts();
      unlockAudio();
      void speak('one', 'en-US');
      expect(synth.speak).toHaveBeenCalledTimes(1);
      cancelSpeech();
      void speak('two', 'en-US');
      expect(synth.speak).toHaveBeenCalledTimes(1); // deferred
      vi.advanceTimersByTime(0);
      expect(synth.speak).toHaveBeenCalledTimes(2);
      void speak('three', 'en-US'); // the flag was consumed: immediate
      expect(synth.speak).toHaveBeenCalledTimes(3);
    });

    it('does not defer when nothing was in flight', async () => {
      vi.useFakeTimers();
      const synth = installSynth([], () => {});
      const { speak, unlockAudio, cancelSpeech } = await loadTts();
      unlockAudio();
      cancelSpeech();
      void speak('now', 'en-US');
      expect(synth.speak).toHaveBeenCalledTimes(1);
    });

    it('unlockAudio still flushes items queued and not cancelled', async () => {
      const synth = installSynth([]);
      const { speak, unlockAudio } = await loadTts();
      void speak('keep', 'en-US');
      unlockAudio();
      expect(synth.speak).toHaveBeenCalledTimes(1);
    });

    it('never throws without speechSynthesis or when cancel throws', async () => {
      const { cancelSpeech } = await loadTts();
      expect(() => cancelSpeech()).not.toThrow();
      const synth = installSynth([]);
      synth.cancel.mockImplementation(() => {
        throw new Error('x');
      });
      expect(() => cancelSpeech()).not.toThrow();
    });
  });
});
