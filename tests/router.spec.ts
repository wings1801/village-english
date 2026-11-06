import { describe, expect, it } from 'vitest';
import { parseRoute } from '../src/ui/router';

describe('parseRoute', () => {
  it('parses all eight routes', () => {
    expect(parseRoute('#/')).toEqual({ name: 'village' });
    expect(parseRoute('#/map')).toEqual({ name: 'map' });
    expect(parseRoute('#/quest/mimi')).toEqual({ name: 'quest', villagerId: 'mimi' });
    expect(parseRoute('#/credits')).toEqual({ name: 'credits' });
    expect(parseRoute('#/probe')).toEqual({ name: 'probe' });
    expect(parseRoute('#/parent')).toEqual({ name: 'parent' });
    expect(parseRoute('#/shop')).toEqual({ name: 'shop' });
    expect(parseRoute('#/decorate')).toEqual({ name: 'decorate' });
    expect(parseRoute('#/shop/x')).toEqual({ name: 'village' });
  });
  it('strips trailing slash and query', () => {
    expect(parseRoute('#/map/')).toEqual({ name: 'map' });
    expect(parseRoute('#/credits?x=1')).toEqual({ name: 'credits' });
    expect(parseRoute('#/quest/hana/?a=b')).toEqual({ name: 'quest', villagerId: 'hana' });
  });
  it('falls back to village for unknown or empty hashes', () => {
    expect(parseRoute('')).toEqual({ name: 'village' });
    expect(parseRoute('#')).toEqual({ name: 'village' });
    expect(parseRoute('#/nope')).toEqual({ name: 'village' });
    expect(parseRoute('#/quest')).toEqual({ name: 'village' });
    expect(parseRoute('#/quest/')).toEqual({ name: 'village' });
  });
  it('decodes an encoded villager id', () => {
    expect(parseRoute('#/quest/a%20b')).toEqual({ name: 'quest', villagerId: 'a b' });
    expect(parseRoute('#/quest/%E3%81%AB')).toEqual({ name: 'quest', villagerId: 'に' });
  });
  it('does not throw on malformed encoding', () => {
    expect(parseRoute('#/quest/%E0%A4%A')).toEqual({ name: 'village' });
  });
});
