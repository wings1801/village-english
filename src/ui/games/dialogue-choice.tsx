import { Choices, Picture, type GameProps } from './shared';
import { SentenceWithBlank } from './pick-word';

export function DialogueChoice(props: GameProps) {
  const { question } = props;
  const lines = (question.promptEn ?? '').split('\n').filter((l) => l.trim() !== '');
  return (
    <div class="game game-dialogue">
      <div class="dialogue">
        {question.imageId && <Picture imageId={question.imageId} />}
        <div class="bubbles">
          {lines.map((line, i) => (
            <p key={i} class={`bubble ${i % 2 === 0 ? 'bubble-a' : 'bubble-b'}`}>
              <SentenceWithBlank text={line} />
            </p>
          ))}
        </div>
      </div>
      <Choices {...props} />
    </div>
  );
}
