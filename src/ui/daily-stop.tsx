import { useEffect } from 'preact/hooks';
import { cancelSpeech, speak } from '../audio/tts';
import { VILLAGERS } from '../assets/manifest';
import { navigate } from './router';

export const DAILY_STOP_COPY = 'きょうは おしまい。またあしたね！';

/** Fuwa, the sleepy sheep, says goodnight whichever villager the child was playing with. */
const fuwa = VILLAGERS.find((v) => v.id === 'momo_chan')!;

/** Shown when today's play time is used up. Offers going back to the village or decorating it (decorating never counts as play time). */
export function DailyStop() {
  useEffect(() => {
    void speak(DAILY_STOP_COPY, 'ja-JP');
    return () => cancelSpeech();
  }, []);
  return (
    <main class="screen quest-plain" data-testid="daily-stop">
      <div class="card stop-card">
        <img
          class="intro-villager"
          data-testid="quest-villager"
          data-pose="sleepy"
          src={fuwa.poses.sleepy}
          alt=""
          draggable={false}
        />
        <p class="stop-text">{DAILY_STOP_COPY}</p>
        <button type="button" class="btn btn-primary" onClick={() => navigate('#/')}>
          むらへもどる
        </button>
        <button type="button" class="btn btn-soft" onClick={() => navigate('#/decorate')}>
          むらをかざる
        </button>
      </div>
    </main>
  );
}
