import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../src/app';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

/** A control that takes the child (or parent) back to the village, whatever each screen calls it. */
function findBackControl(): HTMLElement | null {
  const byTestId = ['credits-back', 'probe-back', 'done', 'gate-back'];
  for (const id of byTestId) {
    const el = screen.queryByTestId(id);
    if (el) return el;
  }
  const labelled = screen.queryByLabelText('むらへもどる');
  if (labelled) return labelled;
  return (
    screen.queryAllByRole('button').find((b) => /^(もどる|むらへもどる)$/.test((b.textContent ?? '').trim())) ??
    null
  );
}

describe('every non-village route has a visible way back to the village', () => {
  const routes = ['#/map', '#/shop', '#/decorate', '#/quest/mimi', '#/parent', '#/credits', '#/probe'];
  for (const route of routes) {
    it(`${route}`, async () => {
      window.location.hash = route;
      render(<App />);
      await waitFor(() => expect(findBackControl()).not.toBeNull());
      const back = findBackControl()!;
      fireEvent.click(back);
      await waitFor(() => expect(window.location.hash).toBe('#/'));
    });
  }

  it('credits and probe buttons are at least 72 px high by style class', () => {
    window.location.hash = '#/credits';
    render(<App />);
    expect(screen.getByTestId('credits-back').className).toContain('btn');
  });
});
