import { useEffect, useRef, useState } from 'preact/hooks';
import { DECOR, ICONS, VILLAGERS } from '../assets/manifest';
import { PRICES } from '../domain/village';
import { useStore } from '../store/store-context';
import { navigate } from './router';
import { useSpokenMessage } from './use-spoken';

export const MSG_BOUGHT = 'かったよ！';
export const MSG_TOO_POOR = 'ベルが たりないよ';
export const MSG_CLOSED = 'いまは かえないよ';

const helper = VILLAGERS.find((v) => v.id === 'mimi')!;

export function Shop() {
  const { store } = useStore();
  const [bells, setBells] = useState(0);
  const [owned, setOwned] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ text: string; happy: boolean; n: number } | null>(null);
  const pending = useRef(false);
  const warned = useRef(false);

  useEffect(() => {
    if (!store) return;
    let alive = true;
    const warn = (e: unknown) => console.warn('shop: store read failed', e);
    store.getBells().then((n) => alive && setBells(n), warn);
    store.getOwned().then((o) => alive && setOwned(o), warn);
    return () => {
      alive = false;
    };
  }, [store]);

  useSpokenMessage(msg?.text ?? null, 'ja-JP', msg?.n ?? 0);

  const say = (text: string, happy = false) => setMsg((m) => ({ text, happy, n: (m?.n ?? 0) + 1 }));

  const tryBuy = async (id: string) => {
    if (pending.current) return; // one purchase per tap
    if (owned.includes(id)) return;
    if (!store) return say(MSG_CLOSED);
    if (bells < PRICES[id]) return say(MSG_TOO_POOR);
    pending.current = true;
    try {
      const r = await store.buyDecor(id, PRICES[id]);
      setBells(r.bells);
      setOwned(r.owned);
      if (r.ok) say(MSG_BOUGHT, true);
      else say(r.bells < PRICES[id] ? MSG_TOO_POOR : MSG_CLOSED);
    } catch (e) {
      if (!warned.current) {
        warned.current = true;
        console.warn('shop: could not buy', e);
      }
      say(MSG_CLOSED);
    } finally {
      pending.current = false;
    }
  };

  return (
    <main class="screen shop" data-testid="shop">
      <header class="shop-top">
        <button type="button" class="btn btn-soft shop-back" onClick={() => navigate('#/')}>
          もどる
        </button>
        <h1 class="chip shop-title">おみせ</h1>
        <div class="chip bells-chip" data-testid="bells" aria-label={`ベル ${bells}`}>
          <img src={ICONS.coin} alt="" width="40" height="40" draggable={false} />
          <span>{bells}</span>
        </div>
      </header>

      <div class="shop-status" role="status" aria-live="polite">
        {msg && (
          <div key={msg.n} class="chip shop-msg" data-testid="shop-msg">
            {msg.happy && (
              <img class="shop-msg-img" src={helper.poses.happy} alt="" width="56" height="56" draggable={false} />
            )}
            <span>{msg.text}</span>
          </div>
        )}
      </div>

      <div class="shop-scroll">
      <ul class="shop-grid">
        {DECOR.map((d) => {
          const have = owned.includes(d.id);
          const poor = !have && (!store || bells < PRICES[d.id]);
          return (
            <li key={d.id} class={`shop-item${have ? ' shop-owned' : ''}`} data-testid="shop-item" data-decor-id={d.id}>
              <img class="shop-pic" src={d.src} alt="" draggable={false} />
              <span class="chip shop-name">{d.nameJa}</span>
              <span class="shop-price">
                <img src={ICONS.coin} alt="" width="32" height="32" draggable={false} />
                <span>{PRICES[d.id]}</span>
              </span>
              <button
                type="button"
                class={`btn shop-buy${poor ? ' shop-dim' : ''}`}
                data-testid="buy"
                disabled={have}
                aria-disabled={poor || have ? 'true' : 'false'}
                aria-label={`${d.nameJa}を${have ? 'もっているよ' : 'かう'}`}
                onClick={() => void tryBuy(d.id)}
              >
                {have ? 'もっているよ' : 'かう'}
              </button>
            </li>
          );
        })}
      </ul>
      </div>
      <div class="shop-gutter" aria-hidden="true" />
    </main>
  );
}
