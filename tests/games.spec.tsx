import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Question } from '../src/domain/types';

vi.mock('../src/audio/tts', () => ({
  speak: vi.fn(() => Promise.resolve()),
  cancelSpeech: vi.fn(),
  unlockAudio: vi.fn(),
}));

import { speak } from '../src/audio/tts';
import { DialogueChoice } from '../src/ui/games/dialogue-choice';
import { LetterTiles, shuffleLetters } from '../src/ui/games/letter-tiles';
import { ListenPick } from '../src/ui/games/listen-pick';
import { PickPicture } from '../src/ui/games/pick-picture';
import { PickWord } from '../src/ui/games/pick-word';

const src = { name: 's', license: 'l' };
const base = { id: 'q', grade: '5' as const, promptJa: 'x', source: src };

beforeEach(() => vi.mocked(speak).mockClear());
afterEach(cleanup);

describe('PickPicture', () => {
  const q: Question = {
    ...base,
    kind: 'pick-picture',
    imageId: 'dog',
    choices: [
      { id: 'a', textEn: 'dog' },
      { id: 'b', textEn: 'cat' },
      { id: 'c', textEn: 'bird' },
    ],
    answer: 'a',
  };

  it('shows the picture and one button per choice with the English word', () => {
    const { container } = render(<PickPicture question={q} onAnswer={() => {}} disabled={false} />);
    const img = container.querySelector('img.q-picture') as HTMLImageElement;
    expect(img.getAttribute('src')).toMatch(/assets\/emoji\/dog\.svg$/);
    const buttons = screen.getAllByTestId('choice');
    expect(buttons.map((b) => b.textContent)).toEqual(['dog', 'cat', 'bird']);
    expect(buttons.every((b) => b.tagName === 'BUTTON')).toBe(true);
  });

  it('calls onAnswer with the choice id', () => {
    const onAnswer = vi.fn();
    render(<PickPicture question={q} onAnswer={onAnswer} disabled={false} />);
    fireEvent.click(screen.getByText('cat'));
    expect(onAnswer).toHaveBeenCalledWith('b');
  });

  it('blocks taps when disabled', () => {
    const onAnswer = vi.fn();
    render(<PickPicture question={q} onAnswer={onAnswer} disabled={true} />);
    const b = screen.getByText('cat') as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    fireEvent.click(b);
    expect(onAnswer).not.toHaveBeenCalled();
  });
});

describe('ListenPick', () => {
  const pics: Question = {
    ...base,
    kind: 'listen-pick',
    speakEn: 'fish',
    choices: [
      { id: 'a', imageId: 'fish' },
      { id: 'b', imageId: 'mouse' },
    ],
    answer: 'a',
  };

  it('has a big replay button that speaks the English word', () => {
    render(<ListenPick question={pics} onAnswer={() => {}} disabled={false} />);
    fireEvent.click(screen.getByLabelText('もういちど きく'));
    expect(speak).toHaveBeenCalledWith('fish', 'en-US');
  });

  it('shows picture choices with Japanese aria-labels and answers by id', () => {
    const onAnswer = vi.fn();
    const { container } = render(<ListenPick question={pics} onAnswer={onAnswer} disabled={false} />);
    const buttons = screen.getAllByTestId('choice');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('aria-label')).toMatch(/[ぁ-んァ-ン]/);
    expect(container.querySelectorAll('[data-testid=choice] img')).toHaveLength(2);
    fireEvent.click(buttons[1]);
    expect(onAnswer).toHaveBeenCalledWith('b');
  });

  it('shows text choices when choices carry textEn', () => {
    const onAnswer = vi.fn();
    const q: Question = { ...pics, choices: [{ id: 'a', textEn: 'fish' }, { id: 'b', textEn: 'dog' }] };
    render(<ListenPick question={q} onAnswer={onAnswer} disabled={false} />);
    fireEvent.click(screen.getByText('dog'));
    expect(onAnswer).toHaveBeenCalledWith('b');
  });

  it('blocks taps when disabled (replay still works)', () => {
    const onAnswer = vi.fn();
    render(<ListenPick question={pics} onAnswer={onAnswer} disabled={true} />);
    fireEvent.click(screen.getAllByTestId('choice')[0]);
    expect(onAnswer).not.toHaveBeenCalled();
  });
});

describe('LetterTiles', () => {
  const q: Question = { ...base, kind: 'letter-tiles', imageId: 'cat', answer: 'cat' };

  const tile = (ch: string) =>
    screen.getAllByTestId('tile').find((t) => t.textContent === ch && !(t as HTMLButtonElement).disabled)!;

  it('shows the picture, empty slots and shuffled tiles', () => {
    const { container } = render(<LetterTiles question={q} onAnswer={() => {}} disabled={false} />);
    expect(container.querySelector('img.q-picture')).not.toBeNull();
    expect(screen.getAllByTestId('slot')).toHaveLength(3);
    expect(
      screen
        .getAllByTestId('tile')
        .map((t) => t.textContent)
        .sort(),
    ).toEqual(['a', 'c', 't']);
  });

  it('shows the promptEn hint when there is no picture', () => {
    const noPic: Question = { ...q, imageId: undefined, promptEn: 'a pet that says meow' };
    const { container } = render(<LetterTiles question={noPic} onAnswer={() => {}} disabled={false} />);
    expect(container.querySelector('img.q-picture')).toBeNull();
    expect(container.textContent).toContain('a pet that says meow');
  });

  it('builds the word and auto-submits it when all slots are filled', () => {
    const onAnswer = vi.fn();
    render(<LetterTiles question={q} onAnswer={onAnswer} disabled={false} />);
    fireEvent.click(tile('c'));
    fireEvent.click(tile('a'));
    expect(onAnswer).not.toHaveBeenCalled();
    fireEvent.click(tile('t'));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith('cat');
  });

  it('tapping a placed letter returns it; 「けす」 clears all', () => {
    const onAnswer = vi.fn();
    render(<LetterTiles question={q} onAnswer={onAnswer} disabled={false} />);
    fireEvent.click(tile('c'));
    fireEvent.click(tile('a'));
    const slots = screen.getAllByTestId('slot');
    expect(slots[0].textContent).toBe('c');
    fireEvent.click(within(slots[0]).getByRole('button'));
    expect(screen.getAllByTestId('slot')[0].textContent).toBe('');
    fireEvent.click(tile('t'));
    // t lands in the first empty slot (slot 0)
    expect(screen.getAllByTestId('slot')[0].textContent).toBe('t');
    fireEvent.click(screen.getByText('けす'));
    expect(screen.getAllByTestId('slot').map((s) => s.textContent)).toEqual(['', '', '']);
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('ignores taps when disabled', () => {
    const onAnswer = vi.fn();
    render(<LetterTiles question={q} onAnswer={onAnswer} disabled={true} />);
    for (const t of screen.getAllByTestId('tile')) fireEvent.click(t);
    expect(screen.getAllByTestId('slot').map((s) => s.textContent)).toEqual(['', '', '']);
    expect(onAnswer).not.toHaveBeenCalled();
  });
});

describe('shuffleLetters', () => {
  it('never equals the answer when a different order exists', () => {
    for (let i = 0; i < 200; i++) {
      for (const w of ['cat', 'bus', 'egg', 'balloon', 'ab']) {
        const s = shuffleLetters(w, Math.random);
        expect(s.join('')).not.toBe(w);
        expect([...s].sort()).toEqual([...w].sort());
      }
    }
  });

  it('with a rng that would keep the order, still differs', () => {
    expect(shuffleLetters('cat', () => 0.999999).join('')).not.toBe('cat');
    expect(shuffleLetters('cat', () => 0).join('')).not.toBe('cat');
  });

  it('allows the identical order only when all letters are the same or one letter', () => {
    expect(shuffleLetters('aa', Math.random).join('')).toBe('aa');
    expect(shuffleLetters('a', Math.random).join('')).toBe('a');
  });
});

describe('PickWord', () => {
  const q: Question = {
    ...base,
    kind: 'pick-word',
    promptEn: 'Eat a ___!',
    choices: [
      { id: 'a', textEn: 'banana' },
      { id: 'b', textEn: 'bed' },
    ],
    answer: 'a',
  };

  it('shows the sentence with a highlighted blank slot and choices', () => {
    const { container } = render(<PickWord question={q} onAnswer={() => {}} disabled={false} />);
    const blank = container.querySelector('.blank-slot')!;
    expect(blank).not.toBeNull();
    expect(container.querySelector('.sentence')!.textContent).toMatch(/^Eat a\s*.*!$/);
    expect(screen.getAllByTestId('choice').map((b) => b.textContent)).toEqual(['banana', 'bed']);
  });

  it('calls onAnswer with the id and blocks when disabled', () => {
    const onAnswer = vi.fn();
    const { rerender } = render(<PickWord question={q} onAnswer={onAnswer} disabled={false} />);
    fireEvent.click(screen.getByText('bed'));
    expect(onAnswer).toHaveBeenCalledWith('b');
    onAnswer.mockClear();
    rerender(<PickWord question={q} onAnswer={onAnswer} disabled={true} />);
    fireEvent.click(screen.getByText('bed'));
    expect(onAnswer).not.toHaveBeenCalled();
  });
});

describe('DialogueChoice', () => {
  const q: Question = {
    ...base,
    kind: 'dialogue-choice',
    imageId: 'crown',
    promptEn: 'A: What is this?\nB: ___',
    choices: [
      { id: 'a', textEn: "It's a carrot." },
      { id: 'b', textEn: "It's a crown." },
    ],
    answer: 'b',
  };

  it('shows two speech bubbles, the picture and the choices', () => {
    const { container } = render(<DialogueChoice question={q} onAnswer={() => {}} disabled={false} />);
    const bubbles = container.querySelectorAll('.bubble');
    expect(bubbles).toHaveLength(2);
    expect(bubbles[0].textContent).toContain('What is this?');
    expect(bubbles[1].querySelector('.blank-slot')).not.toBeNull();
    expect(container.querySelector('img.q-picture')).not.toBeNull();
    expect(screen.getAllByTestId('choice')).toHaveLength(2);
  });

  it('calls onAnswer with the id; disabled blocks', () => {
    const onAnswer = vi.fn();
    const { rerender } = render(<DialogueChoice question={q} onAnswer={onAnswer} disabled={false} />);
    fireEvent.click(screen.getByText("It's a crown."));
    expect(onAnswer).toHaveBeenCalledWith('b');
    onAnswer.mockClear();
    rerender(<DialogueChoice question={q} onAnswer={onAnswer} disabled={true} />);
    fireEvent.click(screen.getByText("It's a crown."));
    expect(onAnswer).not.toHaveBeenCalled();
  });
});
