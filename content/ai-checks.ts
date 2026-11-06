import { validateQuestion } from './schema';
import type { Question } from '../src/domain/types';

/**
 * Pure automated checks used by `npm run ai-approve`. Each returns a list of human-readable problems
 * (empty = passed). They never read files; the caller says which emoji files exist.
 */
export interface CheckContext {
  imageExists: (imageId: string) => boolean;
}

const MAX_PROMPT_EN = 200;
const MAX_CHOICE_EN = 60;
const norm = (s: string): string => s.trim().toLowerCase();

export function checkChoices(q: Question): string[] {
  if (q.kind === 'letter-tiles') return [];
  const choices = q.choices ?? [];
  const out: string[] = [];
  const ids = choices.map((c) => c.id);
  if (new Set(ids).size !== ids.length) out.push('choice ids are not unique');
  if (choices.filter((c) => c.id === q.answer).length !== 1) out.push('answer must equal exactly one choice id');
  return out;
}

export function checkChoiceTexts(q: Question): string[] {
  const texts = (q.choices ?? []).map((c) => c.textEn).filter((t): t is string => typeof t === 'string' && t.trim() !== '');
  const seen = new Set<string>();
  for (const t of texts) {
    if (seen.has(norm(t))) return [`duplicate choice text "${t}"`];
    seen.add(norm(t));
  }
  return [];
}

export function checkImages(q: Question, ctx: CheckContext): string[] {
  const ids = [q.imageId, ...(q.choices ?? []).map((c) => c.imageId)].filter((x): x is string => typeof x === 'string' && x !== '');
  return [...new Set(ids)].filter((id) => !ctx.imageExists(id)).map((id) => `missing emoji file public/assets/emoji/${id}.svg`);
}

export function checkSourceComplete(src: Question['source']): string[] {
  const out: string[] = [];
  if (!src || typeof src.name !== 'string' || src.name.trim() === '') out.push('source.name missing');
  if (!src || typeof src.license !== 'string' || src.license.trim() === '') out.push('source.license missing');
  else if (/(^|[^a-z])by([^a-z]|$)|citation|attribution/i.test(src.license) && !src.url && !src.author) {
    out.push('source needs an author or url for an attribution licence');
  }
  return out;
}

export function checkTextLength(q: Question): string[] {
  const out: string[] = [];
  if (q.promptEn && q.promptEn.length > MAX_PROMPT_EN) out.push(`promptEn too long (${q.promptEn.length} > ${MAX_PROMPT_EN})`);
  if (q.speakEn && q.speakEn.length > MAX_PROMPT_EN) out.push(`speakEn too long (${q.speakEn.length} > ${MAX_PROMPT_EN})`);
  for (const c of q.choices ?? []) {
    if (c.textEn && c.textEn.length > MAX_CHOICE_EN) out.push(`choice ${c.id} text too long (${c.textEn.length} > ${MAX_CHOICE_EN})`);
  }
  return out;
}

export function checkLetterTiles(q: Question): string[] {
  if (q.kind !== 'letter-tiles') return [];
  const words = (q.promptEn ?? '').toLowerCase().match(/[a-z]+/g) ?? ([] as string[]);
  return words.includes(q.answer.toLowerCase()) ? ['letter-tiles prompt contains the answer word (gives it away)'] : [];
}

export function checkAnswerTextUnique(q: Question): string[] {
  if (q.kind !== 'pick-picture' && q.kind !== 'listen-pick') return [];
  const right = (q.choices ?? []).find((c) => c.id === q.answer);
  if (!right?.textEn) return [];
  const dup = (q.choices ?? []).filter((c) => c.id !== q.answer && c.textEn && norm(c.textEn) === norm(right.textEn!));
  return dup.length ? [`another choice has the same text as the answer ("${right.textEn}")`] : [];
}

export function checkBlank(q: Question): string[] {
  if (q.kind !== 'pick-word' && q.kind !== 'dialogue-choice') return [];
  const n = (q.promptEn ?? '').split('___').length - 1;
  return n === 1 ? [] : [`promptEn must contain exactly one ___ (found ${n})`];
}

/** Runs the schema validator and every extra check; returns all reasons (empty = may be AI-approved). */
export function checkQuestion(q: Question, ctx: CheckContext): string[] {
  const v = validateQuestion(q);
  if (!v.ok) return v.errors;
  return [
    ...checkChoices(q),
    ...checkChoiceTexts(q),
    ...checkAnswerTextUnique(q),
    ...checkImages(q, ctx),
    ...checkSourceComplete(q.source),
    ...checkTextLength(q),
    ...checkLetterTiles(q),
    ...checkBlank(q),
  ];
}
