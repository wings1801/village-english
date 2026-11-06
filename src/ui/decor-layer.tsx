import { DECOR } from '../assets/manifest';
import type { PlacedDecor } from '../domain/village';

/**
 * Renders placed decoration over a scene (village or decorate screen). Items are drawn in y order so
 * lower items overlap higher ones. Without `onPick` the layer is purely visual (pointer-events none).
 */
export function DecorLayer({
  placed,
  selectedId,
  onPick,
}: {
  placed: PlacedDecor[];
  selectedId?: string | null;
  onPick?: (decorId: string, e: MouseEvent) => void;
}) {
  const items = [...placed].sort((a, b) => a.y - b.y);
  return (
    <div class="decor-layer" data-testid="decor-layer">
      {items.map((p, i) => {
        const d = DECOR.find((x) => x.id === p.decorId);
        if (!d) return null;
        const style = { left: `${p.x * 100}%`, top: `${p.y * 100}%`, zIndex: i + 1 };
        const img = <img src={d.src} alt="" draggable={false} />;
        return onPick ? (
          <button
            key={p.decorId}
            type="button"
            class={`decor decor-btn${selectedId === p.decorId ? ' decor-selected' : ''}`}
            data-testid="decor"
            data-decor-id={p.decorId}
            aria-label={d.nameJa}
            aria-pressed={selectedId === p.decorId}
            style={style}
            onClick={(e) => {
              e.stopPropagation();
              onPick(p.decorId, e);
            }}
          >
            {img}
          </button>
        ) : (
          <span key={p.decorId} class="decor" data-testid="decor" data-decor-id={p.decorId} style={style}>
            {img}
          </span>
        );
      })}
    </div>
  );
}
