import type { ComponentChildren } from 'preact';

export interface RubyPair {
  base: string;
  rt: string;
}
export type RubyPart = { type: 'text'; text: string } | { type: 'ruby'; pairs: RubyPair[] };

const RUBY_CHUNK = /(<ruby>[\s\S]*?<\/ruby>)/;
const RP = '(?:<rp>[^<>]*<\/rp>)?';
// Strict subset: <ruby>(base [<rp>] <rt>kana</rt> [<rp>])+</ruby>, no attributes, no other tags.
const RUBY_STRICT = new RegExp(`^<ruby>((?:[^<>]*${RP}<rt>[^<>]*<\/rt>${RP})+)<\/ruby>$`);
const PAIR = new RegExp(`([^<>]*)${RP}<rt>([^<>]*)<\/rt>${RP}`, 'g');

/** Splits a prompt into text and ruby parts. Anything outside the allowed subset stays plain text. */
export function parseRuby(input: string): RubyPart[] {
  const parts: RubyPart[] = [];
  const pushText = (text: string) => {
    if (text === '') return;
    const last = parts[parts.length - 1];
    if (last?.type === 'text') last.text += text;
    else parts.push({ type: 'text', text });
  };
  for (const chunk of input.split(RUBY_CHUNK)) {
    const m = RUBY_STRICT.exec(chunk);
    if (!m) {
      pushText(chunk);
      continue;
    }
    const pairs: RubyPair[] = [];
    for (const p of m[1].matchAll(PAIR)) pairs.push({ base: p[1], rt: p[2] });
    parts.push({ type: 'ruby', pairs });
  }
  return parts;
}

/** Renders promptJa with real <ruby>/<rt> elements, never via innerHTML. */
export function RubyText({ text, class: cls }: { text: string; class?: string }) {
  const kids: ComponentChildren[] = parseRuby(text).map((p, i) =>
    p.type === 'text' ? (
      p.text
    ) : (
      <ruby key={i}>
        {p.pairs.map((pr) => [pr.base, <rt>{pr.rt}</rt>])}
      </ruby>
    ),
  );
  return <span class={cls}>{kids}</span>;
}
