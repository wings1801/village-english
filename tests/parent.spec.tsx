import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { backupFileName } from '../src/domain/backup-file';
import { dateKey } from '../src/domain/daily-limit';
import { generateSalt, hashPin, verifyPin } from '../src/domain/pin';
import { markDegraded, resetDegraded } from '../src/store/degraded';
import { openStore, type Store } from '../src/store/store';
import { StoreProvider } from '../src/store/store-context';
import { Keypad } from '../src/ui/parent-keypad';
import { Parent } from '../src/ui/parent';
import { vi as t } from '../src/ui/parent-strings';
import { resetPinGuard } from '../src/ui/pin-gate';

beforeAll(() => {
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
});

const fixture5 = readFileSync('tests/fixtures/content-5.json', 'utf8');
const WORD_GRADES = { apple: '5', dog: '5', cat: '5', ability: '4', accept: '4', zebra: '4' };

let n = 0;
let store: Store;
beforeEach(async () => {
  store = await openStore(`parent-test-${++n}`);
  resetPinGuard();
  window.location.hash = '#/parent';
  vi.stubGlobal('fetch', async (url: string) => {
    if (url.endsWith('content/5.json')) return new Response(fixture5, { status: 200 });
    if (url.endsWith('word-grades.json')) return new Response(JSON.stringify(WORD_GRADES), { status: 200 });
    return new Response('', { status: 404 });
  });
});
afterEach(() => {
  cleanup();
  store.close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetDegraded();
  window.location.hash = '';
});

const mount = (ui: preact.ComponentChildren = <Parent reload={() => {}} />, s: Store | null = store) =>
  render(<StoreProvider open={() => (s ? Promise.resolve(s) : Promise.reject(new Error('no idb')))}>{ui}</StoreProvider>);

const press = (digits: string) => {
  for (const d of digits) fireEvent.click(document.querySelector(`[data-digit="${d}"]`)!);
};
const msg = () => screen.getByTestId('gate-msg').textContent ?? '';
const seedPin = async (pin = '1234', extra: Record<string, unknown> = {}) => {
  const salt = generateSalt();
  const cur = await store.getSettings();
  await store.putSettings({ ...cur, pinHash: await hashPin(pin, salt), pinSalt: salt, ...extra });
};
const unlock = async (pin = '1234') => {
  await screen.findByTestId('parent-gate');
  press(pin);
  await screen.findByTestId('parent-dash');
  await screen.findByTestId('sec-backup');
};
const solveArith = () => {
  const m = /(\d+) × (\d+)/.exec(screen.getByTestId('arith-question').textContent!)!;
  return Number(m[1]) * Number(m[2]);
};
const answer = (v: number) => {
  press(String(v));
  fireEvent.click(screen.getByTestId('pad-enter'));
};
const file = (text: string, name = 'b.json') => new File([text], name, { type: 'application/json' });
const upload = (testid: string, f: File) => fireEvent.change(screen.getByTestId(testid), { target: { files: [f] } });

async function backupText(over: Record<string, unknown> = {}, settings: Record<string, unknown> = {}) {
  const b = await store.exportAll();
  return JSON.stringify({ ...b, ...over, settings: { ...b.settings, ...settings } });
}

describe('Keypad', () => {
  function Host({ mask }: { mask?: boolean }) {
    const [v, setV] = useState('');
    return <Keypad value={v} onChange={setV} maxLength={4} mask={mask} onSubmit={() => {}} />;
  }
  it('enters digits, backspaces, shows 4 dots and labelled keys', () => {
    render(<Host mask />);
    expect(document.querySelectorAll('.pad-dot')).toHaveLength(4);
    expect(screen.getAllByTestId('pad-key')).toHaveLength(10);
    expect(screen.getByLabelText(t.keypad.digit('7'))).toBeTruthy();
    expect(screen.getByLabelText(t.keypad.backspace)).toBeTruthy();
    press('12');
    expect(document.querySelectorAll('[data-filled="1"]')).toHaveLength(2);
    expect(screen.getByTestId('pad-dots').getAttribute('aria-label')).toBe(t.keypad.dots(2, 4));
    fireEvent.click(screen.getByTestId('pad-back'));
    expect(document.querySelectorAll('[data-filled="1"]')).toHaveLength(1);
    press('2345');
    expect(document.querySelectorAll('[data-filled="1"]')).toHaveLength(4); // capped at maxLength
  });
  it('unmasked mode shows the digits and has an OK key', () => {
    render(<Host />);
    press('42');
    expect(screen.getByTestId('pad-answer').textContent).toBe('42');
    expect(screen.getByLabelText(t.keypad.enter)).toBeTruthy();
  });
  it('submits a masked PIN on the fourth digit', () => {
    const onSubmit = vi.fn();
    function H() {
      const [v, setV] = useState('');
      return <Keypad value={v} onChange={setV} maxLength={4} mask onSubmit={onSubmit} />;
    }
    render(<H />);
    press('123');
    expect(onSubmit).not.toHaveBeenCalled();
    press('4');
    expect(onSubmit).toHaveBeenCalledWith('1234');
  });
});

describe('first run: arithmetic check and PIN creation', () => {
  it('wrong answer asks again; right answer leads to PIN creation; mismatch retries; match opens the dashboard', async () => {
    mount();
    await screen.findByTestId('arith-question');
    answer(solveArith() + 1);
    expect(msg()).toBe(t.arith.wrong);
    answer(solveArith());
    expect((await screen.findByTestId('create-prompt')).textContent).toBe(t.create.enterNew);
    press('1234');
    expect(screen.getByTestId('create-prompt').textContent).toBe(t.create.enterAgain);
    press('1235');
    expect(msg()).toBe(t.create.mismatch);
    expect(screen.getByTestId('create-prompt').textContent).toBe(t.create.enterNew);
    press('1234');
    press('1234');
    await screen.findByTestId('parent-dash');
    const s = await store.getSettings();
    expect(s.pinHash).toMatch(/^[0-9a-f]{64}$/);
    expect(s.pinHash).not.toContain('1234');
    expect(JSON.stringify(s)).not.toContain('"1234"');
    expect(await verifyPin('1234', s.pinSalt!, s.pinHash!)).toBe(true);
    expect(s.dailyLimitSeconds).toBe(1800); // other settings survive
  });

  it('three wrong answers send the child back to the village', async () => {
    mount();
    await screen.findByTestId('arith-question');
    for (let i = 0; i < 3; i++) answer(solveArith() + 1);
    expect(window.location.hash).toBe('#/');
    expect((await store.getSettings()).pinHash).toBeUndefined();
  });

  it('the questions are randomised from two operand ranges', async () => {
    const rnd = vi.spyOn(Math, 'random');
    rnd.mockReturnValue(0);
    const lo = render(<StoreProvider open={() => Promise.resolve(store)}><Parent /></StoreProvider>);
    expect((await screen.findByTestId('arith-question')).textContent).toContain('12 × 3');
    lo.unmount();
    store = await openStore(`parent-test-${++n}`);
    rnd.mockReturnValue(0.9999);
    render(<StoreProvider open={() => Promise.resolve(store)}><Parent /></StoreProvider>);
    expect((await screen.findByTestId('arith-question')).textContent).toContain('19 × 9');
  });
});

describe('lock screen', () => {
  it('wrong PIN x5 locks for 60 s, a correct PIN during the lock is rejected, then it works', async () => {
    await seedPin('1234');
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mount();
    await screen.findByTestId('parent-gate');
    for (let i = 1; i <= 5; i++) {
      press('9999');
      await waitFor(() => expect(screen.getByTestId('pad-dots').getAttribute('aria-label')).toBe(t.keypad.dots(0, 4)));
      if (i < 5) expect(msg()).toBe(t.login.wrong);
    }
    await waitFor(() => expect(msg()).toBe(t.login.locked(60)));
    // correct PIN while locked: the keys are dead and nothing unlocks
    press('1234');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    expect(screen.queryByTestId('parent-dash')).toBeNull();
    expect(msg()).toMatch(/\d+ giây/);
    // countdown
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(Number(/(\d+) giây/.exec(msg())![1])).toBeLessThanOrEqual(30);
    expect((screen.getAllByTestId('pad-key')[0] as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(31_000);
    });
    expect(msg()).toBe(t.login.unlockedAgain);
    press('1234');
    await screen.findByTestId('parent-dash');
  });

  it('a wrong guess does not unlock and shows the neutral message', async () => {
    await seedPin('1234');
    mount();
    await screen.findByTestId('parent-gate');
    press('0000');
    await waitFor(() => expect(msg()).toBe(t.login.wrong));
    expect(screen.queryByTestId('parent-dash')).toBeNull();
  });

  it('auto-locks after 5 minutes of inactivity; touches postpone it', async () => {
    await seedPin('1234');
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mount();
    await unlock();
    await act(async () => void vi.advanceTimersByTime(4 * 60_000));
    fireEvent.pointerDown(document.body);
    await act(async () => void vi.advanceTimersByTime(4 * 60_000));
    expect(screen.queryByTestId('parent-dash')).not.toBeNull();
    await act(async () => void vi.advanceTimersByTime(61_000));
    await screen.findByTestId('parent-gate');
    expect(screen.queryByTestId('parent-dash')).toBeNull();
    expect(screen.getByText(t.login.title)).toBeTruthy();
  });

  it('leaving the route locks again', async () => {
    await seedPin('1234');
    function Host() {
      const [on, setOn] = useState(true);
      return (
        <>
          <button type="button" data-testid="toggle" onClick={() => setOn((v) => !v)} />
          {on && <Parent />}
        </>
      );
    }
    mount(<Host />);
    await unlock();
    fireEvent.click(screen.getByTestId('toggle'));
    expect(screen.queryByTestId('parent-dash')).toBeNull();
    fireEvent.click(screen.getByTestId('toggle'));
    await screen.findByTestId('parent-gate');
    expect(screen.queryByTestId('parent-dash')).toBeNull();
  });
});

describe('forgotten PIN recovery', () => {
  it('a valid backup clears the PIN, skips the arithmetic and asks for a new PIN', async () => {
    await seedPin('1234');
    await store.addBells(5);
    const text = await backupText({ bells: 77 }, { pinHash: 'x'.repeat(64), pinSalt: 'old', dailyLimitSeconds: 2400 });
    mount();
    await screen.findByTestId('parent-gate');
    fireEvent.click(screen.getByTestId('forgot-pin'));
    expect(screen.getByText(t.recover.explain)).toBeTruthy();
    upload('recover-file', file(text));
    expect((await screen.findByTestId('create-prompt')).textContent).toBe(t.create.enterNew);
    expect(screen.queryByTestId('arith-question')).toBeNull();
    const s = await store.getSettings();
    expect(s.pinHash).toBeUndefined();
    expect(s.pinSalt).toBeUndefined();
    expect(s.dailyLimitSeconds).toBe(2400);
    expect(await store.getBells()).toBe(77);
    press('4321');
    press('4321');
    await screen.findByTestId('parent-dash');
    const after = await store.getSettings();
    expect(await verifyPin('4321', after.pinSalt!, after.pinHash!)).toBe(true);
    expect(after.dailyLimitSeconds).toBe(2400);
  });

  it.each([
    ['{"version":2}', /unsupported version/],
    ['not json at all', new RegExp(t.backup.errNotJson)],
    ['   ', new RegExp(t.backup.errEmpty)],
  ])('an invalid file (%s) shows an error and changes nothing', async (text, re) => {
    await seedPin('1234');
    await store.addBells(5);
    const before = await store.getSettings();
    mount();
    await screen.findByTestId('parent-gate');
    fireEvent.click(screen.getByTestId('forgot-pin'));
    upload('recover-file', file(text));
    await waitFor(() => expect(screen.getByTestId('gate-error').textContent).toMatch(re));
    expect(screen.queryByTestId('create-prompt')).toBeNull();
    expect(await store.getBells()).toBe(5);
    expect(await store.getSettings()).toEqual(before);
  });
});

describe('dashboard sections', () => {
  const today = () => dateKey(new Date());
  const yesterday = () => dateKey(new Date(Date.now() - 86_400_000));

  it('shows today, a 7-day chart, weak words, progress, content counts with seeded data', async () => {
    await seedPin('1234', { dailyLimitSeconds: 1800 });
    await store.putDay({ dateKey: yesterday(), playSeconds: 1200 });
    await store.putDay({ dateKey: today(), playSeconds: 600 });
    const base = { dueDate: '2026-01-01' } as const;
    await store.putProgress({ wordId: 'apple', box: 5, seen: 4, wrong: 1, ...base });
    await store.putProgress({ wordId: 'dog', box: 1, seen: 4, wrong: 3, ...base });
    await store.putProgress({ wordId: 'ability', box: 2, seen: 2, wrong: 1, ...base });
    await store.putProgress({ wordId: 'cat', box: 1, seen: 1, wrong: 1, ...base }); // seen < 2: not weak
    mount();
    await unlock();

    expect(screen.getByTestId('today-text').textContent).toBe(t.today.played(10, 30));
    expect(screen.getByRole('progressbar', { name: t.today.barLabel(10, 30) })).toBeTruthy();

    const chart = screen.getByTestId('week-chart');
    expect(chart.getAttribute('role')).toBe('img');
    expect(chart.getAttribute('aria-label')).toContain('20 phút');
    expect(chart.getAttribute('aria-label')).toContain('10 phút');
    expect(chart.querySelectorAll('.chart-col')).toHaveLength(7);
    expect(chart.querySelector(`[data-date="${today()}"]`)!.getAttribute('data-minutes')).toBe('10');

    const weak = screen.getAllByTestId('weak-item');
    expect(weak.map((w) => w.textContent)).toEqual([
      `dog${t.weak.wrong(3, 4)}`,
      `ability${t.weak.wrong(1, 2)}`,
      `apple${t.weak.wrong(1, 4)}`,
    ]);

    const rows = screen.getAllByTestId('grade-row');
    expect(rows).toHaveLength(7);
    const g5 = rows.find((r) => r.getAttribute('data-grade') === '5')!;
    expect(g5.textContent).toContain(`${t.progress.total}: 3`);
    expect(g5.textContent).toContain(`${t.progress.seen}: 3`);
    expect(g5.textContent).toContain(`${t.progress.mastered}: 1`);
    const g4 = rows.find((r) => r.getAttribute('data-grade') === '4')!;
    expect(g4.textContent).toContain(`${t.progress.total}: 3`);
    expect(g4.textContent).toContain(`${t.progress.seen}: 1`);
    expect(rows.filter((r) => r.textContent!.includes(t.progress.soon))).toHaveLength(5);

    const q5 = (JSON.parse(fixture5) as unknown[]).length;
    const c = screen.getAllByTestId('content-row');
    expect(c[0].textContent).toContain(t.content.count(q5));
    expect(c[0].querySelector('[data-testid=content-none]')).toBeNull();
    expect(c[1].textContent).toContain(t.content.count(0));
    expect(c[1].querySelector('[data-testid=content-none]')!.textContent).toBe(t.content.none);
  });

  it.each([
    [29, 0],
    [30, 1],
    [89, 1],
    [90, 2],
  ])("today's minutes use the same rounding as the week chart (%i s -> %i min)", async (secs, mins) => {
    await seedPin('1234', { dailyLimitSeconds: 1800 });
    await store.putDay({ dateKey: today(), playSeconds: secs });
    mount();
    await unlock();
    expect(screen.getByTestId('today-text').textContent).toBe(t.today.played(mins, 30));
    expect(screen.getByTestId('week-chart').querySelector(`[data-date="${today()}"]`)!.getAttribute('data-minutes')).toBe(String(mins));
  });

  it('empty states on a fresh store', async () => {
    await seedPin('1234');
    vi.stubGlobal('fetch', async () => new Response('', { status: 404 }));
    mount();
    await unlock();
    expect(screen.getByTestId('weak-empty').textContent).toBe(t.weak.empty);
    expect(screen.getAllByTestId('content-none')).toHaveLength(2);
    expect(screen.getByTestId('today-text').textContent).toBe(t.today.played(0, 30));
    expect(screen.getByTestId('week-chart').querySelectorAll('[data-minutes="0"]')).toHaveLength(7);
  });

  it('reset-today asks first and calls resetDay only after confirming', async () => {
    await seedPin('1234');
    await store.putDay({ dateKey: today(), playSeconds: 900 });
    const spy = vi.spyOn(store, 'resetDay');
    mount();
    await unlock();
    expect(screen.getByTestId('today-text').textContent).toBe(t.today.played(15, 30));
    fireEvent.click(screen.getByTestId('reset-today'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('dialog-cancel'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('reset-today'));
    fireEvent.click(screen.getByTestId('dialog-confirm'));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(today()));
    await waitFor(() => expect(screen.getByTestId('today-text').textContent).toBe(t.today.played(0, 30)));
    expect((await store.getDay()).playSeconds).toBe(0);
  });

  it('settings: the limit steps by 5 within 10-90 and keeps pin / grade', async () => {
    await seedPin('1234', { currentGrade: '4' });
    const pinHash = (await store.getSettings()).pinHash;
    mount();
    await unlock();
    expect(screen.getByTestId('limit-value').textContent).toBe(t.settings.minutes(30));
    fireEvent.click(screen.getByTestId('limit-up'));
    fireEvent.click(screen.getByTestId('limit-up'));
    await waitFor(async () => expect((await store.getSettings()).dailyLimitSeconds).toBe(40 * 60));
    const s = await store.getSettings();
    expect(s.currentGrade).toBe('4');
    expect(s.pinHash).toBe(pinHash);
    fireEvent.click(screen.getByTestId('limit-down'));
    await waitFor(async () => expect((await store.getSettings()).dailyLimitSeconds).toBe(35 * 60));
  });

  it.each([
    [90, 'limit-up'],
    [10, 'limit-down'],
  ])('settings: a limit of %i minutes disables %s', async (minutes, testid) => {
    await seedPin('1234', { dailyLimitSeconds: minutes * 60 });
    mount();
    await unlock();
    expect((screen.getByTestId(testid) as HTMLButtonElement).disabled).toBe(true);
  });

  it('settings: choosing the grade saves currentGrade without touching limit or pin', async () => {
    await seedPin('1234', { dailyLimitSeconds: 45 * 60 });
    const pinHash = (await store.getSettings()).pinHash;
    mount();
    await unlock();
    const choices = screen.getAllByTestId('grade-choice');
    expect(choices.map((c) => c.getAttribute('data-grade'))).toEqual(['5', '4']);
    expect(choices[0].getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(choices[1]);
    await waitFor(async () => expect((await store.getSettings()).currentGrade).toBe('4'));
    const s = await store.getSettings();
    expect(s.dailyLimitSeconds).toBe(45 * 60);
    expect(s.pinHash).toBe(pinHash);
  });

  it('settings: change PIN needs the current PIN, then the new one twice; other settings survive', async () => {
    await seedPin('1234', { currentGrade: '4', dailyLimitSeconds: 50 * 60 });
    mount();
    await unlock();
    fireEvent.click(screen.getByTestId('change-pin'));
    const dlg = within(screen.getByTestId('dialog-pin'));
    expect(dlg.getByText(t.settings.currentPin)).toBeTruthy();
    press('0000');
    await waitFor(() => expect(msg()).toBe(t.login.wrong));
    press('1234');
    await waitFor(() => expect(screen.getByTestId('create-prompt')).toBeTruthy());
    press('4321');
    press('4321');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const s = await store.getSettings();
    expect(await verifyPin('4321', s.pinSalt!, s.pinHash!)).toBe(true);
    expect(await verifyPin('1234', s.pinSalt!, s.pinHash!)).toBe(false);
    expect(s.currentGrade).toBe('4');
    expect(s.dailyLimitSeconds).toBe(50 * 60);
  });

  it('the bottom button goes back to the village', async () => {
    await seedPin('1234');
    mount();
    await unlock();
    fireEvent.click(screen.getByTestId('lock'));
    expect(window.location.hash).toBe('#/');
  });
});

describe('backup and storage', () => {
  let blobs: Blob[];
  let downloads: string[];
  let revoke: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    blobs = [];
    downloads = [];
    revoke = vi.fn();
    URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
      blobs.push(b as Blob);
      return 'blob:test';
    });
    URL.revokeObjectURL = revoke as unknown as typeof URL.revokeObjectURL;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });
  });

  it('export downloads village-english-backup-YYYY-MM-DD.json with the full backup, then revokes the URL', async () => {
    await seedPin('1234');
    await store.addBells(12);
    mount();
    await unlock();
    fireEvent.click(screen.getByTestId('export'));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0]).toBe(backupFileName(new Date()));
    expect(downloads[0]).toMatch(/^village-english-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const parsed = JSON.parse(await blobs[0].text());
    expect(parsed.version).toBe(1);
    expect(parsed.bells).toBe(12);
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:test'), { timeout: 3000 });
    expect(document.querySelector('a[download]')).toBeNull(); // temporary link removed
  });

  it('import: confirm first ("data will be replaced"), then replace and reload', async () => {
    await seedPin('1234');
    await store.addBells(5);
    const text = await backupText({ bells: 99 });
    const reload = vi.fn();
    mount(<Parent reload={reload} />);
    await unlock();
    upload('import-file', file(text));
    const dlg = await screen.findByTestId('dialog-restore');
    expect(dlg.textContent).toContain(t.backup.restoreBody);
    expect(await store.getBells()).toBe(5);
    fireEvent.click(screen.getByTestId('dialog-cancel'));
    expect(await store.getBells()).toBe(5);
    expect(screen.queryByRole('dialog')).toBeNull();
    upload('import-file', file(text));
    await screen.findByTestId('dialog-restore');
    fireEvent.click(screen.getByTestId('dialog-confirm'));
    await waitFor(async () => expect(await store.getBells()).toBe(99));
    expect(screen.getAllByText(t.backup.restored).length).toBeGreaterThan(0);
    await waitFor(() => expect(reload).toHaveBeenCalled(), { timeout: 3000 });
  });

  it.each([
    ['nope', new RegExp(t.backup.errNotJson)],
    ['', new RegExp(t.backup.errEmpty)],
  ])('import of an unreadable file (%j) shows an error, no dialog, nothing changes', async (text, re) => {
    await seedPin('1234');
    await store.addBells(5);
    mount();
    await unlock();
    upload('import-file', file(text));
    await waitFor(() => expect(screen.getByTestId('import-error').textContent).toMatch(re));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await store.getBells()).toBe(5);
  });

  it('storage: ok state, and the persisted note', async () => {
    await seedPin('1234');
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { storage: { persisted: async () => true } }));
    mount();
    await unlock();
    expect(screen.getByTestId('storage-ok').textContent).toBe(t.storage.ok);
    expect(screen.queryByTestId('storage-warning')).toBeNull();
    expect(screen.getByTestId('storage-persisted').textContent).toBe(t.storage.persisted);
  });

  it('storage: not persisted is explained', async () => {
    await seedPin('1234');
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { storage: { persisted: async () => false } }));
    mount();
    await unlock();
    expect(screen.getByTestId('storage-persisted').textContent).toBe(t.storage.notPersisted);
  });

  it('storage: a failing health check shows a calm warning with a backup shortcut', async () => {
    await seedPin('1234');
    vi.spyOn(store, 'health').mockResolvedValue({ ok: false, reason: 'quota' });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount();
    await unlock();
    const w = await screen.findByTestId('storage-warning');
    expect(w.textContent).toContain('quota');
    fireEvent.click(within(w).getByTestId('export-warning'));
    await waitFor(() => expect(downloads).toHaveLength(1));
  });

  it('storage: a degraded page load shows the warning too', async () => {
    await seedPin('1234');
    markDegraded('open failed once');
    mount();
    await unlock();
    expect((await screen.findByTestId('storage-warning')).textContent).toContain('open failed once');
  });
});

describe('no usable store', () => {
  it('says data cannot be saved and offers no PIN keypad or backup', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount(<Parent />, null);
    expect(await screen.findByText(t.noStore.title)).toBeTruthy();
    expect(screen.getByText(t.noStore.body)).toBeTruthy();
    expect(screen.queryByTestId('pad-key')).toBeNull();
    expect(screen.queryByTestId('export')).toBeNull();
    expect(screen.getByText(t.backToVillage)).toBeTruthy();
  });
});
