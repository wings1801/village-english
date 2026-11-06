import { useEffect, useRef, useState } from 'preact/hooks';
import { BACKGROUNDS, DECOR, ICONS } from '../assets/manifest';
import { placeDecor, type PlacedDecor } from '../domain/village';
import { useStore } from '../store/store-context';
import { DecorLayer } from './decor-layer';
import { navigate } from './router';
import { useSpokenMessage } from './use-spoken';

export const HINT_PLACE = 'どこに かざる？ むらを タッチしてね';
export const HINT_PICK = 'かざりを えらんでね';
export const MSG_SAVE_FAILED = 'ほぞんできなかったよ';

const background = BACKGROUNDS.find((b) => b.id === 'sunny_village_square')!;

export function Decorate() {
  const { store } = useStore();
  const [owned, setOwned] = useState<string[]>([]);
  const [placed, setPlaced] = useState<PlacedDecor[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  // true while the selection came from the tray: the next tap in the village places it there,
  // even on top of another decoration.
  const [armed, setArmed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const scene = useRef<HTMLDivElement>(null);
  const warned = useRef(false);

  useEffect(() => {
    if (!store) return;
    let alive = true;
    Promise.all([store.getOwned(), store.getPlaced()]).then(
      ([o, p]) => {
        if (!alive) return;
        setOwned(o);
        setPlaced(p);
        setLoaded(true);
      },
      (e) => {
        console.warn('decorate: store read failed', e);
        if (alive) setLoaded(true); // taps must not be silently ignored
      },
    );
    return () => {
      alive = false;
    };
  }, [store]);

  const commit = (next: PlacedDecor[]) => {
    setPlaced(next);
    if (!store) return;
    store.putPlaced(next).catch((e) => {
      setSaveFailed(true);
      if (warned.current) return;
      warned.current = true;
      console.warn('decorate: could not save the village', e);
    });
  };

  const onScene = (e: MouseEvent) => {
    if (!selected || !loaded) return;
    const r = scene.current?.getBoundingClientRect();
    if (!r || r.width <= 0 || r.height <= 0) return;
    commit(placeDecor(placed, selected, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height));
    setArmed(false);
  };

  // Tapping a decoration in the village: with a tray item armed it places there, otherwise it selects.
  const pickPlaced = (id: string, e: MouseEvent) => {
    if (armed) return onScene(e);
    setSelected((cur) => (cur === id ? null : id));
  };
  const pickTray = (id: string) => {
    setArmed(selected !== id);
    setSelected((cur) => (cur === id ? null : id));
  };
  const isPlaced = (id: string) => placed.some((p) => p.decorId === id);
  const sel = selected ? DECOR.find((d) => d.id === selected) : undefined;
  const trayItems = DECOR.filter((d) => owned.includes(d.id));
  const placedSelected = !!sel && isPlaced(sel.id);
  const hintText = placedSelected ? null : sel ? HINT_PLACE : trayItems.length > 0 ? HINT_PICK : null;
  useSpokenMessage(saveFailed ? MSG_SAVE_FAILED : hintText);

  return (
    <main class="screen decorate" data-testid="decorate">
      <div class="decor-scene" data-testid="decor-scene" ref={scene} onClick={onScene}>
        <img class="scene-bg" src={background.src} alt="" draggable={false} />
        <DecorLayer placed={placed} selectedId={selected} onPick={pickPlaced} />
      </div>

      <a class="chip credits-link" href="#/credits">
        クレジット
      </a>

      <div class="decor-hint" role="status" aria-live="polite">
        {sel && isPlaced(sel.id) ? (
          <>
            <span class="chip">{sel.nameJa}</span>
            <button
              type="button"
              class="btn btn-soft put-away"
              data-testid="put-away"
              onClick={() => {
                commit(placed.filter((p) => p.decorId !== sel.id));
                setSelected(null);
                setArmed(false);
              }}
            >
              しまう
            </button>
          </>
        ) : sel ? (
          <span class="chip" data-testid="decor-hint">{HINT_PLACE}</span>
        ) : trayItems.length > 0 ? (
          <span class="chip" data-testid="decor-hint">{HINT_PICK}</span>
        ) : null}
        {saveFailed && (
          <span class="chip" data-testid="save-failed">
            {MSG_SAVE_FAILED}
          </span>
        )}
      </div>

      <button type="button" class="btn btn-primary done-btn" data-testid="done" onClick={() => navigate('#/')}>
        できた！
      </button>

      <div class="tray" data-testid="tray">
        {trayItems.length === 0 ? (
          <div class="tray-empty">
            <span class="chip">{loaded || !store ? 'おみせで かざりを かおう' : '…'}</span>
            <button type="button" class="btn btn-soft" onClick={() => navigate('#/shop')}>
              <img src={ICONS.shopping_basket} alt="" width="40" height="40" draggable={false} />
              おみせ
            </button>
          </div>
        ) : (
          trayItems.map((d) => (
            <button
              key={d.id}
              type="button"
              class={`tray-item${selected === d.id ? ' tray-selected' : ''}${isPlaced(d.id) ? ' tray-placed' : ''}`}
              data-testid="tray-item"
              data-decor-id={d.id}
              aria-pressed={selected === d.id}
              aria-label={d.nameJa}
              onClick={() => pickTray(d.id)}
            >
              <img src={d.src} alt="" draggable={false} />
              <span class="chip tray-name">{d.nameJa}</span>
            </button>
          ))
        )}
      </div>
    </main>
  );
}
