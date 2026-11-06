import { createContext, type ComponentChildren } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import { markDegraded } from './degraded';
import { createMemoryStore } from './memory-store';
import { openStore, type Store } from './store';

export interface StoreState {
  store: Store | null;
  /** Store opened and its health check reported ok. */
  healthy: boolean;
  /** Store failed to open, or health() reported a problem. The child UI stays silent; this is for diagnostics. */
  degraded: boolean;
  /** `store` is the in-memory stand-in (IndexedDB failed to open): progress lives only until the page closes. */
  fallback: boolean;
}

const INITIAL: StoreState = { store: null, healthy: false, degraded: false, fallback: false };
const StoreContext = createContext<StoreState>(INITIAL);

/**
 * Opens the IndexedDB store once and closes it on unmount. While opening, `store` is null and the UI
 * keeps rendering. If opening fails (IndexedDB unavailable, quota) every screen shares ONE in-memory
 * store instead (`fallback` true, `degraded` true, recorded for the parent screen), so bells earned in a
 * quest still show in the village and shop. Nothing here throws and nothing child-facing is shown;
 * failures are recorded via `degraded` and one console.warn.
 */
export function StoreProvider({
  children,
  open = () => openStore(),
}: {
  children: ComponentChildren;
  open?: () => Promise<Store>;
}) {
  const [state, setState] = useState<StoreState>(INITIAL);

  useEffect(() => {
    let alive = true;
    let opened: Store | null = null;
    (async () => {
      try {
        const store = await open();
        if (!alive) {
          store.close(); // unmounted while opening
          return;
        }
        opened = store;
        setState({ store, healthy: false, degraded: false, fallback: false });
        const h = await store.health().catch((e: unknown) => ({ ok: false, reason: String(e) }));
        if (!alive) return;
        if (!h.ok) console.warn('store degraded:', h.reason ?? 'health check failed');
        setState({ store, healthy: h.ok, degraded: !h.ok, fallback: false });
      } catch (e) {
        console.warn('store unavailable, using the in-memory fallback store:', e);
        if (!alive) return;
        markDegraded('IndexedDB unavailable: using the in-memory fallback store');
        opened = createMemoryStore();
        setState({ store: opened, healthy: false, degraded: true, fallback: true });
      }
    })();
    return () => {
      alive = false;
      opened?.close();
    };
  }, []);

  return <StoreContext.Provider value={state}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreState {
  return useContext(StoreContext);
}
