import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { generateSalt, hashPin, PinGuard, verifyPin, type GuardStorage } from '../domain/pin';
import { stripPin } from '../domain/backup-file';
import type { Settings } from '../domain/types';
import type { Store } from '../store/store';
import { Keypad } from './parent-keypad';
import { applyBackup, parseForRestore, readFileText } from './parent-backup-io';
import { vi } from './parent-strings';

const MAX_ARITH_WRONG = 3;

const GUARD_KEY = 'village-english.pinGuard';

/** localStorage adapter: every access is guarded; unreadable or malformed data is ignored by PinGuard. */
const guardStorage: GuardStorage = {
  load() {
    try {
      const raw = localStorage.getItem(GUARD_KEY);
      return raw === null ? null : (JSON.parse(raw) as unknown);
    } catch {
      return null;
    }
  },
  save(state) {
    try {
      if (state === null) localStorage.removeItem(GUARD_KEY);
      else localStorage.setItem(GUARD_KEY, JSON.stringify(state));
    } catch {
      /* best effort */
    }
  },
};

/**
 * ONE guard for the whole app: every wrong-PIN attempt, wherever it is typed, counts toward the same
 * lock. Its state is persisted, so a reload cannot clear a lock. Built on first use.
 */
let guard: PinGuard | null = null;
export function getPinGuard(): PinGuard {
  return (guard ??= new PinGuard(() => Date.now(), guardStorage));
}
/** Test seam: forget the in-memory guard (like a page reload); the next use reads localStorage again. */
export function rehydratePinGuard(): void {
  guard = null;
}
/** Test seam: forget everything, including the persisted state. */
export function resetPinGuard(): void {
  guardStorage.save(null);
  guard = null;
}

const rand = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));

function Frame({ title, children, onBack }: { title: string; children: ComponentChildren; onBack?: () => void }) {
  return (
    <main class="parent parent-gate" data-testid="parent-gate">
      <div class="gate-card">
        <h1 class="gate-title">{title}</h1>
        {children}
        {onBack && (
          <button type="button" class="p-btn p-btn-soft" data-testid="gate-back" onClick={onBack}>
            {vi.backToVillage}
          </button>
        )}
      </div>
    </main>
  );
}

/** Asks for the current PIN. Wrong attempts and the 60 s lock go through the shared PinGuard. */
export function PinVerify({
  settings,
  prompt,
  onVerified,
  children,
}: {
  settings: Settings;
  prompt: string;
  onVerified: () => void;
  children?: ComponentChildren;
}) {
  const [value, setValue] = useState('');
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  const locked = getPinGuard().isLocked();
  const [lockSeen, setLockSeen] = useState(false);
  useEffect(() => {
    if (!locked) return;
    setLockSeen(true);
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [locked]);

  const submit = async (pin: string) => {
    // A success while locked is ignored by the guard, so never even verify then.
    if (getPinGuard().isLocked() || busy) {
      setValue('');
      return;
    }
    setBusy(true);
    let ok = false;
    try {
      ok = await verifyPin(pin, settings.pinSalt ?? '', settings.pinHash ?? '');
    } catch {
      ok = false;
    }
    if (!alive.current) return;
    setBusy(false);
    setValue('');
    if (getPinGuard().isLocked()) return;
    getPinGuard().attempt(ok);
    if (ok) onVerified();
    else {
      setLockSeen(false);
      setWrong(!getPinGuard().isLocked());
    }
  };

  const secs = Math.max(1, Math.ceil((getPinGuard().lockedUntil() - Date.now()) / 1000));
  // The visible text may count down every second; the live region only changes when the state changes.
  const visible = locked ? vi.login.locked(secs) : wrong ? vi.login.wrong : lockSeen ? vi.login.unlockedAgain : '';
  const spoken = locked ? vi.login.lockedAnnounce : visible;
  return (
    <div class="verify">
      <p class="gate-prompt">{prompt}</p>
      <Keypad value={value} onChange={setValue} maxLength={4} mask onSubmit={(p) => void submit(p)} disabled={locked || busy} />
      <p class="gate-msg">
        <span class="visually-hidden" role="status" data-testid="gate-live">
          {spoken}
        </span>
        <span aria-hidden="true" data-testid="gate-msg">
          {visible}
        </span>
      </p>
      {children}
    </div>
  );
}

/** New PIN twice, then hash and store it next to the other settings. */
export function CreatePin({ store, onSaved, notice }: { store: Store; onSaved: () => void; notice?: string }) {
  const [first, setFirst] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (pin: string) => {
    if (first === null) {
      setFirst(pin);
      setValue('');
      setMsg(null);
      return;
    }
    if (pin !== first) {
      setFirst(null);
      setValue('');
      setMsg(vi.create.mismatch);
      return;
    }
    setBusy(true);
    try {
      const salt = generateSalt();
      const pinHash = await hashPin(pin, salt);
      const cur = await store.getSettings(); // never overwrite the other settings
      await store.putSettings({ ...cur, pinHash, pinSalt: salt });
      onSaved();
    } catch {
      setFirst(null);
      setValue('');
      setMsg(vi.create.saveFailed);
      setBusy(false);
    }
  };

  return (
    <div class="verify">
      {notice && <p class="gate-note">{notice}</p>}
      <p class="gate-prompt" data-testid="create-prompt">
        {first === null ? vi.create.enterNew : vi.create.enterAgain}
      </p>
      <Keypad value={value} onChange={setValue} maxLength={4} mask onSubmit={(p) => void submit(p)} disabled={busy} />
      <p class="gate-msg" role="status" data-testid="gate-msg">
        {msg ?? vi.create.hint}
      </p>
    </div>
  );
}

function ArithCheck({ onPass, onFail }: { onPass: () => void; onFail: () => void }) {
  const next = () => ({ a: rand(12, 19), b: rand(3, 9) });
  const [q, setQ] = useState(next);
  const [value, setValue] = useState('');
  const [wrongs, setWrongs] = useState(0);
  const submit = (v: string) => {
    if (Number(v) === q.a * q.b) {
      onPass();
      return;
    }
    const w = wrongs + 1;
    setWrongs(w);
    setValue('');
    if (w >= MAX_ARITH_WRONG) onFail();
    else setQ(next());
  };
  return (
    <div class="verify">
      <p class="gate-prompt" data-testid="arith-question">
        {vi.arith.question(q.a, q.b)}
      </p>
      <Keypad value={value} onChange={setValue} maxLength={3} onSubmit={submit} />
      <p class="gate-msg" role="status" data-testid="gate-msg">
        {wrongs > 0 ? vi.arith.wrong : ''}
      </p>
    </div>
  );
}

function Recover({ store, onRecovered, onBack }: { store: Store; onRecovered: () => void; onBack: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const onFile = async (e: Event) => {
    const el = e.currentTarget as HTMLInputElement;
    const file = el.files?.[0];
    el.value = ''; // the same file can be chosen again
    if (!file) return;
    setBusy(true);
    setError(null);
    const parsed = parseForRestore(await readFileText(file));
    if (!parsed.ok) {
      setError(parsed.message);
      setBusy(false);
      return;
    }
    // The file proves authority: its PIN is dropped, then a new one is created.
    const applied = await applyBackup(store, stripPin(parsed.value));
    if (!applied.ok) {
      setError(applied.message);
      setBusy(false);
      return;
    }
    onRecovered();
  };

  return (
    <div class="verify">
      <p class="gate-text">{vi.recover.explain}</p>
      <p class="gate-text">{vi.recover.needFile}</p>
      <p class="gate-text">{vi.recover.privacy}</p>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        class="visually-hidden"
        data-testid="recover-file"
        tabIndex={-1}
        onChange={(e) => void onFile(e)}
      />
      <button type="button" class="p-btn p-btn-primary" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? vi.recover.working : vi.recover.pick}
      </button>
      <p class="gate-msg" role="alert" data-testid="gate-error">
        {error ?? ''}
      </p>
      <button type="button" class="p-btn p-btn-soft" onClick={onBack}>
        {vi.recover.back}
      </button>
    </div>
  );
}

type Mode = 'login' | 'arith' | 'create' | 'recover';

export function PinGate({
  store,
  settings,
  start,
  onUnlocked,
  onExit,
}: {
  store: Store;
  settings: Settings;
  start: 'login' | 'arith';
  onUnlocked: () => void;
  onExit: () => void;
}) {
  const [mode, setMode] = useState<Mode>(start);
  const [recovered, setRecovered] = useState(false);

  if (mode === 'login') {
    return (
      <Frame title={vi.login.title} onBack={onExit}>
        <PinVerify settings={settings} prompt={vi.login.prompt} onVerified={onUnlocked}>
          <button type="button" class="p-link" data-testid="forgot-pin" onClick={() => setMode('recover')}>
            {vi.login.forgot}
          </button>
        </PinVerify>
      </Frame>
    );
  }
  if (mode === 'recover') {
    return (
      <Frame title={vi.recover.title}>
        <Recover
          store={store}
          onRecovered={() => {
            setRecovered(true);
            setMode('create'); // the arithmetic check is skipped: the backup file proved authority
          }}
          onBack={() => setMode('login')}
        />
      </Frame>
    );
  }
  if (mode === 'arith') {
    return (
      <Frame title={vi.arith.title} onBack={onExit}>
        <ArithCheck onPass={() => setMode('create')} onFail={onExit} />
      </Frame>
    );
  }
  return (
    <Frame title={vi.create.title} onBack={recovered ? undefined : onExit}>
      <CreatePin store={store} onSaved={onUnlocked} notice={recovered ? vi.recover.done : undefined} />
    </Frame>
  );
}
