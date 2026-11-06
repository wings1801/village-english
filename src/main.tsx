import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app';
import './styles.css';

render(<App />, document.getElementById('app')!);

// Update policy (see docs/pwa-update-policy.md): registerType is 'prompt' and we pass no
// onNeedRefresh / updateSW(true), so a newly downloaded service worker stays "waiting" and only
// takes over at the next app launch (all windows closed). No skipWaiting, no automatic reload,
// so a running session never loses chunks it still needs. Registration errors never reach the child.
try {
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    registerSW({
      immediate: true,
      onRegisterError: (e) => console.warn('service worker registration failed:', e),
    });
  }
} catch (e) {
  console.warn('service worker registration failed:', e);
}
