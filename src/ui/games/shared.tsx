import { emojiSrc } from '../../assets/manifest';
import type { Question } from '../../domain/types';

export interface GameProps {
  question: Question;
  onAnswer(given: string): void;
  disabled: boolean;
}

export function Picture({ imageId }: { imageId: string }) {
  return <img class="q-picture" src={emojiSrc(imageId)} alt="" draggable={false} />;
}

/** Big tappable answer buttons: picture choices (imageId) or English words (textEn). */
export function Choices({ question, onAnswer, disabled }: GameProps) {
  const choices = question.choices ?? [];
  return (
    <div class={`choices choices-${choices.length}`} role="group" aria-label="こたえを えらぼう">
      {choices.map((c, i) => (
        <button
          key={c.id}
          type="button"
          class={`choice ${c.imageId && !c.textEn ? 'choice-pic' : 'choice-word'}`}
          data-testid="choice"
          data-choice-id={c.id}
          disabled={disabled}
          aria-label={c.imageId && !c.textEn ? `${i + 1}ばんの え` : undefined}
          onClick={() => !disabled && onAnswer(c.id)}
        >
          {c.imageId && <img src={emojiSrc(c.imageId)} alt="" draggable={false} />}
          {c.textEn}
        </button>
      ))}
    </div>
  );
}
