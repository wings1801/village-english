import { useEffect, useRef, useState } from 'preact/hooks';
import type { Settings } from '../domain/types';
import { useStore } from '../store/store-context';
import type { Store } from '../store/store';
import { Dashboard } from './parent-dashboard';
import { vi } from './parent-strings';
import { PinGate } from './pin-gate';
import { navigate } from './router';

const IDLE_MS = 5 * 60 * 1000;
const ACTIVITY = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const;

type Phase =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'gate'; start: 'login' | 'arith'; settings: Settings }
  | { kind: 'open' };

const goVillage = () => navigate('#/');

function NoStore() {
  return (
    <main class="parent parent-gate" data-testid="parent-nostore">
      <div class="gate-card">
        <h1 class="gate-title">{vi.noStore.title}</h1>
        <p class="gate-text">{vi.noStore.body}</p>
        <p class="gate-text">{vi.noStore.effect}</p>
        <button type="button" class="p-btn p-btn-soft" onClick={goVillage}>
          {vi.backToVillage}
        </button>
      </div>
    </main>
  );
}

/**
 * Locks again after five minutes without a touch. iOS freezes timers while the app is suspended, so the
 * timer alone is not enough: the page being hidden locks at once, and on return (visibilitychange,
 * pageshow, focus) the stored last-activity time is compared with the clock (also when it went backwards).
 * The effect depends only on `active`; the latest `lock` is read through a ref so re-renders do not reset it.
 */
export function useIdleLock(active: boolean, lock: () => void) {
  const lockRef = useRef(lock);
  lockRef.current = lock;
  useEffect(() => {
    if (!active) return;
    let lastActive = Date.now();
    let id: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(id);
      id = setTimeout(() => lockRef.current(), IDLE_MS);
    };
    const stale = () => {
      const t = Date.now();
      return t < lastActive || t - lastActive > IDLE_MS;
    };
    const bump = () => {
      if (stale()) {
        lockRef.current();
        return;
      }
      lastActive = Date.now();
      arm();
    };
    const check = () => {
      if (document.visibilityState === 'hidden' || stale()) lockRef.current();
    };
    arm();
    for (const e of ACTIVITY) window.addEventListener(e, bump, true);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('pageshow', check);
    window.addEventListener('focus', check);
    return () => {
      clearTimeout(id);
      for (const e of ACTIVITY) window.removeEventListener(e, bump, true);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('pageshow', check);
      window.removeEventListener('focus', check);
    };
  }, [active]);
}

function ParentInner({ store, reload }: { store: Store; reload: () => void }) {
  // Unlocked state lives only here: leaving the route unmounts it, so the corner is locked again.
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });

  const enterGate = async () => {
    try {
      const settings = await store.getSettings();
      setPhase({ kind: 'gate', start: settings.pinHash && settings.pinSalt ? 'login' : 'arith', settings });
    } catch {
      setPhase({ kind: 'failed' });
    }
  };
  useEffect(() => void enterGate(), [store]);
  useIdleLock(phase.kind === 'open', () => void enterGate());

  if (phase.kind === 'loading') return <main class="parent parent-gate"><p class="gate-text" role="status">{vi.loading}</p></main>;
  if (phase.kind === 'failed') return <NoStore />;
  if (phase.kind === 'gate') {
    return (
      <PinGate
        key={phase.start}
        store={store}
        settings={phase.settings}
        start={phase.start}
        onUnlocked={() => setPhase({ kind: 'open' })}
        onExit={goVillage}
      />
    );
  }
  return <Dashboard store={store} onExit={goVillage} reloadApp={reload} />;
}

export function Parent({ reload = () => window.location.reload() }: { reload?: () => void } = {}) {
  const { store, degraded, fallback } = useStore();
  if (store && !fallback) return <ParentInner store={store} reload={reload} />;
  if (degraded) return <NoStore />;
  return (
    <main class="parent parent-gate">
      <p class="gate-text" role="status">
        {vi.loading}
      </p>
    </main>
  );
}
