import { ISLANDS, LOCKED_MESSAGE } from '../domain/islands';
import type { GradeId } from '../domain/types';
import { useState } from 'preact/hooks';
import { useStore } from '../store/store-context';
import { navigate } from './router';
import { showToast } from './toast';
import { useSpokenMessage } from './use-spoken';

export const MAP_PROMPT = 'どの しまに いく？';
export const CHOSEN_TOAST = 'このしまで あそぼう！';

function Lock() {
  return (
    <svg class="lock" viewBox="0 0 24 24" width="32" height="32" aria-hidden="true">
      <rect x="5" y="10" width="14" height="10" rx="3" fill="#8a6a4f" />
      <path d="M8 10V8a4 4 0 0 1 8 0v2" fill="none" stroke="#8a6a4f" stroke-width="2.4" stroke-linecap="round" />
    </svg>
  );
}

export function IslandMap() {
  const { store } = useStore();
  const [lockedTaps, setLockedTaps] = useState(0);
  // One voice at a time: the prompt, replaced by the locked-island note after a tap on a locked island.
  useSpokenMessage(lockedTaps > 0 ? LOCKED_MESSAGE : MAP_PROMPT, 'ja-JP', lockedTaps);
  // Saves in the background: a slow or hung store must never block going back to the village.
  const save = async (grade: GradeId) => {
    if (!store) {
      console.warn('island: no store, the chosen grade was not saved');
      return;
    }
    try {
      await store.putSettings({ ...(await store.getSettings()), currentGrade: grade });
    } catch (e) {
      console.warn('island: could not save the chosen grade', e);
    }
  };
  const choose = (grade: GradeId) => {
    void save(grade);
    navigate('#/');
    // After the route change, so leaving the map (which silences its own voice) never cuts the toast's voice.
    setTimeout(() => showToast(CHOSEN_TOAST), 0);
  };
  return (
    <main class="screen map">
      <h1 class="chip map-title">{MAP_PROMPT}</h1>
      <ul class="islands">
        {ISLANDS.map((isl, i) => (
          <li key={isl.grade} class={`island-cell cell-${i}`}>
            <button
              type="button"
              class={`island ${isl.unlocked ? 'island-open' : 'island-locked'}`}
              data-testid="island"
              aria-disabled={isl.unlocked ? 'false' : 'true'}
              onClick={() => {
                if (!isl.unlocked) {
                  setLockedTaps((n) => n + 1);
                  return;
                }
                choose(isl.grade);
              }}
            >
              {isl.unlocked ? (
                <span class="island-star" aria-hidden="true">
                  ★
                </span>
              ) : (
                <Lock />
              )}
              <span class="chip island-label">{isl.labelJa}</span>
              {!isl.unlocked && <span class="chip island-note">{LOCKED_MESSAGE}</span>}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" class="btn btn-primary back-btn" onClick={() => navigate('#/')}>
        もどる
      </button>
    </main>
  );
}
