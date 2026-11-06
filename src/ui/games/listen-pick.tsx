import { cancelSpeech, speak } from '../../audio/tts';
import { ICONS } from '../../assets/manifest';
import { Choices, type GameProps } from './shared';

export function ListenPick(props: GameProps) {
  const { question } = props;
  return (
    <div class="game game-listen-pick">
      <button
        type="button"
        class="speaker-big"
        data-testid="listen-speaker"
        aria-label="もういちど きく"
        onClick={() => {
          cancelSpeech(); // replay replaces, never stacks
          if (question.speakEn) void speak(question.speakEn, 'en-US');
        }}
      >
        <img src={ICONS.music_note} alt="" width="72" height="72" draggable={false} />
        <span>きく</span>
      </button>
      <Choices {...props} />
    </div>
  );
}
