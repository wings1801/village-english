import { useEffect, useState } from 'preact/hooks';

export type Route =
  | { name: 'village' }
  | { name: 'map' }
  | { name: 'quest'; villagerId: string }
  | { name: 'credits' }
  | { name: 'probe' }
  | { name: 'parent' }
  | { name: 'shop' }
  | { name: 'decorate' };

const VILLAGE: Route = { name: 'village' };

export function parseRoute(hash: string): Route {
  const seg = hash.replace(/^#/, '').split('?')[0].split('/').filter((s) => s !== '');
  switch (seg[0]) {
    case 'map': return seg.length === 1 ? { name: 'map' } : VILLAGE;
    case 'credits': return seg.length === 1 ? { name: 'credits' } : VILLAGE;
    case 'probe': return seg.length === 1 ? { name: 'probe' } : VILLAGE;
    case 'shop': return seg.length === 1 ? { name: 'shop' } : VILLAGE;
    case 'decorate': return seg.length === 1 ? { name: 'decorate' } : VILLAGE;
    case 'parent': return seg.length === 1 ? { name: 'parent' } : VILLAGE;
    case 'quest': {
      if (seg.length !== 2) return VILLAGE;
      try {
        const villagerId = decodeURIComponent(seg[1]);
        return villagerId ? { name: 'quest', villagerId } : VILLAGE;
      } catch {
        return VILLAGE;
      }
    }
    default: return VILLAGE;
  }
}

export function navigate(to: string): void {
  window.location.hash = to.startsWith('#') ? to : `#${to}`;
}

export function useRoute(): Route {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    onChange();
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return parseRoute(hash);
}
