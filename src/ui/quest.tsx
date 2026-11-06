import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { cancelSpeech, speak, unlockAudio } from '../audio/tts';
import { BACKGROUNDS, ICONS, VILLAGERS, type Pose, type Villager } from '../assets/manifest';
import { loadQuestions } from '../domain/content';
import { dateKey } from '../domain/daily-limit';
import { plainJa } from '../domain/plain-ja';
import { runQuest, type QuestSession } from '../domain/quest';
import type { DayState, GradeId, Question } from '../domain/types';
import { markDegraded } from '../store/degraded';
import { createMemoryStore } from '../store/memory-store';
import type { Store } from '../store/store';
import { useStore } from '../store/store-context';
import { DailyStop } from './daily-stop';
import { DialogueChoice } from './games/dialogue-choice';
import { LetterTiles } from './games/letter-tiles';
import { ListenPick } from './games/listen-pick';
import { PickPicture } from './games/pick-picture';
import { PickWord } from './games/pick-word';
import { poseFor, WRONG_COPY } from '../domain/reaction';
import { navigate } from './router';
import { RubyText } from './ruby-text';
import { useSpokenMessage } from './use-spoken';

export const MSG_EMPTY = 'もんだいを じゅんびちゅう';
export const MSG_SUMMARY = 'おつかれさま！';

const CHEERS = ['やったね！', 'すごい！', 'いいね！', 'そのちょうし！'];
const STREAK_CHEER = 'そのちょうし！';
const QUEST_SIZE = 5;
const STORE_WAIT_MS = 1000;

type Phase = 'intro' | 'loading' | 'empty' | 'playing' | 'summary' | 'stop';
type Feedback = { kind: 'again' } | { kind: 'cheer'; text: string; reward: number };

export interface QuestProps {
  villagerId: string;
  /** Delay between a correct answer and the next question. */
  advanceMs?: number;
  /** Active-time tick interval (each tick adds one second of play). */
  tickMs?: number;
}

export function Quest({ villagerId, ...rest }: QuestProps) {
  const villager = VILLAGERS.find((v) => v.id === villagerId);
  useEffect(() => {
    if (!villager) navigate('#/');
  }, [villager]);
  if (!villager) return null;
  return <QuestInner villager={villager} {...rest} />;
}

function Game({
  question,
  onAnswer,
  disabled,
}: {
  question: Question;
  onAnswer(given: string): void;
  disabled: boolean;
}) {
  const props = { question, onAnswer, disabled };
  switch (question.kind) {
    case 'pick-picture':
      return <PickPicture {...props} />;
    case 'listen-pick':
      return <ListenPick {...props} />;
    case 'letter-tiles':
      return <LetterTiles {...props} />;
    case 'pick-word':
      return <PickWord {...props} />;
    default:
      return <DialogueChoice {...props} />;
  }
}

/** The English that is spoken after a correct answer (null = nothing extra to say). */
function englishAfterCorrect(q: Question): string | null {
  const word = q.choices?.find((c) => c.id === q.answer)?.textEn;
  switch (q.kind) {
    case 'pick-picture':
      return word ?? null;
    case 'letter-tiles':
      return q.answer;
    case 'pick-word':
      return word && q.promptEn ? q.promptEn.replace('___', word) : (word ?? null);
    case 'dialogue-choice':
      return word ?? null;
    default:
      return null;
  }
}

const scene = BACKGROUNDS.find((b) => b.id === 'flower_meadow_village')!;

function QuestInner({
  villager,
  advanceMs = 900,
  tickMs = 1000,
}: {
  villager: Villager;
  advanceMs?: number;
  tickMs?: number;
}) {
  const { store, degraded } = useStore();
  const storeRef = useRef<Store | null>(store);
  storeRef.current = store;
  const degradedRef = useRef(degraded);
  degradedRef.current = degraded;
  const fallback = useRef<Store | null>(null);

  const [phase, setPhaseState] = useState<Phase>('intro');
  const phaseRef = useRef<Phase>('intro');
  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };
  const [pose, setPose] = useState<Pose>('idle');
  const [question, setQuestion] = useState<Question | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [bells, setBells] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [earned, setEarned] = useState(0);
  const session = useRef<QuestSession | null>(null);
  // Backstop for the daily limit: stored seconds at start + seconds counted here, independent of store writes.
  const limitSeconds = useRef(1800);
  const baseSeconds = useRef(0);
  const countedSeconds = useRef(0);
  const warned = useRef(new Set<string>());
  const warnOnce = (category: 'settings' | 'day' | 'tick' | 'store', what: string, e: unknown) => {
    if (warned.current.has(category)) return;
    warned.current.add(category);
    console.warn(`quest: ${what}`, e);
  };
  // Bumped on every cancel so a chained follow-up (listen-pick word) of cancelled speech never plays.
  const speechGen = useRef(0);
  const cancelAll = () => {
    speechGen.current += 1;
    cancelSpeech();
  };
  const mainRef = useRef<HTMLElement>(null);
  const baseBells = useRef(0);
  const alive = useRef(true);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimeout(advanceTimer.current);
      cancelSpeech(); // leaving the quest silences it
    };
  }, []);

  const lock = (v: boolean) => {
    busyRef.current = v;
    setBusy(v);
  };

  const stopForToday = () => {
    clearTimeout(advanceTimer.current);
    lock(true);
    cancelAll();
    setFeedback(null);
    setPose(poseFor('timeup'));
    setPhase('stop');
  };

  async function start() {
    if (phaseRef.current === 'loading') return;
    unlockAudio(); // first user gesture
    setPhase('loading');
    setFeedback(null);
    setPose(poseFor('idle'));
    setQuestion(null);
    setAttempt(0);
    setAnswered(0);
    setEarned(0);
    lock(false);

    // The store opens asynchronously; give it a moment so progress is saved, else play in memory.
    const waitUntil = Date.now() + STORE_WAIT_MS;
    while (!storeRef.current && !degradedRef.current && Date.now() < waitUntil) {
      await new Promise((r) => setTimeout(r, 25));
    }
    if (!alive.current) return;
    const real = storeRef.current;
    if (!real && !fallback.current) {
      console.warn('quest: storage unavailable, playing with the in-memory fallback');
      markDegraded('quest is using the in-memory fallback store');
      fallback.current = createMemoryStore();
    }
    const base: Store = real ?? fallback.current!;
    // Tell the parent screen (via degraded.ts) when play time cannot be saved.
    const watchedPutDay = async (d: DayState) => {
      try {
        await base.putDay(d);
      } catch (e) {
        markDegraded('could not save play time');
        throw e;
      }
    };
    const s: Store = new Proxy(base, { get: (t, k) => (k === 'putDay' ? watchedPutDay : Reflect.get(t, k)) });

    let grade: GradeId = '5';
    limitSeconds.current = 1800;
    baseSeconds.current = 0;
    countedSeconds.current = 0;
    try {
      const settings = await s.getSettings();
      grade = settings.currentGrade ?? '5';
      limitSeconds.current = settings.dailyLimitSeconds;
    } catch (e) {
      warnOnce('settings', 'could not read settings, using grade 5', e);
    }
    try {
      const day = await s.getDay();
      if (day.dateKey === dateKey(new Date())) baseSeconds.current = day.playSeconds;
    } catch (e) {
      warnOnce('day', 'could not read the day record', e);
    }
    const pool = await loadQuestions(grade);
    if (!alive.current) return;
    if (pool.length === 0) {
      setPhase('empty');
      return;
    }
    let q: QuestSession;
    try {
      q = await runQuest({ store: s, pool, today: dateKey(new Date()), size: QUEST_SIZE });
    } catch (e) {
      console.warn('quest: could not start', e);
      setPhase('empty');
      return;
    }
    let b = 0;
    try {
      b = await s.getBells();
    } catch {
      /* show 0 */
    }
    if (!alive.current) return;
    session.current = q;
    baseBells.current = b;
    setBells(b);
    const first = q.next();
    if (q.timeUp || !first) {
      stopForToday();
      return;
    }
    setQuestion(first);
    setPhase('playing');
  }

  async function onAnswer(given: string) {
    const s = session.current;
    if (!s || !question || busyRef.current || phaseRef.current !== 'playing') return;
    lock(true);
    cancelAll(); // the prompt is no longer relevant once the child answered
    let res;
    try {
      res = await s.answer(given);
    } catch {
      if (alive.current && phaseRef.current === 'playing') lock(false);
      return;
    }
    if (!alive.current || phaseRef.current !== 'playing') return;
    cancelAll();
    if (!res.correct) {
      setPose(res.pose);
      setFeedback({ kind: 'again' });
      setAttempt((a) => a + 1);
      lock(false);
      return;
    }
    const text = res.streak >= 3 ? STREAK_CHEER : CHEERS[Math.floor(Math.random() * CHEERS.length)];
    setPose(res.pose);
    setFeedback({ kind: 'cheer', text, reward: res.reward });
    const sum = s.summary();
    setEarned(sum.bellsEarned);
    setBells(baseBells.current + sum.bellsEarned);
    setAnswered(sum.answered);
    const english = englishAfterCorrect(question);
    if (english) void speak(english, 'en-US');
    advanceTimer.current = setTimeout(() => {
      if (!alive.current || phaseRef.current !== 'playing') return;
      setFeedback(null);
      setAttempt(0);
      if (res.done) {
        setPose(sum.correctFirstTry >= QUEST_SIZE - 1 ? poseFor('streak') : poseFor('correct'));
        setQuestion(null);
        setPhase('summary');
        return;
      }
      setPose(poseFor('idle'));
      setQuestion(s.next());
      lock(false);
    }, advanceMs);
  }

  // Voice for the non-question screens (the playing phase has its own effect below).
  useSpokenMessage(
    phase === 'intro' ? villager.nameJa : phase === 'empty' ? MSG_EMPTY : phase === 'summary' ? MSG_SUMMARY : null,
  );

  // Voice: read the instruction aloud when a question appears (listen-pick then plays its word).
  useEffect(() => {
    if (phase !== 'playing' || !question) return;
    speechGen.current += 1;
    const mine = speechGen.current;
    cancelSpeech(); // drop the previous question's speech first
    void speak(plainJa(question.promptJa), 'ja-JP').then(() => {
      if (speechGen.current === mine && question.kind === 'listen-pick' && question.speakEn) {
        void speak(question.speakEn, 'en-US');
      }
    });
  }, [question?.id, phase]);

  // Keyboard / screen-reader focus follows the question.
  useEffect(() => {
    if (phase === 'playing') mainRef.current?.focus({ preventScroll: true });
  }, [question?.id, phase]);

  // Active-time tick: one second per interval, only while a question is up and the page is visible.
  useEffect(() => {
    if (phase !== 'playing') return;
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      countedSeconds.current += 1;
      const backstop = baseSeconds.current + countedSeconds.current >= limitSeconds.current;
      session.current?.tick(1).then(
        (up) => {
          if ((up || backstop) && alive.current && phaseRef.current === 'playing') stopForToday();
        },
        (e) => {
          warnOnce('tick', 'could not record play time', e);
          markDegraded('could not save play time');
          if (backstop && alive.current && phaseRef.current === 'playing') stopForToday();
        },
      );
    }, tickMs);
    return () => clearInterval(id);
  }, [phase, tickMs]);

  const hint = () => {
    if (!question || !session.current || busyRef.current) return;
    setPose(session.current.hint());
    cancelAll(); // replay replaces, never stacks
    void speak(plainJa(question.promptJa), 'ja-JP');
  };

  const sprite = (
    <img
      class="quest-villager"
      data-testid="quest-villager"
      data-pose={pose}
      src={villager.poses[pose]}
      alt=""
      draggable={false}
    />
  );

  if (phase === 'stop') return <DailyStop />;

  if (phase === 'loading') {
    return (
      <main class="screen quest-plain" data-testid="quest" data-phase="loading">
        <div class="card intro-card">
          <img
            class="intro-villager"
            data-testid="quest-villager"
            data-pose="idle"
            src={villager.poses.idle}
            alt=""
            draggable={false}
          />
          <p class="card-text" role="status">
            …
          </p>
        </div>
      </main>
    );
  }

  if (phase === 'intro') {
    return (
      <main class="screen quest-plain" data-testid="quest" data-phase={phase}>
        <div class="card intro-card">
          <img
            class="intro-villager"
            data-testid="quest-villager"
            data-pose={pose}
            src={villager.poses[pose]}
            alt=""
            draggable={false}
          />
          <span class="chip intro-name">{villager.nameJa}</span>
          <button type="button" class="btn btn-primary btn-big" onClick={start}>
            はじめる
          </button>
          <button type="button" class="btn btn-soft" onClick={() => navigate('#/')}>
            もどる
          </button>
        </div>
      </main>
    );
  }

  if (phase === 'empty') {
    return (
      <main class="screen quest-plain" data-testid="quest" data-phase="empty">
        <div class="card intro-card">
          <img
            class="intro-villager"
            data-testid="quest-villager"
            data-pose="idle"
            src={villager.poses.idle}
            alt=""
            draggable={false}
          />
          <p class="card-text">{MSG_EMPTY}</p>
          <button type="button" class="btn btn-primary" onClick={() => navigate('#/')}>
            もどる
          </button>
        </div>
      </main>
    );
  }

  if (phase === 'summary') {
    return (
      <main class="screen quest-plain" data-testid="quest" data-phase="summary">
        <div class="card intro-card" data-testid="summary">
          <img
            class="intro-villager"
            data-testid="quest-villager"
            data-pose={pose}
            src={villager.poses[pose]}
            alt=""
            draggable={false}
          />
          <p class="card-title">{MSG_SUMMARY}</p>
          <div class="chip summary-bells">
            <img src={ICONS.coin} alt="ベル" width="48" height="48" draggable={false} />
            <span data-testid="summary-bells">{earned}</span>
          </div>
          <div class="summary-buttons">
            <button type="button" class="btn btn-primary" onClick={start}>
              もういっかい
            </button>
            <button type="button" class="btn btn-soft" onClick={() => navigate('#/')}>
              むらへもどる
            </button>
          </div>
        </div>
      </main>
    );
  }

  // playing
  const q = question!;
  const dots: ComponentChildren[] = Array.from({ length: QUEST_SIZE }, (_, i) => (
    <span key={i} class={`dot ${i < answered ? 'dot-done' : i === answered ? 'dot-now' : ''}`} />
  ));
  return (
    <main class="screen quest" data-testid="quest" data-phase="playing">
      <img class="scene-bg" src={scene.src} alt="" draggable={false} />
      <div class="quest-top">
        <button type="button" class="btn-round quest-home" aria-label="むらへもどる" onClick={() => navigate('#/')}>
          <img src={ICONS.home} alt="" width="40" height="40" draggable={false} />
        </button>
        <div
          class="progress"
          data-testid="progress"
          data-done={answered}
          role="img"
          aria-label={`${answered} / ${QUEST_SIZE}`}
        >
          {dots}
        </div>
        <div class="chip bells-chip" data-testid="quest-bells" aria-label={`ベル ${bells}`}>
          <img src={ICONS.coin} alt="" width="36" height="36" draggable={false} />
          <span>{bells}</span>
        </div>
      </div>

      <aside class="quest-side">
        {sprite}
        <div class="feedback" aria-live="polite">
          {feedback?.kind === 'again' && (
            <span class="chip feedback-chip feedback-again" data-testid="again">
              {WRONG_COPY}
            </span>
          )}
          {feedback?.kind === 'cheer' && (
            <>
              <span class="chip feedback-chip feedback-cheer" data-testid="cheer">
                {feedback.text}
              </span>
              {feedback.reward > 0 && (
                <span class="reward-float" data-testid="reward-float">
                  +{feedback.reward}
                  <img src={ICONS.coin} alt="ベル" width="40" height="40" draggable={false} />
                </span>
              )}
            </>
          )}
        </div>
      </aside>

      <section ref={mainRef} tabIndex={-1} class="quest-main" data-testid="question" data-question-id={q.id} data-kind={q.kind}>
        <div class="instruction">
          <button type="button" class="speaker-btn" aria-label="もんだいを きく" disabled={busy} onClick={hint}>
            <img src={ICONS.music_note} alt="" width="40" height="40" draggable={false} />
            <span>きく</span>
          </button>
          <RubyText class="instruction-text" text={q.promptJa} />
        </div>
        <Game key={`${q.id}:${attempt}`} question={q} onAnswer={onAnswer} disabled={busy} />
      </section>
    </main>
  );
}
