import { useEffect, useState } from 'preact/hooks';
import { navigate } from './router';
import { listVoices, speak, unlockAudio, type VoiceInfo } from '../audio/tts';

const buttonStyle = { minWidth: '56px', minHeight: '56px', fontSize: '1.25rem', margin: '0.5rem' };

export function VoiceProbe() {
  const [voices, setVoices] = useState<VoiceInfo[] | null>(null);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    void listVoices().then(setVoices);
  }, []);

  const unlock = () => {
    unlockAudio();
    setUnlocked(true);
  };

  const say = (text: string, lang: 'en-US' | 'ja-JP') => {
    unlockAudio();
    setUnlocked(true);
    void speak(text, lang);
  };

  return (
    <main>
      <button type="button" class="btn btn-primary back-btn" data-testid="probe-back" onClick={() => navigate('#/')}>
        もどる
      </button>
      <h1>こえのテスト</h1>
      <button type="button" style={buttonStyle} onClick={unlock} disabled={unlocked}>
        {unlocked ? 'おとが でるよ' : 'タップして おとを だす'}
      </button>
      <div>
        <button type="button" style={buttonStyle} onClick={() => say("Hello, I'm Mimi.", 'en-US')}>
          Hello, I'm Mimi.
        </button>
        <button type="button" style={buttonStyle} onClick={() => say('こんにちは', 'ja-JP')}>
          こんにちは
        </button>
      </div>
      <h2>つかえる こえ</h2>
      <ul data-testid="voice-list">
        {voices?.map((v) => (
          <li key={`${v.name}|${v.lang}`}>
            {v.name} / {v.lang} / {v.localService ? 'ローカル' : 'ネット'}
          </li>
        ))}
      </ul>
    </main>
  );
}
