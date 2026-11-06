import { useEffect, useRef, useState } from 'preact/hooks';
import { dateKey } from '../domain/daily-limit';
import { GRADES, type GradeId } from '../domain/grades';
import { masteryByGrade, minutesByDay, weakWords } from '../domain/stats';
import type { Settings } from '../domain/types';
import type { Store } from '../store/store';
import { BackupSection, StorageSection } from './parent-backup';
import { loadDashData, type DashData } from './parent-data';
import { vi } from './parent-strings';
import { Dialog, Meter, Section } from './parent-ui';
import { CreatePin, PinVerify } from './pin-gate';

const MIN_LIMIT = 10;
const MAX_LIMIT = 90;
const STEP = 5;
const PLAYABLE: readonly GradeId[] = ['5', '4'];

type Say = (msg: string) => void;
interface SectionProps {
  store: Store;
  data: DashData;
  say: Say;
  reload: () => Promise<void>;
}

function TodaySection({ store, data, say, reload }: SectionProps) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const played = data.day.dateKey >= data.today ? Math.round(data.day.playSeconds / 60) : 0;
  const limit = Math.round(data.settings.dailyLimitSeconds / 60);
  const reset = async () => {
    setBusy(true);
    try {
      await store.resetDay(dateKey(new Date()));
      await reload();
      say(vi.today.done);
    } catch {
      say(vi.today.failed);
    }
    setBusy(false);
    setAsking(false);
  };
  return (
    <Section id="today" title={vi.today.title}>
      <p class="p-big" data-testid="today-text">
        {vi.today.played(played, limit)}
      </p>
      <Meter label={vi.today.barLabel(played, limit)} value={played} max={limit} />
      <button type="button" class="p-btn p-btn-soft" data-testid="reset-today" onClick={() => setAsking(true)}>
        {vi.today.reset}
      </button>
      {asking && (
        <Dialog
          id="reset"
          title={vi.today.confirmTitle}
          body={vi.today.confirmBody}
          confirmLabel={vi.today.confirmYes}
          busy={busy}
          onConfirm={() => void reset()}
          onCancel={() => setAsking(false)}
        />
      )}
    </Section>
  );
}

function WeekSection({ data }: { data: DashData }) {
  const items = minutesByDay([...data.daysLog, data.day], 7, data.today);
  const top = Math.max(1, Math.round(data.settings.dailyLimitSeconds / 60), ...items.map((i) => i.minutes));
  const total = items.reduce((s, i) => s + i.minutes, 0);
  return (
    <Section id="week" title={vi.week.title}>
      <div class="chart" role="img" aria-label={vi.week.chart(items)} data-testid="week-chart">
        {items.map((i) => (
          <div class="chart-col" key={i.dateKey} data-date={i.dateKey} data-minutes={i.minutes}>
            <span class="chart-num">{i.minutes}</span>
            <div class="chart-track">
              <div class="chart-bar" style={{ height: `${(i.minutes / top) * 100}%`, minHeight: i.minutes > 0 ? '6px' : '0' }} />
            </div>
            <span class="chart-day">{vi.week.day(i.dateKey)}</span>
          </div>
        ))}
      </div>
      <p class="p-text">{vi.week.total(total)}</p>
    </Section>
  );
}

function WeakSection({ data }: { data: DashData }) {
  const words = weakWords(data.progress, 10);
  return (
    <Section id="weak" title={vi.weak.title}>
      {words.length === 0 ? (
        <p class="p-text" data-testid="weak-empty">
          {vi.weak.empty}
        </p>
      ) : (
        <ol class="weak-list">
          {words.map((w) => (
            <li key={w.wordId} class="weak-item" data-testid="weak-item">
              <span class="weak-word">{w.wordId}</span>
              <span class="weak-count">{vi.weak.wrong(w.wrong, w.seen)}</span>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

function ProgressSection({ data }: { data: DashData }) {
  const m = masteryByGrade(data.progress, data.wordGrades);
  return (
    <Section id="progress" title={vi.progress.title}>
      <div class="grade-list">
        {GRADES.map((g) => {
          const e = m[g];
          return (
            <div class="grade-row" key={g} data-testid="grade-row" data-grade={g}>
              <span class="grade-name">{vi.gradeName(g)}</span>
              {!PLAYABLE.includes(g) ? (
                <span class="grade-soon">{vi.progress.soon}</span>
              ) : e.total === 0 ? (
                <span class="grade-soon">{vi.progress.unknown}</span>
              ) : (
                <div class="grade-body">
                  <Meter label={vi.progress.bar(g, e.seen, e.mastered, e.total)} value={e.mastered} extra={e.seen} max={e.total} />
                  <p class="grade-nums">
                    <span>{`${vi.progress.total}: ${e.total}`}</span>
                    <span>{`${vi.progress.seen}: ${e.seen}`}</span>
                    <span>{`${vi.progress.mastered}: ${e.mastered}`}</span>
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function ContentSection({ data }: { data: DashData }) {
  return (
    <Section id="content" title={vi.content.title}>
      <div class="grade-list">
        {(['5', '4'] as const).map((g) => {
          const n = data.counts[g];
          return (
            <div class="grade-row" key={g} data-testid="content-row" data-grade={g}>
              <span class="grade-name">{vi.gradeName(g)}</span>
              <span class="grade-count">{vi.content.count(n)}</span>
              {data.approval && (
                <span class="p-note" data-testid="content-by">
                  {vi.content.byWho(data.approval[g].parent, data.approval[g].ai)}
                </span>
              )}
              {n === 0 && (
                <p class="p-note" data-testid="content-none">
                  {vi.content.none}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {data.approval && (data.approval['5'].ai > 0 || data.approval['4'].ai > 0) && (
        <p class="p-note" data-testid="content-ai-notice">
          {vi.content.aiNotice}
        </p>
      )}
    </Section>
  );
}

function stepLimit(minutes: number, dir: 1 | -1): number {
  const next = dir === 1 ? (Math.floor(minutes / STEP) + 1) * STEP : (Math.ceil(minutes / STEP) - 1) * STEP;
  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, next));
}

function SettingsSection({ store, data, say, reload }: SectionProps) {
  const [changingPin, setChangingPin] = useState<'current' | 'new' | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const minutes = Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.round(data.settings.dailyLimitSeconds / 60)));
  // A tapped-but-not-yet-saved limit; rapid taps build on it instead of on the last render.
  const tapped = useRef<number | null>(null);
  const [, redraw] = useState(0);
  const shown = tapped.current ?? minutes;
  const grade = data.settings.currentGrade ?? '5';

  /** Reads the CURRENT settings first so pin / grade / limit never overwrite each other. Saves run one after another. */
  const save = (change: Partial<Settings>, okMsg: string, settled?: () => void) => {
    queue.current = queue.current.then(async () => {
      try {
        const cur = await store.getSettings();
        await store.putSettings({ ...cur, ...change });
        await reload();
        say(okMsg);
      } catch {
        say(vi.settings.saveFailed);
      }
      settled?.();
    });
  };
  const setLimit = (dir: 1 | -1) => {
    const next = stepLimit(tapped.current ?? minutes, dir);
    if (next === (tapped.current ?? minutes)) return;
    tapped.current = next;
    redraw((n) => n + 1);
    save({ dailyLimitSeconds: next * 60 }, vi.settings.limitSaved, () => {
      if (tapped.current === next) tapped.current = null; // saved and reloaded: the stored value is shown again
      redraw((n) => n + 1);
    });
  };

  return (
    <Section id="settings" title={vi.settings.title}>
      <div class="set-row">
        <span class="set-label" id="limit-label">
          {vi.settings.limit}
        </span>
        <div class="stepper" role="group" aria-labelledby="limit-label">
          <button type="button" class="p-btn p-btn-round" aria-label={vi.settings.less} disabled={shown <= MIN_LIMIT} data-testid="limit-down" onClick={() => setLimit(-1)}>
            {'−'}
          </button>
          <output class="stepper-val" data-testid="limit-value">
            {vi.settings.minutes(shown)}
          </output>
          <button type="button" class="p-btn p-btn-round" aria-label={vi.settings.more} disabled={shown >= MAX_LIMIT} data-testid="limit-up" onClick={() => setLimit(1)}>
            {'+'}
          </button>
        </div>
      </div>

      <div class="set-row">
        <span class="set-label" id="grade-label">
          {vi.settings.grade}
        </span>
        <div class="seg" role="group" aria-labelledby="grade-label">
          {PLAYABLE.map((g) => (
            <button
              type="button"
              key={g}
              class={g === grade ? 'p-btn seg-btn seg-on' : 'p-btn seg-btn'}
              aria-pressed={g === grade}
              data-testid="grade-choice"
              data-grade={g}
              onClick={() => g !== grade && save({ currentGrade: g }, vi.settings.gradeSaved)}
            >
              {vi.gradeName(g)}
            </button>
          ))}
        </div>
      </div>

      <div class="set-row">
        <button type="button" class="p-btn p-btn-soft" data-testid="change-pin" onClick={() => setChangingPin('current')}>
          {vi.settings.changePin}
        </button>
      </div>

      {changingPin && (
        <Dialog id="pin" title={vi.settings.changePinTitle} onCancel={() => setChangingPin(null)}>
          {changingPin === 'current' ? (
            <PinVerify settings={data.settings} prompt={vi.settings.currentPin} onVerified={() => setChangingPin('new')} />
          ) : (
            <CreatePin
              store={store}
              onSaved={() => {
                setChangingPin(null);
                void reload();
                say(vi.settings.pinChanged);
              }}
            />
          )}
        </Dialog>
      )}
    </Section>
  );
}

export function Dashboard({
  store,
  onExit,
  reloadApp,
}: {
  store: Store;
  /** Leaves the corner for the village; leaving unmounts the screen, which locks it again. */
  onExit: () => void;
  reloadApp: () => void;
}) {
  const [data, setData] = useState<DashData | null>(null);
  const [failed, setFailed] = useState(false);
  const [flash, setFlash] = useState('');
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  const reload = async () => {
    try {
      const d = await loadDashData(store);
      if (alive.current) {
        setData(d);
        setFailed(false);
      }
    } catch {
      if (alive.current) setFailed(true);
    }
  };
  useEffect(() => void reload(), [store]);

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(''), 5000);
    return () => clearTimeout(id);
  }, [flash]);

  return (
    <main class="parent parent-dash" data-testid="parent-dash">
      <header class="p-head">
        <h1 class="p-h1">{vi.dash.title}</h1>
        <button type="button" class="p-btn p-btn-soft" data-testid="lock-top" onClick={onExit}>
          {vi.backToVillage}
        </button>
      </header>
      <p class="p-flash" role="status" data-testid="flash" hidden={!flash}>
        {flash}
      </p>
      {data === null ? (
        <p class="p-text" role={failed ? 'alert' : 'status'}>
          {failed ? vi.dash.loadFailed : vi.loading}
        </p>
      ) : (
        <>
          <TodaySection store={store} data={data} say={setFlash} reload={reload} />
          <WeekSection data={data} />
          <WeakSection data={data} />
          <ProgressSection data={data} />
          <ContentSection data={data} />
          <SettingsSection store={store} data={data} say={setFlash} reload={reload} />
          <BackupSection store={store} say={setFlash} reloadApp={reloadApp} />
          <StorageSection store={store} data={data} say={setFlash} />
        </>
      )}
      <div class="p-foot">
        <button type="button" class="p-btn p-btn-primary" data-testid="lock" onClick={onExit}>
          {vi.dash.lock}
        </button>
      </div>
    </main>
  );
}
