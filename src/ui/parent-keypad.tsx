import { vi } from './parent-strings';

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

interface KeypadProps {
  value: string;
  onChange: (v: string) => void;
  maxLength: number;
  /** PIN mode: shows dots and submits as soon as `maxLength` digits are entered. Otherwise shows the digits and has an OK key. */
  mask?: boolean;
  onSubmit: (v: string) => void;
  disabled?: boolean;
}

/** Custom on-screen numeric keypad (no native input, so no iPad keyboard pops up). */
export function Keypad({ value, onChange, maxLength, mask = false, onSubmit, disabled = false }: KeypadProps) {
  const press = (d: string) => {
    if (disabled || value.length >= maxLength) return;
    const next = value + d;
    onChange(next);
    if (mask && next.length === maxLength) onSubmit(next);
  };
  const back = () => {
    if (!disabled) onChange(value.slice(0, -1));
  };
  const enter = () => {
    if (!disabled && value !== '') onSubmit(value);
  };
  const key = (d: string) => (
    <button
      type="button"
      class="pad-key"
      key={d}
      aria-label={vi.keypad.digit(d)}
      disabled={disabled}
      data-testid="pad-key"
      data-digit={d}
      onClick={() => press(d)}
    >
      {d}
    </button>
  );
  return (
    <div class="keypad" role="group" aria-label={vi.keypad.label}>
      {mask ? (
        <div class="pad-dots" role="img" aria-label={vi.keypad.dots(value.length, maxLength)} data-testid="pad-dots">
          {Array.from({ length: maxLength }, (_, i) => (
            <span key={i} class={i < value.length ? 'pad-dot pad-dot-on' : 'pad-dot'} data-filled={i < value.length ? '1' : '0'} />
          ))}
        </div>
      ) : (
        <output class="pad-answer" aria-label={vi.keypad.answerBox} data-testid="pad-answer">
          {value === '' ? ' ' : value}
        </output>
      )}
      <div class="pad-grid">
        {DIGITS.map(key)}
        <button type="button" class="pad-key pad-key-aux" aria-label={vi.keypad.backspace} disabled={disabled} data-testid="pad-back" onClick={back}>
          {'⌫'}
        </button>
        {key('0')}
        {mask ? (
          <span class="pad-gap" aria-hidden="true" />
        ) : (
          <button type="button" class="pad-key pad-key-ok" aria-label={vi.keypad.enter} disabled={disabled} data-testid="pad-enter" onClick={enter}>
            {'✓'}
          </button>
        )}
      </div>
    </div>
  );
}
