export type Lang = 'en-US' | 'ja-JP';
export type VoiceInfo = { name: string; lang: string; localService: boolean };

type Pending = { text: string; lang: Lang; resolve: () => void };

const VOICES_TIMEOUT_MS = 1000;
const MIN_SPEAK_TIMEOUT_MS = 3000;
const MS_PER_CHAR = 250;

let unlocked = false;
let audioContext: AudioContext | undefined;
const queue: Pending[] = [];
/** Finishers of utterances handed to the browser and not yet ended (so cancelSpeech can release their callers). */
const inflight = new Set<() => void>();
/** Set by a cancelSpeech() that cancelled something; consumed by the next speak(). */
let deferNext = false;

function synth(): SpeechSynthesis | undefined {
  return typeof window !== 'undefined' ? window.speechSynthesis : undefined;
}

function pickVoice(voices: SpeechSynthesisVoice[], lang: Lang): SpeechSynthesisVoice | undefined {
  const prefix = lang.slice(0, 2).toLowerCase();
  const candidates = voices.filter((v) => v.lang.toLowerCase().startsWith(prefix));
  const rank = (v: SpeechSynthesisVoice) => (v.lang === lang ? 0 : 2) + (v.localService ? 0 : 1);
  return [...candidates].sort((a, b) => rank(a) - rank(b))[0];
}

function speakNow({ text, lang, resolve }: Pending): void {
  try {
    const s = synth();
    if (!s || typeof SpeechSynthesisUtterance === 'undefined') {
      resolve();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    const voice = pickVoice(s.getVoices(), lang);
    if (voice) utterance.voice = voice;
    // iOS Safari and some Chrome builds sometimes drop onend; a fallback timer
    // (started once the utterance is handed over) keeps callers from hanging.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = () => {
      clearTimeout(timer);
      inflight.delete(done);
      resolve();
    };
    inflight.add(done);
    utterance.onend = done;
    utterance.onerror = done;
    // No cancel(): the browser queues utterances itself, so cancelling would
    // cut off earlier speech that was flushed from our pre-unlock queue.
    s.speak(utterance);
    timer = setTimeout(done, Math.max(MIN_SPEAK_TIMEOUT_MS, text.length * MS_PER_CHAR));
  } catch {
    resolve();
  }
}

/** Call from the first user tap. Idempotent. */
export function unlockAudio(): void {
  if (!audioContext && typeof window !== 'undefined' && typeof window.AudioContext !== 'undefined') {
    try {
      audioContext = new window.AudioContext();
    } catch {
      audioContext = undefined;
    }
  }
  try {
    void audioContext?.resume()?.catch(() => {});
  } catch {
    // ignore
  }
  if (unlocked) return;
  unlocked = true;
  for (const item of queue.splice(0)) speakNow(item);
}

/**
 * Stops speech already handed to speechSynthesis and resolves those pending
 * speak() promises so callers never hang. It deliberately does NOT touch the
 * pre-unlock queue: whatever any caller queued before the first gesture is
 * still flushed by unlockAudio(). Never throws.
 */
export function cancelSpeech(): void {
  const hadInflight = inflight.size > 0;
  try {
    synth()?.cancel();
  } catch {
    // ignore
  }
  for (const finish of [...inflight]) finish();
  // WebKit can drop an utterance spoken right after cancel(); defer the next one.
  if (hadInflight) deferNext = true;
}

/** Never throws or rejects. Queues until unlockAudio() has been called. */
export function speak(text: string, lang: Lang): Promise<void> {
  return new Promise<void>((resolve) => {
    const item = { text, lang, resolve };
    if (!unlocked) queue.push(item);
    else if (deferNext) {
      deferNext = false;
      setTimeout(() => speakNow(item), 0);
    } else speakNow(item);
  });
}

function toInfo(v: SpeechSynthesisVoice): VoiceInfo {
  return { name: v.name, lang: v.lang, localService: v.localService };
}

/** Waits up to 1000 ms for voiceschanged if none are loaded yet. */
export function listVoices(): Promise<VoiceInfo[]> {
  return new Promise<VoiceInfo[]>((resolve) => {
    const s = synth();
    if (!s) {
      resolve([]);
      return;
    }
    const initial = s.getVoices();
    if (initial.length > 0) {
      resolve(initial.map(toInfo));
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const finish = () => {
      clearTimeout(timer);
      s.removeEventListener?.('voiceschanged', onChanged);
      resolve(s.getVoices().map(toInfo));
    };
    // An empty voiceschanged is not the answer yet; wait out the timeout.
    const onChanged = () => {
      if (s.getVoices().length > 0) finish();
    };
    s.addEventListener?.('voiceschanged', onChanged);
    timer = setTimeout(finish, VOICES_TIMEOUT_MS);
  });
}
