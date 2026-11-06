import { cleanup, render, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Store } from '../src/store/store';
import { StoreProvider, useStore, type StoreState } from '../src/store/store-context';

afterEach(cleanup);

function Probe({ out }: { out: { s?: StoreState } }) {
  out.s = useStore();
  return null;
}

const mk = (health: Store['health'] = async () => ({ ok: true })) =>
  ({ health, close: vi.fn() }) as unknown as Store & { close: ReturnType<typeof vi.fn> };

describe('StoreProvider state', () => {
  it('rejecting open: degraded, one shared in-memory fallback store, one console.warn', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out: { s?: StoreState } = {};
    render(
      <StoreProvider open={() => Promise.reject(new Error('nope'))}>
        <Probe out={out} />
      </StoreProvider>,
    );
    await waitFor(() => expect(out.s?.degraded).toBe(true));
    expect(out.s?.fallback).toBe(true);
    expect(await out.s?.store?.getBells()).toBe(0);
    expect(out.s?.healthy).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('health not ok: healthy false and degraded true', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out: { s?: StoreState } = {};
    const store = mk(async () => ({ ok: false, reason: 'quota' }));
    render(
      <StoreProvider open={() => Promise.resolve(store)}>
        <Probe out={out} />
      </StoreProvider>,
    );
    await waitFor(() => expect(out.s?.degraded).toBe(true));
    expect(out.s?.healthy).toBe(false);
    expect(out.s?.store).toBe(store);
    warn.mockRestore();
  });

  it('healthy store: healthy true, not degraded, no warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out: { s?: StoreState } = {};
    render(
      <StoreProvider open={() => Promise.resolve(mk())}>
        <Probe out={out} />
      </StoreProvider>,
    );
    await waitFor(() => expect(out.s?.healthy).toBe(true));
    expect(out.s?.degraded).toBe(false);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('closes the store on unmount', async () => {
    const store = mk();
    const out: { s?: StoreState } = {};
    const r = render(
      <StoreProvider open={() => Promise.resolve(store)}>
        <Probe out={out} />
      </StoreProvider>,
    );
    await waitFor(() => expect(out.s?.store).toBe(store));
    r.unmount();
    await waitFor(() => expect(store.close).toHaveBeenCalledTimes(1));
  });

  it('closes immediately when open resolves after unmount', async () => {
    const store = mk();
    let resolve!: (s: Store) => void;
    const open = () => new Promise<Store>((r) => (resolve = r));
    const r = render(
      <StoreProvider open={open}>
        <Probe out={{}} />
      </StoreProvider>,
    );
    r.unmount();
    resolve(store);
    await waitFor(() => expect(store.close).toHaveBeenCalledTimes(1));
  });
});
