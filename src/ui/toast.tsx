import { useEffect, useState } from 'preact/hooks';
import { useSpokenMessage } from './use-spoken';

type Listener = (msg: string | null) => void;
const listeners = new Set<Listener>();
let timer: ReturnType<typeof setTimeout> | undefined;

/** Shows a short, friendly message for a couple of seconds (rendered by <ToastHost />). */
export function showToast(msg: string, ms = 2600): void {
  listeners.forEach((l) => l(msg));
  clearTimeout(timer);
  timer = setTimeout(() => listeners.forEach((l) => l(null)), ms);
}

export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    listeners.add(setMsg);
    return () => {
      listeners.delete(setMsg);
      clearTimeout(timer);
    };
  }, []);
  useSpokenMessage(msg);
  if (!msg) return null;
  return (
    <div class="toast" role="status" aria-live="polite">
      {msg}
    </div>
  );
}
