import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { backupFileName } from '../src/domain/backup-file';
import { openStore, type Store } from '../src/store/store';
import { vi as t } from '../src/ui/parent-strings';
import { rehydratePinGuard, resetPinGuard } from '../src/ui/pin-gate';
import { file, mountParent, msg, press, seedPin, unlockUi, upload } from './parent-helpers';

beforeAll(() => {
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
});

let n = 0;
let store: Store;
let name = '';
beforeEach(async () => {
  name = `parent-fix-${++n}`;
  store = await openStore(name);
  resetPinGuard();
  window.location.hash = '#/parent';
  vi.stubGlobal('fetch', async () => new Response('', { status: 404 }));
});
afterEach(() => {
  cleanup();
  store.close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = '';
});

const dotsEmpty = () => expect(screen.getByTestId('pad-dots').getAttribute('aria-label')).toBe(t.keypad.dots(0, 4));
async function failPin(times: number) {
  for (let i = 0; i < times; i++) {
    press('9999');
    await waitFor(dotsEmpty);
  }
}
async function reload() {
  cleanup();
  store = await openStore(name);
  rehydratePinGuard(); // like a page reload: only localStorage remains
}

describe('lock persistence across reloads', () => {
  it('a lock survives a reload; a correct PIN is still rejected', async () => {
    await seedPin(store);
    mountParent(store);
    await screen.findByTestId('parent-gate');
    await failPin(5);
    await waitFor(() => expect(msg()).toMatch(/giây/));
    await reload();
    mountParent(store);
    await screen.findByTestId('parent-gate');
    expect(msg()).toMatch(/giây/);
    press('1234');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    expect(screen.queryByTestId('parent-dash')).toBeNull();
  });

  it('failures persist across reloads: 3 + 2 lock', async () => {
    await seedPin(store);
    mountParent(store);
    await screen.findByTestId('parent-gate');
    await failPin(3);
    await reload();
    mountParent(store);
    await screen.findByTestId('parent-gate');
    expect(msg()).toBe('');
    await failPin(2);
    await waitFor(() => expect(msg()).toMatch(/giây/));
  });

  it('a corrupted stored guard is ignored', async () => {
    await seedPin(store);
    localStorage.setItem('village-english.pinGuard', '{not json');
    rehydratePinGuard();
    mountParent(store);
    await unlockUi();
  });
});

describe('live region announces coarsely', () => {
  it('the number counts down in an aria-hidden element; the status text only changes at lock and unlock', async () => {
    await seedPin(store);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mountParent(store);
    await screen.findByTestId('parent-gate');
    await failPin(5);
    await waitFor(() => expect(screen.getByTestId('gate-live').textContent).toBe(t.login.lockedAnnounce));
    const visible0 = msg();
    expect(screen.getByTestId('gate-msg').getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByTestId('gate-live').getAttribute('role')).toBe('status');
    await act(async () => void vi.advanceTimersByTime(20_000));
    expect(msg()).not.toBe(visible0);
    expect(screen.getByTestId('gate-live').textContent).toBe(t.login.lockedAnnounce);
    await act(async () => void vi.advanceTimersByTime(45_000));
    expect(screen.getByTestId('gate-live').textContent).toBe(t.login.unlockedAgain);
  });
});

describe('idle lock when the app was suspended', () => {
  const open = async () => {
    await seedPin(store);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mountParent(store);
    await unlockUi();
  };
  it('locks when the page becomes hidden', async () => {
    await open();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await act(async () => void document.dispatchEvent(new Event('visibilitychange')));
    await screen.findByTestId('parent-gate');
    expect(screen.queryByTestId('parent-dash')).toBeNull();
  });
  it.each(['pageshow', 'focus'])('locks on %s when the last activity is older than 5 minutes (timer was frozen)', async (ev) => {
    await open();
    vi.setSystemTime(Date.now() + 6 * 60_000);
    await act(async () => void window.dispatchEvent(new Event(ev)));
    await screen.findByTestId('parent-gate');
  });
  it('locks when the clock went backwards', async () => {
    await open();
    vi.setSystemTime(Date.now() - 3_600_000);
    await act(async () => void window.dispatchEvent(new Event('focus')));
    await screen.findByTestId('parent-gate');
  });
  it('recent activity keeps it open on return', async () => {
    await open();
    vi.setSystemTime(Date.now() + 60_000);
    await act(async () => void window.dispatchEvent(new Event('focus')));
    expect(screen.queryByTestId('parent-dash')).not.toBeNull();
  });
  it('a re-render of the dashboard does not restart the idle timer', async () => {
    await open();
    await act(async () => void vi.advanceTimersByTime(4 * 60_000));
    fireEvent.click(screen.getByTestId('limit-up'));
    await waitFor(async () => expect((await store.getSettings()).dailyLimitSeconds).toBe(35 * 60));
    await act(async () => void vi.advanceTimersByTime(61_000));
    await screen.findByTestId('parent-gate');
  });
});

describe('Dialog is a real modal', () => {
  const openReset = async () => {
    await seedPin(store);
    mountParent(store);
    await unlockUi();
    const opener = screen.getByTestId('reset-today') as HTMLButtonElement;
    opener.focus();
    fireEvent.click(opener);
    return { opener, dlg: await screen.findByTestId('dialog-reset') };
  };
  it('moves focus in, makes the background inert, and restores focus on close', async () => {
    const { opener } = await openReset();
    expect(document.activeElement).toBe(screen.getByTestId('dialog-cancel'));
    expect(screen.getByTestId('sec-week').hasAttribute('inert')).toBe(true);
    expect(screen.getByTestId('dialog-reset').closest('[inert]')).toBeNull();
    fireEvent.click(screen.getByTestId('dialog-cancel'));
    expect(screen.getByTestId('sec-week').hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(opener);
  });
  it('Escape cancels without confirming', async () => {
    const spy = vi.spyOn(store, 'resetDay');
    const { dlg } = await openReset();
    fireEvent.keyDown(dlg, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
  it('Tab and Shift+Tab are trapped inside', async () => {
    const { dlg } = await openReset();
    const cancel = screen.getByTestId('dialog-cancel');
    const confirm = screen.getByTestId('dialog-confirm');
    confirm.focus();
    fireEvent.keyDown(dlg, { key: 'Tab' });
    expect(document.activeElement).toBe(cancel);
    fireEvent.keyDown(dlg, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(confirm);
  });
});

describe('restore dialog and pre-check', () => {
  const backupJson = async () => JSON.stringify(await store.exportAll());

  it('a wrong-shape file is rejected with a Vietnamese error and no dialog', async () => {
    await seedPin(store);
    await store.addBells(5);
    mountParent(store);
    await unlockUi();
    const bad = { ...JSON.parse(await backupJson()), progress: 'oops' };
    upload('import-file', file(JSON.stringify(bad)));
    await waitFor(() => expect(screen.getByTestId('import-error').textContent).toBe(t.backup.errInvalid('progress')));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await store.getBells()).toBe(5);
  });

  it('{"version":2} is rejected before the confirm', async () => {
    await seedPin(store);
    mountParent(store);
    await unlockUi();
    upload('import-file', file('{"version":2}'));
    await waitFor(() => expect(screen.getByTestId('import-error').textContent).toBe(t.backup.errInvalid('unsupported version')));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the confirm says ALL data and the PIN are replaced, and what happens to the PIN', async () => {
    await seedPin(store);
    mountParent(store);
    await unlockUi();
    const noPin = JSON.parse(await backupJson());
    delete noPin.settings.pinHash;
    delete noPin.settings.pinSalt;
    upload('import-file', file(JSON.stringify(noPin)));
    const dlg = await screen.findByTestId('dialog-restore');
    expect(dlg.textContent).toContain(t.backup.restoreAll);
    expect(screen.getByTestId('restore-pin-note').textContent).toBe(t.backup.pinNone);
    fireEvent.click(screen.getByTestId('dialog-cancel'));
    upload('import-file', file(await backupJson()));
    await screen.findByTestId('dialog-restore');
    expect(screen.getByTestId('restore-pin-note').textContent).toBe(t.backup.pinFromFile);
  });
});

describe('share sheet', () => {
  const stubNav = (share: unknown, canShare: unknown) =>
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { share, canShare }));

  it('is hidden when the browser cannot share files', async () => {
    await seedPin(store);
    stubNav(undefined, undefined);
    mountParent(store);
    await unlockUi();
    expect(screen.queryByTestId('share')).toBeNull();
  });

  it('is hidden when canShare says no', async () => {
    await seedPin(store);
    stubNav(vi.fn(), () => false);
    mountParent(store);
    await unlockUi();
    expect(screen.queryByTestId('share')).toBeNull();
  });

  it('shares the backup as a json File', async () => {
    await seedPin(store);
    const share = vi.fn(async () => {});
    stubNav(share, () => true);
    mountParent(store);
    await unlockUi();
    fireEvent.click(screen.getByTestId('share'));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const f = (share.mock.calls[0] as unknown as [{ files: File[] }])[0].files[0];
    expect(f.name).toBe(backupFileName(new Date()));
    expect(f.type).toBe('application/json');
    expect(JSON.parse(await f.text()).version).toBe(1);
    await waitFor(() => expect(screen.getByTestId('flash').textContent).toBe(t.backup.shared));
  });

  it('AbortError (user cancelled) stays silent; another error shows a message', async () => {
    await seedPin(store);
    const share = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'AbortError' }))
      .mockRejectedValueOnce(new Error('boom'));
    stubNav(share, () => true);
    mountParent(store);
    await unlockUi();
    fireEvent.click(screen.getByTestId('share'));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect((screen.getByTestId('flash') as HTMLElement).hidden).toBe(true);
    fireEvent.click(screen.getByTestId('share'));
    await waitFor(() => expect(screen.getByTestId('flash').textContent).toBe(t.backup.shareFailed));
  });
});

describe('copy', () => {
  it('the today line reads "Đã chơi 10/30 phút"', () => {
    expect(t.today.played(10, 30)).toBe('Đã chơi 10/30 phút');
  });
  it('the recovery screen warns that a backup file is a skeleton key', async () => {
    await seedPin(store);
    mountParent(store);
    await screen.findByTestId('parent-gate');
    fireEvent.click(screen.getByTestId('forgot-pin'));
    expect(screen.getByText(t.recover.privacy)).toBeTruthy();
  });
});
