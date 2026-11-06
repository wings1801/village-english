import { useEffect } from 'preact/hooks';
import { unlockAudio } from './audio/tts';
import type { Store } from './store/store';
import { StoreProvider } from './store/store-context';
import { Decorate } from './ui/decorate';
import { Credits } from './ui/credits';
import { Footer } from './ui/footer';
import { IslandMap } from './ui/island-map';
import { Parent } from './ui/parent';
import { Quest } from './ui/quest';
import { useRoute } from './ui/router';
import { Shop } from './ui/shop';
import { ToastHost } from './ui/toast';
import { Village } from './ui/village';
import { VoiceProbe } from './ui/voice-probe';

function Screen() {
  const route = useRoute();
  switch (route.name) {
    case 'credits':
      return (
        <div class="scroll-screen">
          <Credits />
        </div>
      );
    case 'probe':
      return (
        <div class="scroll-screen">
          <VoiceProbe />
        </div>
      );
    case 'map':
      return <IslandMap />;
    case 'quest':
      return <Quest key={route.villagerId} villagerId={route.villagerId} />;
    case 'shop':
      return <Shop />;
    case 'decorate':
      return <Decorate />;
    case 'parent':
      return <Parent />;
    default:
      return <Village />;
  }
}

/** The first tap or key press anywhere unlocks speech, so every screen can speak after that. */
export function useFirstGestureUnlock(): void {
  useEffect(() => {
    const unlock = () => {
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('keydown', unlock, true);
      unlockAudio();
    };
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('keydown', unlock, true);
    return () => {
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('keydown', unlock, true);
    };
  }, []);
}

export function App({ open }: { open?: () => Promise<Store> } = {}) {
  useFirstGestureUnlock();
  return (
    <StoreProvider open={open}>
      <Screen />
      <ToastHost />
      <AppFooter />
    </StoreProvider>
  );
}

/** The Credits link is on every screen. The decorate screen carries its own link in its top row instead. */
function AppFooter() {
  const route = useRoute();
  return route.name === 'decorate' ? null : <Footer />;
}
