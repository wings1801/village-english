import { useEffect, useState } from 'preact/hooks';
import { BACKGROUNDS, ICONS, VILLAGERS } from '../assets/manifest';
import { dateKey } from '../domain/daily-limit';
import { villagersForDay, type PlacedDecor } from '../domain/village';
import { useStore } from '../store/store-context';
import { DecorLayer } from './decor-layer';
import { navigate } from './router';

// Fixed, pleasant spots (percent of the scene): x is the villager's centre, y is the feet line.
// Today's six villagers (a daily rotation, see villagersForDay) take them in order.
const SPOTS: { x: number; y: number }[] = [
  { x: 17, y: 66 },
  { x: 38, y: 60 },
  { x: 62, y: 62 },
  { x: 83, y: 67 },
  { x: 28, y: 88 },
  { x: 63, y: 89 },
];

const background = BACKGROUNDS.find((b) => b.id === 'sunny_village_square')!;

/** `today` (YYYY-MM-DD) is a test seam; it defaults to the device's local date. */
export function Village({ today }: { today?: string } = {}) {
  const { store } = useStore();
  const day = today ?? dateKey(new Date());
  const crowd = villagersForDay(day, VILLAGERS, SPOTS.length);
  const [bells, setBells] = useState(0);
  const [placed, setPlaced] = useState<PlacedDecor[]>([]);

  useEffect(() => {
    if (!store) return;
    let alive = true;
    const warn = (e: unknown) => console.warn('village: store read failed', e);
    store.getBells().then((n) => alive && setBells(n), warn);
    store.getPlaced().then((p) => alive && setPlaced(p), warn);
    return () => {
      alive = false;
    };
  }, [store]);

  return (
    <main class="screen village" data-testid="village">
      <img class="scene-bg" data-testid="village-bg" src={background.src} alt="" draggable={false} />

      <DecorLayer placed={placed} />

      {crowd.map((v, i) => {
        const s = SPOTS[i];
        return (
          <button
            key={v.id}
            type="button"
            class="villager"
            data-testid="villager"
            data-villager-id={v.id}
            data-slot={i}
            aria-label={`${v.nameJa}のところへいく`}
            style={{ left: `${s.x}%`, top: `${s.y}%`, '--delay': `${-i * 0.45}s` }}
            onClick={() => navigate(`#/quest/${encodeURIComponent(v.id)}`)}
          >
            <img class="villager-img" src={v.poses.idle} alt="" draggable={false} />
            <span class="chip villager-name">{v.nameJa}</span>
          </button>
        );
      })}

      <div class="chip bells" data-testid="bells" aria-label={`ベル ${bells}`}>
        <img src={ICONS.coin} alt="" width="40" height="40" draggable={false} />
        <span>{bells}</span>
      </div>

      <button type="button" class="btn-round map-btn" aria-label="ちず" onClick={() => navigate('#/map')}>
        <img src={ICONS.map_pin} alt="" width="48" height="48" draggable={false} />
        <span>ちず</span>
      </button>

      <button type="button" class="btn-round shop-btn" aria-label="おみせ" onClick={() => navigate('#/shop')}>
        <img src={ICONS.shopping_basket} alt="" width="48" height="48" draggable={false} />
        <span>おみせ</span>
      </button>

      <button type="button" class="btn-round decorate-btn" aria-label="かざる" onClick={() => navigate('#/decorate')}>
        <img src={ICONS.paint_palette} alt="" width="48" height="48" draggable={false} />
        <span>かざる</span>
      </button>

      <button
        type="button"
        class="btn-round gear-btn"
        aria-label="おうちのひと"
        onClick={() => navigate('#/parent')}
      >
        <img src={ICONS.settings_gear} alt="" width="32" height="32" draggable={false} />
      </button>
    </main>
  );
}
