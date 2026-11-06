import { webcrypto } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { generateSalt, hashPin, PinGuard, verifyPin } from '../src/domain/pin';

beforeAll(() => {
  // jsdom may not expose WebCrypto; fall back to Node's implementation.
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  }
});

describe('hashPin / verifyPin', () => {
  const s = 'salt-one';

  it('verifies the right pin and rejects a wrong one', async () => {
    const h = await hashPin('1234', s);
    expect(await verifyPin('1234', s, h)).toBe(true);
    expect(await verifyPin('1235', s, h)).toBe(false);
  });

  it('produces 64-char hex and differs per salt', async () => {
    const a = await hashPin('1234', 'salt-a');
    const b = await hashPin('1234', 'salt-b');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it.each(['123', '12345', 'abcd', '１２３４'])('hashPin rejects %s', async (pin) => {
    await expect(hashPin(pin, s)).rejects.toThrow(Error);
  });

  it('verifyPin returns false for a malformed pin', async () => {
    const h = await hashPin('1234', s);
    expect(await verifyPin('12', s, h)).toBe(false);
    expect(await verifyPin('１２３４', s, h)).toBe(false);
  });
});

describe('generateSalt', () => {
  it('returns 32 hex chars and differs between calls', () => {
    const a = generateSalt();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(generateSalt()).not.toBe(a);
  });
});

describe('PinGuard', () => {
  it('is unlocked initially', () => {
    const g = new PinGuard(() => 0);
    expect(g.isLocked()).toBe(false);
    expect(g.lockedUntil()).toBe(0);
  });

  it('locks after 5 failures and unlocks after 60 001 ms', () => {
    let t = 1000;
    const g = new PinGuard(() => t);
    for (let i = 0; i < 4; i++) g.attempt(false);
    expect(g.isLocked()).toBe(false);
    g.attempt(false);
    expect(g.isLocked()).toBe(true);
    expect(g.lockedUntil()).toBe(61000);
    t += 60001;
    expect(g.isLocked()).toBe(false);
  });

  it('a success after 4 failures resets the count', () => {
    const g = new PinGuard(() => 0);
    for (let i = 0; i < 4; i++) g.attempt(false);
    g.attempt(true);
    for (let i = 0; i < 4; i++) g.attempt(false);
    expect(g.isLocked()).toBe(false);
  });

  it('does not extend the lock while locked, and restarts count after expiry', () => {
    let t = 0;
    const g = new PinGuard(() => t);
    for (let i = 0; i < 5; i++) g.attempt(false);
    t = 30000;
    g.attempt(false);
    expect(g.lockedUntil()).toBe(60000);
    t = 60001;
    for (let i = 0; i < 4; i++) g.attempt(false);
    expect(g.isLocked()).toBe(false);
  });
});

describe('PinGuard persistence', () => {
  const mkStorage = () => {
    let v: unknown = null;
    return {
      load: () => v,
      save: (s: unknown) => void (v = s === null ? null : JSON.parse(JSON.stringify(s))),
      peek: () => v,
      poke: (x: unknown) => void (v = x),
    };
  };
  const fail = (g: PinGuard, n: number) => {
    for (let i = 0; i < n; i++) g.attempt(false);
  };

  it('a lock survives a "reload" (new guard over the same storage)', () => {
    let t = 1000;
    const st = mkStorage();
    fail(new PinGuard(() => t, st), 5);
    t += 10_000;
    const g2 = new PinGuard(() => t, st);
    expect(g2.isLocked()).toBe(true);
    g2.attempt(true); // ignored while locked
    expect(g2.isLocked()).toBe(true);
    t += 50_001;
    expect(g2.isLocked()).toBe(false);
  });

  it('failure counts persist across reloads: 3 + 2 failures lock', () => {
    const st = mkStorage();
    fail(new PinGuard(() => 0, st), 3);
    const g2 = new PinGuard(() => 0, st);
    expect(g2.isLocked()).toBe(false);
    fail(g2, 2);
    expect(g2.isLocked()).toBe(true);
  });

  it('a success clears the stored state', () => {
    const st = mkStorage();
    const g = new PinGuard(() => 0, st);
    fail(g, 3);
    expect(st.peek()).not.toBeNull();
    g.attempt(true);
    expect(st.peek()).toBeNull();
    fail(new PinGuard(() => 0, st), 4);
    expect(new PinGuard(() => 0, st).isLocked()).toBe(false); // counting restarted from zero
  });

  it('clock moved backwards: the lock is never shortened', () => {
    let t = 1_000_000;
    const st = mkStorage();
    fail(new PinGuard(() => t, st), 5);
    t = 10; // far in the past
    const g2 = new PinGuard(() => t, st);
    expect(g2.isLocked()).toBe(true);
    t += 59_000;
    expect(g2.isLocked()).toBe(true);
    t += 2_000;
    expect(g2.isLocked()).toBe(false);
  });

  it('clock moved backwards while running also keeps the lock', () => {
    let t = 500_000;
    const g = new PinGuard(() => t, mkStorage());
    fail(g, 5);
    t = 100_000;
    expect(g.isLocked()).toBe(true);
    expect(g.lockedUntil()).toBeLessThanOrEqual(t + 60_000);
  });

  it.each([[null], ['garbage'], [42], [{ failures: 'x' }], [{ failures: 2, lockedUntil: -1, lockedAt: 0 }], [{ failures: 99, lockedUntil: 1, lockedAt: 1 }]])(
    'ignores corrupted stored state %j',
    (bad) => {
      const st = mkStorage();
      st.poke(bad);
      expect(new PinGuard(() => 0, st).isLocked()).toBe(false);
    },
  );

  it('ignores storage that throws', () => {
    const boom = {
      load: () => {
        throw new Error('no');
      },
      save: () => {
        throw new Error('no');
      },
    };
    const g = new PinGuard(() => 0, boom);
    fail(g, 5);
    expect(g.isLocked()).toBe(true);
  });
});
