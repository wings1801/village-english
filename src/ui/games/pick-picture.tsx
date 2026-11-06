import { Choices, Picture, type GameProps } from './shared';

export function PickPicture(props: GameProps) {
  const { question } = props;
  return (
    <div class="game game-pick-picture">
      {question.imageId && <Picture imageId={question.imageId} />}
      <Choices {...props} />
    </div>
  );
}
