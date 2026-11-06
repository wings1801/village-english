import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DECOR } from '../src/assets/manifest';
import { dateKey } from '../src/domain/daily-limit';
import { PRICES } from '../src/domain/village';
import { openStore, type Store } from '../src/store/store';
import { StoreProvider } from '../src/store/store-context';
import { App } from '../src/app';
import { DailyStop } from '../src/ui/daily-stop';
import { Decorate } from '../src/ui/decorate';
import { Shop } from '../src/ui/shop';
import { Village } from '../src/ui/village';

let n = 0;
let store: Store;
beforeEach(async () => {
  store = await openStore(`shop-test-${++n}`);
});
afterEach(() => {
  cleanup();
  store.close();
  window.location.hash = '';
  vi.restoreAllMocks();
});

const mount = (ui: preact.ComponentChildren, s: Store | null = store) =>
  render(<StoreProvider open={() => (s ? Promise.resolve(s) : Promise.reject(new Error('no idb')))}>{ui}</StoreProvider>);

const itemRow = (id: string) => document.querySelector(`[data-testid=shop-item][data-decor-id=${id}]`)!;
const buyBtn = (id: string) => itemRow(id).querySelector('button')! as HTMLButtonElement;
const NO_LATIN = /[A-Za-z]/;

describe('Shop', () => {
  it('renders all 24 items with kana names, prices and a back button', async () => {
    mount(<Shop />);
    expect(await screen.findAllByTestId('shop-item')).toHaveLength(24);
    for (const d of DECOR) {
      const row = itemRow(d.id);
      expect(row.textContent).toContain(d.nameJa);
      expect(row.textContent).toContain(String(PRICES[d.id]));
      expect(buyBtn(d.id).textContent).toBe('かう');
    }
    expect(screen.getByText('もどる')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(NO_LATIN);
  });

  it('shows the bells from the store', async () => {
    await store.addBells(77);
    mount(<Shop />);
    await waitFor(() => expect(screen.getByTestId('bells').textContent).toBe('77'));
  });

  it('buying succeeds: bells drop, 「もっているよ」, confirmation, persisted', async () => {
    await store.addBells(100);
    mount(<Shop />);
    await waitFor(() => expect(screen.getByTestId('bells').textContent).toBe('100'));
    fireEvent.click(buyBtn('watering_can'));
    await waitFor(() => expect(screen.getByTestId('bells').textContent).toBe(String(100 - PRICES.watering_can)));
    expect(await screen.findByText('かったよ！')).toBeTruthy();
    expect(buyBtn('watering_can').textContent).toBe('もっているよ');
    expect(buyBtn('watering_can').disabled).toBe(true);
    expect(await store.getOwned()).toEqual(['watering_can']);
    expect(await store.getBells()).toBe(100 - PRICES.watering_can);
  });

  it('already-owned items load as owned', async () => {
    await store.addBells(100);
    await store.buyDecor('hay_bale', PRICES.hay_bale);
    mount(<Shop />);
    await waitFor(() => expect(buyBtn('hay_bale').textContent).toBe('もっているよ'));
    expect(buyBtn('hay_bale').disabled).toBe(true);
  });

  it('insufficient bells: dimmed, neutral message, no purchase', async () => {
    await store.addBells(10);
    mount(<Shop />);
    await waitFor(() => expect(screen.getByTestId('bells').textContent).toBe('10'));
    const b = buyBtn('fountain');
    expect(b.getAttribute('aria-disabled')).toBe('true');
    expect(b.className).toContain('shop-dim');
    fireEvent.click(b);
    expect(await screen.findByText('ベルが たりないよ')).toBeTruthy();
    expect(await store.getOwned()).toEqual([]);
    expect(await store.getBells()).toBe(10);
  });

  it('a double tap buys once', async () => {
    await store.addBells(500);
    const spy = vi.spyOn(store, 'buyDecor');
    mount(<Shop />);
    await waitFor(() => expect(screen.getByTestId('bells').textContent).toBe('500'));
    const b = buyBtn('campfire');
    fireEvent.click(b);
    fireEvent.click(b);
    await waitFor(() => expect(buyBtn('campfire').textContent).toBe('もっているよ'));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(await store.getBells()).toBe(500 - PRICES.campfire);
  });

  it('IndexedDB unavailable: renders from the shared in-memory fallback, friendly message, no throw', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount(<Shop />, null);
    expect(await screen.findAllByTestId('shop-item')).toHaveLength(24);
    fireEvent.click(buyBtn('watering_can'));
    expect(await screen.findByText('ベルが たりないよ')).toBeTruthy();
  });

  it('a failing buy shows the friendly message and warns once', async () => {
    await store.addBells(100);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(store, 'buyDecor').mockRejectedValue(new DOMException('full', 'QuotaExceededError'));
    mount(<Shop />);
    await waitFor(() => expect(screen.getByTestId('bells').textContent).toBe('100'));
    fireEvent.click(buyBtn('watering_can'));
    expect(await screen.findByText('いまは かえないよ')).toBeTruthy();
    fireEvent.click(buyBtn('watering_can'));
    await waitFor(() => expect(store.buyDecor).toHaveBeenCalledTimes(2));
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('a purchase never touches the day state', async () => {
    await store.addBells(60);
    const putDay = vi.spyOn(store, 'putDay');
    mount(<Shop />);
    await waitFor(() => expect(screen.getByTestId('bells').textContent).toBe('60'));
    fireEvent.click(buyBtn('watering_can'));
    await waitFor(() => expect(buyBtn('watering_can').textContent).toBe('もっているよ'));
    expect(putDay).not.toHaveBeenCalled();
  });
});

describe('Decorate', () => {
  const rect = { left: 100, top: 50, width: 1000, height: 500, right: 1100, bottom: 550, x: 100, y: 50, toJSON() {} };
  const stubRect = () => {
    const sceneEl = screen.getByTestId('decor-scene');
    sceneEl.getBoundingClientRect = () => rect as DOMRect;
    return sceneEl;
  };
  const trayItem = (id: string) => document.querySelector(`[data-testid=tray-item][data-decor-id=${id}]`)!;

  it('empty tray invites to the shop', async () => {
    mount(<Decorate />);
    expect(await screen.findByText('おみせで かざりを かおう')).toBeTruthy();
    fireEvent.click(screen.getByText('おみせ'));
    expect(window.location.hash).toBe('#/shop');
  });

  it('select from tray, tap the village: places with normalised coordinates and persists', async () => {
    await store.addBells(100);
    await store.buyDecor('fountain', 10);
    await store.buyDecor('campfire', 10);
    const put = vi.spyOn(store, 'putPlaced');
    mount(<Decorate />);
    await waitFor(() => expect(trayItem('fountain')).toBeTruthy());
    expect(screen.getAllByTestId('tray-item')).toHaveLength(2);
    const sceneEl = stubRect();
    fireEvent.click(trayItem('fountain'));
    expect(trayItem('fountain').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(sceneEl, { clientX: 600, clientY: 300 });
    await waitFor(() => expect(put).toHaveBeenCalledWith([{ decorId: 'fountain', x: 0.5, y: 0.5 }]));
    expect(screen.getAllByTestId('decor')).toHaveLength(1);
    expect(await store.getPlaced()).toEqual([{ decorId: 'fountain', x: 0.5, y: 0.5 }]);
    // tapping elsewhere moves the same item, clamped to 0..1
    fireEvent.click(sceneEl, { clientX: 5000, clientY: -300 });
    await waitFor(() => expect(put).toHaveBeenLastCalledWith([{ decorId: 'fountain', x: 1, y: 0 }]));
    expect(screen.getAllByTestId('decor')).toHaveLength(1);
  });

  it('tapping the village with nothing selected does nothing', async () => {
    await store.addBells(100);
    await store.buyDecor('fountain', 10);
    const put = vi.spyOn(store, 'putPlaced');
    mount(<Decorate />);
    await waitFor(() => expect(trayItem('fountain')).toBeTruthy());
    fireEvent.click(stubRect(), { clientX: 600, clientY: 300 });
    expect(put).not.toHaveBeenCalled();
  });

  it('select a placed item: しまう removes it', async () => {
    await store.addBells(100);
    await store.buyDecor('fountain', 10);
    await store.putPlaced([{ decorId: 'fountain', x: 0.3, y: 0.6 }]);
    mount(<Decorate />);
    await waitFor(() => expect(screen.getAllByTestId('decor')).toHaveLength(1));
    expect(screen.queryByText('しまう')).toBeNull();
    fireEvent.click(screen.getByTestId('decor'));
    fireEvent.click(screen.getByText('しまう'));
    await waitFor(() => expect(screen.queryAllByTestId('decor')).toHaveLength(0));
    expect(await store.getPlaced()).toEqual([]);
    expect(trayItem('fountain')).toBeTruthy(); // still owned
  });

  it('a tray item places where tapped even on top of another placed item', async () => {
    await store.addBells(100);
    await store.buyDecor('fountain', 10);
    await store.buyDecor('campfire', 10);
    await store.putPlaced([{ decorId: 'fountain', x: 0.5, y: 0.5 }]);
    mount(<Decorate />);
    await waitFor(() => expect(screen.getAllByTestId('decor')).toHaveLength(1));
    stubRect();
    const fountain = () => document.querySelector('[data-testid=decor][data-decor-id=fountain]')!;
    fireEvent.click(trayItem('campfire'));
    fireEvent.click(fountain(), { clientX: 600, clientY: 300 });
    await waitFor(async () => expect(await store.getPlaced()).toHaveLength(2));
    expect(await store.getPlaced()).toEqual([
      { decorId: 'fountain', x: 0.5, y: 0.5 },
      { decorId: 'campfire', x: 0.5, y: 0.5 },
    ]);
    // the campfire is now placed; with no tray item armed, tapping the fountain selects it
    fireEvent.click(fountain());
    expect(fountain().getAttribute('aria-pressed')).toBe('true');
    expect(await store.getPlaced()).toHaveLength(2);
  });

  it('a failed save shows a neutral message', async () => {
    await store.addBells(100);
    await store.buyDecor('fountain', 10);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(store, 'putPlaced').mockRejectedValue(new Error('disk'));
    mount(<Decorate />);
    await waitFor(() => expect(trayItem('fountain')).toBeTruthy());
    expect(screen.queryByText('ほぞんできなかったよ')).toBeNull();
    fireEvent.click(trayItem('fountain'));
    fireEvent.click(stubRect(), { clientX: 300, clientY: 200 });
    expect(await screen.findByText('ほぞんできなかったよ')).toBeTruthy();
    expect(screen.getAllByTestId('decor')).toHaveLength(1);
  });

  it('a rejected initial read still lets the screen work', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(store, 'getOwned').mockRejectedValue(new Error('read'));
    mount(<Decorate />);
    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(await screen.findByText('おみせで かざりを かおう')).toBeTruthy();
  });

  it('draws lower items over higher ones (y order)', async () => {
    await store.putPlaced([
      { decorId: 'campfire', x: 0.5, y: 0.9 },
      { decorId: 'fountain', x: 0.5, y: 0.2 },
    ]);
    mount(<Decorate />);
    await waitFor(() => expect(screen.getAllByTestId('decor')).toHaveLength(2));
    const z = (id: string) => Number((document.querySelector(`[data-decor-id=${id}]`) as HTMLElement).style.zIndex);
    expect(z('campfire')).toBeGreaterThan(z('fountain'));
  });

  it('a failing save warns once and the UI keeps working', async () => {
    await store.addBells(100);
    await store.buyDecor('fountain', 10);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(store, 'putPlaced').mockRejectedValue(new Error('disk'));
    mount(<Decorate />);
    await waitFor(() => expect(trayItem('fountain')).toBeTruthy());
    const sceneEl = stubRect();
    fireEvent.click(trayItem('fountain'));
    fireEvent.click(sceneEl, { clientX: 300, clientY: 200 });
    fireEvent.click(sceneEl, { clientX: 400, clientY: 200 });
    await waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(store.putPlaced).toHaveBeenCalledTimes(2));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId('decor')).toHaveLength(1);
  });

  it('store null renders without throwing; できた！ goes home; no Latin text', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount(<Decorate />, null);
    expect(await screen.findByTestId('decorate')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(NO_LATIN);
    window.location.hash = '#/decorate';
    fireEvent.click(screen.getByText('できた！'));
    expect(window.location.hash).toBe('#/');
  });
});

describe('Village with decor and new buttons', () => {
  it('renders placed decor from getPlaced and has おみせ / かざる buttons', async () => {
    await store.putPlaced([{ decorId: 'fountain', x: 0.4, y: 0.7 }]);
    mount(<Village />);
    await waitFor(() => expect(screen.getAllByTestId('decor')).toHaveLength(1));
    fireEvent.click(screen.getByLabelText('おみせ'));
    expect(window.location.hash).toBe('#/shop');
    fireEvent.click(screen.getByLabelText('かざる'));
    expect(window.location.hash).toBe('#/decorate');
    expect(document.body.textContent).not.toMatch(NO_LATIN);
  });
});

describe('daily limit reached: real App routes', () => {
  const atLimit = async () => {
    await store.putDay({ dateKey: dateKey(new Date()), playSeconds: 99999 });
    await store.addBells(100);
    await store.buyDecor('fountain', 10);
    return [vi.spyOn(store, 'putDay'), vi.spyOn(store, 'putProgress'), vi.spyOn(store, 'addBells')];
  };

  it('#/shop works and ticks nothing', async () => {
    const spies = await atLimit();
    window.location.hash = '#/shop';
    render(<App open={() => Promise.resolve(store)} />);
    await waitFor(() => expect(screen.getByTestId('bells').textContent).toBe('90'));
    fireEvent.click(buyBtn('watering_can'));
    await waitFor(() => expect(buyBtn('watering_can').textContent).toBe('もっているよ'));
    for (const sp of spies) expect(sp).not.toHaveBeenCalled();
    expect((await store.getDay()).playSeconds).toBe(99999);
  });

  it('#/decorate works and ticks nothing', async () => {
    const spies = await atLimit();
    window.location.hash = '#/decorate';
    render(<App open={() => Promise.resolve(store)} />);
    await waitFor(() => expect(document.querySelector('[data-testid=tray-item]')).toBeTruthy());
    fireEvent.click(document.querySelector('[data-testid=tray-item]')!);
    const sceneEl = screen.getByTestId('decor-scene');
    sceneEl.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 500 }) as DOMRect;
    fireEvent.click(sceneEl, { clientX: 500, clientY: 250 });
    await waitFor(async () => expect(await store.getPlaced()).toHaveLength(1));
    for (const sp of spies) expect(sp).not.toHaveBeenCalled();
    expect((await store.getDay()).playSeconds).toBe(99999);
  });
});

describe('Credits link on every route', () => {
  for (const hash of ['#/', '#/map', '#/quest/mimi', '#/credits', '#/probe', '#/parent', '#/shop', '#/decorate']) {
    it(`is present on ${hash}`, async () => {
      window.location.hash = hash;
      render(<App open={() => Promise.resolve(store)} />);
      await waitFor(() => expect(document.querySelectorAll('a[href="#/credits"]').length).toBeGreaterThanOrEqual(1));
    });
  }
  it('on #/decorate it is a top-row link, not inside the tray', async () => {
    window.location.hash = '#/decorate';
    render(<App open={() => Promise.resolve(store)} />);
    const link = await waitFor(() => {
      const a = document.querySelector('a[href="#/credits"]');
      expect(a).toBeTruthy();
      return a as HTMLElement;
    });
    expect(link.textContent).toBe('クレジット');
    expect(link.closest('.tray')).toBeNull();
    expect(link.classList.contains('credits-link')).toBe(true);
  });
});

describe('DailyStop', () => {
  it('offers decorating the village', () => {
    render(<DailyStop />);
    fireEvent.click(screen.getByText('むらをかざる'));
    expect(window.location.hash).toBe('#/decorate');
    expect(screen.getByText('むらへもどる')).toBeTruthy();
  });

  it('always shows Fuwa (momo_chan), sleepy', () => {
    render(<DailyStop />);
    const img = screen.getByTestId('quest-villager');
    expect(img.getAttribute('src')).toContain('villagers/momo_chan/sleepy');
    expect(img.getAttribute('data-pose')).toBe('sleepy');
  });
});
