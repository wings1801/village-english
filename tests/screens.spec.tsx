import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StoreProvider } from '../src/store/store-context';
import type { Store } from '../src/store/store';
import { App } from '../src/app';
import { VILLAGERS } from '../src/assets/manifest';
import { dateKey } from '../src/domain/daily-limit';
import { villagersForDay } from '../src/domain/village';
import { Footer } from '../src/ui/footer';
import { IslandMap } from '../src/ui/island-map';
import { vi as parentStrings } from '../src/ui/parent-strings';
import { Village } from '../src/ui/village';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

const fakeStore = (bells: number): Store =>
  ({
    getBells: async () => bells,
    getPlaced: async () => [],
    health: async () => ({ ok: true }),
    close: () => {},
  }) as unknown as Store;

describe('Village', () => {
  it('renders villagers, map button and the Credits link', () => {
    render(
      <StoreProvider open={() => Promise.resolve(fakeStore(0))}>
        <Village />
        <Footer />
      </StoreProvider>,
    );
    expect(screen.getAllByTestId('villager').length).toBeGreaterThanOrEqual(4);
    expect(screen.getByLabelText('ちず')).toBeTruthy();
    const link = screen.getByText('ライセンス・クレジット').closest('a')!;
    expect(link.getAttribute('href')).toBe('#/credits');
    const first = villagersForDay(dateKey(new Date()), VILLAGERS)[0];
    expect(screen.getByLabelText(`${first.nameJa}のところへいく`)).toBeTruthy();
  });

  it('shows six villagers chosen by the day, and every villager appears over 11 days', () => {
    const seen = new Set<string>();
    for (let d = 1; d <= 11; d++) {
      const { unmount } = render(<Village today={`2026-12-${String(d).padStart(2, '0')}`} />);
      const ids = screen.getAllByTestId('villager').map((e) => e.getAttribute('data-villager-id')!);
      expect(ids).toHaveLength(6);
      ids.forEach((i) => seen.add(i));
      unmount();
    }
    expect(seen.size).toBe(VILLAGERS.length);
  });

  it('shows no Latin letters anywhere in the visible text', () => {
    const { container } = render(
      <>
        <Village />
        <Footer />
      </>,
    );
    expect(container.textContent).not.toMatch(/[A-Za-z]/);
    cleanup();
    const map = render(<IslandMap />);
    expect(map.container.textContent).not.toMatch(/[A-Za-z]/);
  });

  it('shows the bells from the store', async () => {
    render(
      <StoreProvider open={() => Promise.resolve(fakeStore(42))}>
        <Village />
      </StoreProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('bells').textContent).toBe('42'));
  });

  it('tapping a villager goes to its quest', () => {
    render(<Village />);
    fireEvent.click(screen.getAllByTestId('villager')[0]);
    expect(window.location.hash).toMatch(/^#\/quest\//);
  });
});

describe('StoreProvider failure', () => {
  it('still renders the village (0 bells) when openStore rejects', async () => {
    const open = vi.fn().mockRejectedValue(new Error('IndexedDB unavailable'));
    render(
      <StoreProvider open={open}>
        <Village />
      </StoreProvider>,
    );
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    expect(screen.getAllByTestId('villager').length).toBeGreaterThan(0);
    expect(screen.getByTestId('bells').textContent).toBe('0');
  });

  it('survives a store whose reads fail', async () => {
    const getBells = vi.fn(() => Promise.reject(new Error('x')));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = {
      getBells,
      getPlaced: () => Promise.reject(new Error('x')),
      health: () => Promise.reject(new Error('x')),
      close: () => {},
    } as unknown as Store;
    render(
      <StoreProvider open={() => Promise.resolve(broken)}>
        <Village />
      </StoreProvider>,
    );
    await waitFor(() => expect(getBells).toHaveBeenCalled());
    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(screen.getAllByTestId('villager').length).toBeGreaterThan(0);
    expect(screen.getByTestId('bells').textContent).toBe('0');
    warn.mockRestore();
  });
});

describe('IslandMap', () => {
  it('shows 7 islands, 2 enabled and 5 aria-disabled', () => {
    render(<IslandMap />);
    const tiles = screen.getAllByTestId('island');
    expect(tiles).toHaveLength(7);
    expect(tiles.filter((t) => t.getAttribute('aria-disabled') === 'false')).toHaveLength(2);
    expect(tiles.filter((t) => t.getAttribute('aria-disabled') === 'true')).toHaveLength(5);
    expect(screen.getAllByText('もうすこしまってね')).toHaveLength(5);
  });

  it('locked tiles do not navigate; unlocked go home with a toast', async () => {
    window.location.hash = '#/map';
    render(<App />);
    const tiles = screen.getAllByTestId('island');
    fireEvent.click(tiles[2]);
    expect(window.location.hash).toBe('#/map');
    fireEvent.click(tiles[0]);
    expect(window.location.hash).toBe('#/');
    expect(await screen.findByText('このしまで あそぼう！')).toBeTruthy();
  });
});

describe('IslandMap grade saving', () => {
  it('tapping an unlocked island saves currentGrade before returning to the village', async () => {
    const saved: unknown[] = [];
    const store = {
      getSettings: async () => ({ dailyLimitSeconds: 1800 }),
      putSettings: async (s: unknown) => void saved.push(s),
      getBells: async () => 0,
      getPlaced: async () => [],
      health: async () => ({ ok: true }),
      close: () => {},
    } as unknown as Store;
    window.location.hash = '#/map';
    render(
      <StoreProvider open={() => Promise.resolve(store)}>
        <IslandMap />
      </StoreProvider>,
    );
    await waitFor(() => expect(screen.getAllByTestId('island').length).toBe(7));
    await new Promise((r) => setTimeout(r, 20)); // let the provider hand the store over
    fireEvent.click(screen.getAllByTestId('island')[1]);
    await waitFor(() => expect(window.location.hash).toBe('#/'));
    await waitFor(() => expect(saved).toEqual([{ dailyLimitSeconds: 1800, currentGrade: '4' }]));
  });

  it('navigates immediately even if putSettings hangs', async () => {
    const store = {
      getSettings: async () => ({ dailyLimitSeconds: 1800 }),
      putSettings: () => new Promise<void>(() => {}),
      health: async () => ({ ok: true }),
      close: () => {},
    } as unknown as Store;
    window.location.hash = '#/map';
    render(
      <StoreProvider open={() => Promise.resolve(store)}>
        <IslandMap />
      </StoreProvider>,
    );
    await new Promise((r) => setTimeout(r, 20));
    fireEvent.click(screen.getAllByTestId('island')[0]);
    expect(window.location.hash).toBe('#/');
  });

  it('warns when there is no store', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    window.location.hash = '#/map';
    render(<IslandMap />);
    fireEvent.click(screen.getAllByTestId('island')[0]);
    expect(window.location.hash).toBe('#/');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a failing store never blocks returning to the village', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = {
      getSettings: () => Promise.reject(new Error('x')),
      putSettings: () => Promise.reject(new Error('x')),
      health: async () => ({ ok: true }),
      close: () => {},
    } as unknown as Store;
    window.location.hash = '#/map';
    render(
      <StoreProvider open={() => Promise.resolve(store)}>
        <IslandMap />
      </StoreProvider>,
    );
    await new Promise((r) => setTimeout(r, 20));
    fireEvent.click(screen.getAllByTestId('island')[0]);
    await waitFor(() => expect(window.location.hash).toBe('#/'));
    warn.mockRestore();
  });
});

describe('App routing', () => {
  it('the quest route shows the intro with はじめる', async () => {
    window.location.hash = '#/quest/mimi';
    render(<App />);
    expect(await screen.findByText('はじめる')).toBeTruthy();
  });

  it('the parent route shows the parent corner (never the old placeholder)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    window.location.hash = '#/parent';
    render(<App open={() => Promise.reject(new Error('no idb'))} />);
    expect(await screen.findByText(parentStrings.noStore.title)).toBeTruthy();
    expect(screen.queryByText('じゅんびちゅう')).toBeNull();
    expect(screen.getByText('ライセンス・クレジット')).toBeTruthy(); // Credits stays reachable
  });
});
