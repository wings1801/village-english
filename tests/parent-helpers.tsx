import { fireEvent, render, screen } from '@testing-library/preact';
import { generateSalt, hashPin } from '../src/domain/pin';
import type { Store } from '../src/store/store';
import { StoreProvider } from '../src/store/store-context';
import { Parent } from '../src/ui/parent';

export const mountParent = (store: Store | null, ui: preact.ComponentChildren = <Parent reload={() => {}} />) =>
  render(<StoreProvider open={() => (store ? Promise.resolve(store) : Promise.reject(new Error('no idb')))}>{ui}</StoreProvider>);

export const press = (digits: string) => {
  for (const d of digits) fireEvent.click(document.querySelector(`[data-digit="${d}"]`)!);
};

export const msg = () => screen.getByTestId('gate-msg').textContent ?? '';

export async function seedPin(store: Store, pin = '1234', extra: Record<string, unknown> = {}) {
  const salt = generateSalt();
  const cur = await store.getSettings();
  await store.putSettings({ ...cur, pinHash: await hashPin(pin, salt), pinSalt: salt, ...extra });
}

export async function unlockUi(pin = '1234') {
  await screen.findByTestId('parent-gate');
  press(pin);
  await screen.findByTestId('parent-dash');
  await screen.findByTestId('sec-backup');
}

export const file = (text: string, name = 'b.json') => new File([text], name, { type: 'application/json' });
export const upload = (testid: string, f: File) => fireEvent.change(screen.getByTestId(testid), { target: { files: [f] } });
