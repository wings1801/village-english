export type PlacedDecor = { decorId: string; x: number; y: number };

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** Pure: places (or moves) a decor item; x/y are clamped to 0..1. One entry per decorId. */
export function placeDecor(placed: PlacedDecor[], decorId: string, x: number, y: number): PlacedDecor[] {
  const entry: PlacedDecor = { decorId, x: clamp01(x), y: clamp01(y) };
  const i = placed.findIndex((p) => p.decorId === decorId);
  if (i === -1) return [...placed, entry];
  return placed.map((p, idx) => (idx === i ? entry : p));
}

/** Price in bells for each decoration (a 5-question quest earns about 50-60 bells). */
export const PRICES: Record<string, number> = {
  watering_can: 20,
  mushroom_cluster: 20,
  picnic_basket: 30,
  hay_bale: 30,
  vegetable_crate: 30,
  wooden_barrel: 40,
  stepping_stones: 40,
  birdhouse: 40,
  red_mailbox: 50,
  flower_planter: 50,
  street_lantern: 60,
  wooden_signpost: 60,
  wooden_bench: 70,
  campfire: 70,
  festive_bunting: 80,
  windmill_ornament: 90,
  beach_umbrella: 90,
  village_well: 100,
  treasure_chest: 110,
  market_stall: 120,
  flower_arch: 130,
  apple_tree: 140,
  wooden_bridge: 160,
  fountain: 200,
};

/** Pure mirror of the store's buy rule, for previews and tests. */
export function buy(
  state: { bells: number; owned: string[] },
  decorId: string,
): { ok: boolean; bells: number; owned: string[] } {
  const price = Object.hasOwn(PRICES, decorId) ? PRICES[decorId] : undefined;
  if (price === undefined || state.owned.includes(decorId) || !(state.bells >= price)) {
    return { ok: false, bells: state.bells, owned: state.owned };
  }
  return { ok: true, bells: state.bells - price, owned: [...state.owned, decorId] };
}

/**
 * Which villagers are in the village today: a deterministic daily rotation of the stable ordering `all`,
 * so every villager shows up over a cycle of days. `dateKey` is YYYY-MM-DD; anything else (or an impossible
 * date) falls back to the first `count` in the original order.
 */
export function villagersForDay<T>(dateKey: string, all: readonly T[], count = 6): T[] {
  const n = all.length;
  const take = Math.max(0, Math.min(count, n));
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  let offset = 0;
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const ms = Date.UTC(y, mo - 1, d);
    const back = new Date(ms);
    if (back.getUTCFullYear() === y && back.getUTCMonth() === mo - 1 && back.getUTCDate() === d) {
      offset = Math.floor(ms / 86_400_000) % (n || 1);
    }
  }
  return Array.from({ length: take }, (_, i) => all[(offset + i) % n]);
}
