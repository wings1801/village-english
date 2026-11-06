import { useEffect } from 'preact/hooks';
import { cancelSpeech, speak, type Lang } from '../audio/tts';
import { plainJa } from '../domain/plain-ja';

/**
 * Speaks `plainJa(text)` once when the text appears or changes (not on every render) and silences it when
 * the text changes or the component unmounts. `null` means nothing to say. `nonce` lets the same text be
 * spoken again (for example a shop message repeated after another tap).
 */
export function useSpokenMessage(text: string | null, lang: Lang = 'ja-JP', nonce: number | string = 0): void {
  useEffect(() => {
    if (!text) return;
    void speak(plainJa(text), lang);
    return () => cancelSpeech();
  }, [text, lang, nonce]);
}
