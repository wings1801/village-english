# PWA update policy

- `registerType: 'prompt'` in `vite.config.ts`: the generated service worker does NOT call `skipWaiting()`/`clientsClaim()`.
- `src/main.tsx` registers the worker but never calls `updateSW(true)` and shows no update prompt to the child.
- A new version downloads in the background and stays "waiting" while the app is open.
- It activates on the next launch, after the app has been fully closed (iPad: swipe the app away).
- Reason: an activating worker replaces the precache and deletes old hashed chunks, which could break a lazy-loaded
  chunk (e.g. credits data) requested by a running session.
- The very first install still works offline after one reload (e2e checks `serviceWorker.controller`).
- Registration failures are logged with `console.warn` only.
