import { Fragment } from 'preact';
import { Choices, type GameProps } from './shared';

/** Splits "Eat a ___!" around the blank so the blank can be drawn as a highlighted slot. */
export function SentenceWithBlank({ text }: { text: string }) {
  const parts = text.split('___');
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {p}
          {i < parts.length - 1 && <span class="blank-slot" />}
        </Fragment>
      ))}
    </>
  );
}

export function PickWord(props: GameProps) {
  return (
    <div class="game game-pick-word">
      <p class="sentence">
        <SentenceWithBlank text={props.question.promptEn ?? ''} />
      </p>
      <Choices {...props} />
    </div>
  );
}
