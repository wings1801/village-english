const ITERATIONS = 100_000;
const PIN_RE = /^\d{4}$/; // \d without the u/v flag matches ASCII digits only

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** 16 random bytes as 32 hex chars. */
export function generateSalt(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(16)));
}

/** PBKDF2-SHA256 (100000 iterations, 256-bit key) of a 4-digit PIN, hex encoded. Throws on a malformed PIN. */
export async function hashPin(pin: string, salt: string): Promise<string> {
  if (!PIN_RE.test(pin)) throw new Error('PIN must be exactly 4 digits');
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: ITERATIONS },
    key,
    256,
  );
  return toHex(new Uint8Array(bits));
}

/** Never throws: a malformed PIN simply fails verification. */
export async function verifyPin(pin: string, salt: string, hash: string): Promise<boolean> {
  if (!PIN_RE.test(pin)) return false;
  const actual = await hashPin(pin, salt);
  if (actual.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

const MAX_FAILURES = 5;
const LOCK_MS = 60_000;

/** What a guard persists so a reload cannot reset a lock. */
export interface GuardState {
  failures: number;
  /** Time the lock ends (0 = not locked). */
  lockedUntil: number;
  /** Time the lock started (0 = not locked). If the clock is earlier than this, it moved backwards. */
  lockedAt: number;
}

/** Storage adapter. Implementations must not throw; the guard also guards against it. */
export interface GuardStorage {
  load(): unknown;
  save(state: GuardState | null): void;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

function parseState(raw: unknown): GuardState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (!isNum(o.failures) || !Number.isInteger(o.failures) || !isNum(o.lockedUntil) || !isNum(o.lockedAt)) return null;
  if (o.failures > MAX_FAILURES) return null;
  return { failures: o.failures, lockedUntil: o.lockedUntil, lockedAt: o.lockedAt };
}

export class PinGuard {
  private failures = 0;
  private until = 0;
  private at = 0;

  constructor(
    private readonly now: () => number,
    private readonly storage?: GuardStorage,
  ) {
    let state: GuardState | null = null;
    try {
      state = parseState(storage?.load());
    } catch {
      state = null; // unreadable storage: start clean
    }
    if (state) {
      this.failures = state.failures;
      this.until = state.lockedUntil;
      this.at = state.lockedAt;
    }
  }

  private persist(): void {
    try {
      this.storage?.save(
        this.failures === 0 && this.until === 0 ? null : { failures: this.failures, lockedUntil: this.until, lockedAt: this.at },
      );
    } catch {
      /* persistence is best effort */
    }
  }

  /**
   * The clock moved backwards since the lock started: the lock must not be shortened, so it is
   * re-anchored to start now and last the full original length (at most LOCK_MS).
   */
  private reanchor(): void {
    const t = this.now();
    if (this.until !== 0 && t < this.at) {
      this.until = t + Math.min(LOCK_MS, Math.max(0, this.until - this.at));
      this.at = t;
      this.persist();
    }
  }

  attempt(ok: boolean): void {
    // While locked, attempts are ignored so the lock is never extended.
    if (this.isLocked()) return;
    // A previous lock has expired: start counting from zero again.
    if (this.until !== 0) {
      this.until = 0;
      this.at = 0;
      this.failures = 0;
    }
    if (ok) {
      this.failures = 0;
      this.persist();
      return;
    }
    this.failures += 1;
    if (this.failures >= MAX_FAILURES) {
      this.until = this.now() + LOCK_MS;
      this.at = this.now();
    }
    this.persist();
  }

  isLocked(): boolean {
    this.reanchor();
    return this.now() < this.until;
  }

  lockedUntil(): number {
    this.reanchor();
    return this.until;
  }
}
